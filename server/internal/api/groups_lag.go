package api

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	lagPollInterval  = 15 * time.Second
	lagHistoryWindow = time.Hour
	lagMaxSnapshots  = int(lagHistoryWindow / lagPollInterval) // 240
	lagRateMaxGap    = 8 * lagPollInterval
)

// LagSnapshot is a point-in-time lag measurement for a consumer group.
// Rates are msgs/s since the previous snapshot; nil when not comparable.
type LagSnapshot struct {
	Ts          int64            `json:"ts"` // unix milliseconds
	TotalLag    int64            `json:"total_lag"`
	ByTopic     map[string]int64 `json:"by_topic"`
	ProduceRate *float64         `json:"produce_rate"`
	ConsumeRate *float64         `json:"consume_rate"`
}

type topicPartition struct {
	topic     string
	partition int32
}

// committed is negative when the group has no commit yet.
type partitionOffsets struct {
	committed int64
	end       int64
}

// offsetRates uses the same partitions for both rates so they are comparable.
func offsetRates(prev, cur map[topicPartition]partitionOffsets, dtMs int64) (produce, consume *float64) {
	if dtMs <= 0 {
		return nil, nil
	}
	var produced, consumed int64
	var n int
	for tp, c := range cur {
		p, ok := prev[tp]
		if !ok || p.committed < 0 || c.committed < 0 {
			continue
		}
		dEnd, dCommit := c.end-p.end, c.committed-p.committed
		if dEnd < 0 || dCommit < 0 {
			continue
		}
		produced += dEnd
		consumed += dCommit
		n++
	}
	if n == 0 {
		return nil, nil
	}
	secs := float64(dtMs) / 1000
	pr, cr := float64(produced)/secs, float64(consumed)/secs
	return &pr, &cr
}

// lagRingBuffer holds up to capacity snapshots in insertion order.
type lagRingBuffer struct {
	mu          sync.RWMutex
	snapshots   []LagSnapshot
	head        int // next write position
	size        int // current number of stored entries
	capacity    int
	lastOffsets map[topicPartition]partitionOffsets
	resetAt     int64 // unix ms of the last offset reset made through kpanel
}

func newLagRingBuffer(capacity int) *lagRingBuffer {
	return &lagRingBuffer{
		snapshots: make([]LagSnapshot, capacity),
		capacity:  capacity,
	}
}

// appendIfNew appends snap only if the buffer is empty or the last snapshot's
// timestamp is at least minGapMs milliseconds before snap.Ts, and snap.Ts is
// after the last reset. Returns all snapshots in chronological order.
func (b *lagRingBuffer) appendIfNew(snap LagSnapshot, offsets map[topicPartition]partitionOffsets, minGapMs int64) []LagSnapshot {
	b.mu.Lock()
	defer b.mu.Unlock()
	shouldAppend := snap.Ts >= b.resetAt
	if shouldAppend && b.size > 0 {
		last := b.snapshots[(b.head-1+b.capacity)%b.capacity]
		dt := snap.Ts - last.Ts
		shouldAppend = dt >= minGapMs
		if shouldAppend && dt <= lagRateMaxGap.Milliseconds() {
			snap.ProduceRate, snap.ConsumeRate = offsetRates(b.lastOffsets, offsets, dt)
		}
	}
	if shouldAppend {
		b.lastOffsets = offsets
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

// resetBaseline stops a reset's offset jump from showing up as consumption.
func (b *lagRingBuffer) resetBaseline(now int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.lastOffsets = nil
	b.resetAt = now
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

func (ls *LagStore) appendIfNew(connectionID, groupID string, snap LagSnapshot, offsets map[topicPartition]partitionOffsets, minGapMs int64) []LagSnapshot {
	return ls.getOrCreate(connectionID, groupID).appendIfNew(snap, offsets, minGapMs)
}

func (ls *LagStore) resetBaseline(connectionID, groupID string) {
	ls.getOrCreate(connectionID, groupID).resetBaseline(time.Now().UnixMilli())
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

	// Before fetching, so a slow poll can't land after a newer one.
	sampledAt := time.Now().UnixMilli()

	// Batch-fetch committed offsets for this group.
	fetchedOffsets := admClient.FetchManyOffsets(ctx, groupID)
	groupResp := fetchedOffsets[groupID]
	if groupResp.Err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("fetch committed offsets: %v", groupResp.Err))
		return
	}

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
	offsets := map[topicPartition]partitionOffsets{}
	var totalLag int64
	for topic, partOffsets := range groupResp.Fetched {
		topicEnd := leos[topic]
		for partID, off := range partOffsets {
			if off.Err != nil {
				continue
			}
			if leo, ok2 := topicEnd[partID]; ok2 && leo.Err == nil {
				offsets[topicPartition{topic, partID}] = partitionOffsets{committed: off.At, end: leo.Offset}
				lag := lagFromOff(off.At, leo.Offset)
				totalLag += lag
				byTopic[topic] += lag
			}
		}
	}

	snap := LagSnapshot{
		Ts:       sampledAt,
		TotalLag: totalLag,
		ByTopic:  byTopic,
	}

	minGapMs := int64(lagPollInterval / 2 / time.Millisecond)
	history := h.lagStore.appendIfNew(cluster.ID, groupID, snap, offsets, minGapMs)
	if history == nil {
		history = []LagSnapshot{}
	}
	writeJSON(w, http.StatusOK, history)
}
