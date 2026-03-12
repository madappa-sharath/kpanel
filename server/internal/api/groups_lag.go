package api

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	lagPollInterval  = 15 * time.Second
	lagHistoryWindow = time.Hour
	lagMaxSnapshots  = int(lagHistoryWindow / lagPollInterval) // 240
)

// LagSnapshot is a point-in-time lag measurement for a consumer group.
type LagSnapshot struct {
	Ts       int64            `json:"ts"` // unix milliseconds
	TotalLag int64            `json:"total_lag"`
	ByTopic  map[string]int64 `json:"by_topic"`
}

// lagRingBuffer holds up to capacity snapshots in insertion order.
type lagRingBuffer struct {
	mu        sync.RWMutex
	snapshots []LagSnapshot
	head      int // next write position
	size      int // current number of stored entries
	capacity  int
}

func newLagRingBuffer(capacity int) *lagRingBuffer {
	return &lagRingBuffer{
		snapshots: make([]LagSnapshot, capacity),
		capacity:  capacity,
	}
}

// appendIfNew appends snap only if the buffer is empty or the last snapshot's
// timestamp is at least minGapMs milliseconds before snap.Ts. Returns all
// snapshots in chronological order under a single write lock.
func (b *lagRingBuffer) appendIfNew(snap LagSnapshot, minGapMs int64) []LagSnapshot {
	b.mu.Lock()
	defer b.mu.Unlock()
	shouldAppend := b.size == 0
	if !shouldAppend {
		last := b.snapshots[(b.head-1+b.capacity)%b.capacity]
		shouldAppend = snap.Ts-last.Ts >= minGapMs
	}
	if shouldAppend {
		b.snapshots[b.head] = snap
		b.head = (b.head + 1) % b.capacity
		if b.size < b.capacity {
			b.size++
		}
	}
	result := make([]LagSnapshot, b.size)
	start := (b.head - b.size + b.capacity) % b.capacity
	for i := 0; i < b.size; i++ {
		result[i] = b.snapshots[(start+i)%b.capacity]
	}
	return result
}

// LagStore holds in-memory lag history for consumer groups across connections.
type LagStore struct {
	mu      sync.RWMutex
	buffers map[string]*lagRingBuffer // "connectionID/groupID" → ring buffer
}

func NewLagStore() *LagStore {
	return &LagStore{buffers: make(map[string]*lagRingBuffer)}
}

func (ls *LagStore) key(connectionID, groupID string) string {
	return connectionID + "/" + groupID
}

func (ls *LagStore) getOrCreate(connectionID, groupID string) *lagRingBuffer {
	k := ls.key(connectionID, groupID)
	ls.mu.Lock()
	defer ls.mu.Unlock()
	if b, ok := ls.buffers[k]; ok {
		return b
	}
	b := newLagRingBuffer(lagMaxSnapshots)
	ls.buffers[k] = b
	return b
}

func (ls *LagStore) appendIfNew(connectionID, groupID string, snap LagSnapshot, minGapMs int64) []LagSnapshot {
	return ls.getOrCreate(connectionID, groupID).appendIfNew(snap, minGapMs)
}

// GetLagHistory fetches the current lag for a consumer group, stores it in the
// in-memory ring buffer, and returns the full history accumulated so far.
// Callers (the frontend Lag tab) should poll this every ~15 seconds to build
// a live time-series without requiring a background server-side goroutine.
//
// GET /api/connections/:id/groups/:name/lag-history
func (h *Handlers) GetLagHistory(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	groupID := chi.URLParam(r, "name")

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	admClient, err := h.pool.get(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Batch-fetch committed offsets for this group.
	fetchedOffsets := admClient.FetchManyOffsets(ctx, groupID)
	groupResp := fetchedOffsets[groupID]

	topicList := make([]string, 0, len(groupResp.Fetched))
	for topic := range groupResp.Fetched {
		topicList = append(topicList, topic)
	}
	leos, err := admClient.ListEndOffsets(ctx, topicList...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list end offsets: "+err.Error())
		return
	}

	// Compute the current lag snapshot.
	byTopic := map[string]int64{}
	var totalLag int64
	for topic, partOffsets := range groupResp.Fetched {
		topicEnd := leos[topic]
		for partID, off := range partOffsets {
			if off.Err != nil {
				continue
			}
			if leo, ok2 := topicEnd[partID]; ok2 && leo.Err == nil {
				lag := lagFromOff(off.At, leo.Offset)
				totalLag += lag
				byTopic[topic] += lag
			}
		}
	}

	snap := LagSnapshot{
		Ts:       time.Now().UnixMilli(),
		TotalLag: totalLag,
		ByTopic:  byTopic,
	}

	minGapMs := int64(lagPollInterval / 2 / time.Millisecond)
	history := h.lagStore.appendIfNew(cluster.ID, groupID, snap, minGapMs)
	if history == nil {
		history = []LagSnapshot{}
	}
	writeJSON(w, http.StatusOK, history)
}
