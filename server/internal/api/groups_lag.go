package api

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/kafka"
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

// lagRingBuffer holds up to cap snapshots in insertion order.
type lagRingBuffer struct {
	mu        sync.RWMutex
	snapshots []LagSnapshot
	head      int // next write position
	size      int // current number of stored entries
	cap       int
}

func newLagRingBuffer(capacity int) *lagRingBuffer {
	return &lagRingBuffer{
		snapshots: make([]LagSnapshot, capacity),
		cap:       capacity,
	}
}

func (b *lagRingBuffer) append(s LagSnapshot) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.snapshots[b.head] = s
	b.head = (b.head + 1) % b.cap
	if b.size < b.cap {
		b.size++
	}
}

// getAll returns all snapshots in chronological order (oldest first).
func (b *lagRingBuffer) getAll() []LagSnapshot {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if b.size == 0 {
		return nil
	}
	result := make([]LagSnapshot, b.size)
	start := (b.head - b.size + b.cap) % b.cap
	for i := 0; i < b.size; i++ {
		result[i] = b.snapshots[(start+i)%b.cap]
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

func (ls *LagStore) appendSnapshot(connectionID, groupID string, snap LagSnapshot) {
	ls.getOrCreate(connectionID, groupID).append(snap)
}

func (ls *LagStore) getHistory(connectionID, groupID string) []LagSnapshot {
	k := ls.key(connectionID, groupID)
	ls.mu.RLock()
	b, ok := ls.buffers[k]
	ls.mu.RUnlock()
	if !ok {
		return nil
	}
	return b.getAll()
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
	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

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

	// Deduplicate: skip appending if the last snapshot was within half the poll interval.
	history := h.lagStore.getHistory(cluster.ID, groupID)
	shouldAppend := true
	if len(history) > 0 {
		lastTs := history[len(history)-1].Ts
		if snap.Ts-lastTs < int64(lagPollInterval/2/time.Millisecond) {
			shouldAppend = false
		}
	}
	if shouldAppend {
		h.lagStore.appendSnapshot(cluster.ID, groupID, snap)
		history = h.lagStore.getHistory(cluster.ID, groupID)
	}

	if history == nil {
		history = []LagSnapshot{}
	}
	writeJSON(w, http.StatusOK, history)
}
