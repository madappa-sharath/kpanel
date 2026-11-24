package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/twmb/franz-go/pkg/kerr"
)

const (
	lagSampleInterval = 5 * time.Second
	lagRetention      = 2 * time.Hour
	lagWatchTTL       = 2 * time.Hour // keep sampling this long after the last view
	lagRateMaxGap     = 4 * lagSampleInterval
)

// LagSnapshot is a point-in-time lag measurement for a consumer group.
// Rates are msgs/s since the previous snapshot; nil when not comparable.
type LagSnapshot struct {
	Ts          int64            `json:"ts"` // unix milliseconds
	TotalLag    int64            `json:"total_lag"`
	ByTopic     map[string]int64 `json:"by_topic"`
	ProduceRate *float64         `json:"produce_rate"`
	ConsumeRate *float64         `json:"consume_rate"`
	// Partitions whose committed offset moved since the previous snapshot.
	Commits *int `json:"commits"`
	// The same rates per topic, so one stuck topic can't hide behind a busy one.
	TopicRates map[string]TopicRate `json:"topic_rates,omitempty"`
}

type TopicRate struct {
	ProduceRate float64 `json:"produce_rate"`
	ConsumeRate float64 `json:"consume_rate"`
	Commits     int     `json:"commits"`
}

type lagHistoryResponse struct {
	IntervalMs    int64         `json:"interval_ms"`
	RetentionMs   int64         `json:"retention_ms"`
	WatchTTLMs    int64         `json:"watch_ttl_ms"`
	SamplingSince int64         `json:"sampling_since"`
	LastError     string        `json:"last_error,omitempty"`
	Snapshots     []LagSnapshot `json:"snapshots"`
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

type offsetDelta struct {
	produce, consume *float64
	commits          *int
	byTopic          map[string]TopicRate
}

// offsetRates counts production on every partition, since all of it adds to
// lag, and consumption only where both samples have a commit to compare.
func offsetRates(prev, cur map[topicPartition]partitionOffsets, dtMs int64) offsetDelta {
	if dtMs <= 0 {
		return offsetDelta{}
	}
	type counts struct {
		produced, consumed int64
		commits            int
	}
	topics := map[string]*counts{}
	for tp, c := range cur {
		p, ok := prev[tp]
		if !ok {
			continue
		}
		t := topics[tp.topic]
		if t == nil {
			t = &counts{}
			topics[tp.topic] = t
		}
		if dEnd := c.end - p.end; dEnd > 0 {
			t.produced += dEnd
		}
		if p.committed < 0 || c.committed < 0 {
			continue
		}
		if dCommit := c.committed - p.committed; dCommit > 0 {
			t.consumed += dCommit
			t.commits++
		}
	}
	if len(topics) == 0 {
		return offsetDelta{}
	}
	secs := float64(dtMs) / 1000
	var total counts
	byTopic := make(map[string]TopicRate, len(topics))
	for topic, t := range topics {
		total.produced += t.produced
		total.consumed += t.consumed
		total.commits += t.commits
		byTopic[topic] = TopicRate{float64(t.produced) / secs, float64(t.consumed) / secs, t.commits}
	}
	pr, cr := float64(total.produced)/secs, float64(total.consumed)/secs
	return offsetDelta{produce: &pr, consume: &cr, commits: &total.commits, byTopic: byTopic}
}

// lagSeries is the sampled history of one consumer group.
type lagSeries struct {
	mu          sync.Mutex
	snapshots   []LagSnapshot
	retentionMs int64
	lastOffsets map[topicPartition]partitionOffsets
	resetAt     int64  // unix ms of the last offset reset made through kpanel
	clusterFP   string // connection config the history was sampled with
	startedAt   int64
	lastViewed  time.Time
	lastErr     string
}

func newLagSeries(retention time.Duration, now time.Time) *lagSeries {
	return &lagSeries{retentionMs: retention.Milliseconds(), startedAt: now.UnixMilli(), lastViewed: now}
}

// record stores snap, filling its rates from the previous snapshot. A sample
// taken before the last reset is dropped.
func (s *lagSeries) record(snap LagSnapshot, offsets map[topicPartition]partitionOffsets) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastErr = ""
	if snap.Ts < s.resetAt {
		return
	}
	if n := len(s.snapshots); n > 0 {
		dt := snap.Ts - s.snapshots[n-1].Ts
		if dt <= 0 {
			return
		}
		if s.lastOffsets != nil && dt <= lagRateMaxGap.Milliseconds() {
			d := offsetRates(s.lastOffsets, offsets, dt)
			snap.ProduceRate, snap.ConsumeRate, snap.Commits, snap.TopicRates = d.produce, d.consume, d.commits, d.byTopic
		}
	}
	s.lastOffsets = offsets
	s.snapshots = append(s.snapshots, snap)
	drop := 0
	for drop < len(s.snapshots) && s.snapshots[drop].Ts < snap.Ts-s.retentionMs {
		drop++
	}
	s.snapshots = s.snapshots[drop:]
}

func (s *lagSeries) recordError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastErr = err.Error()
}

// resetBaseline stops a reset's offset jump from showing up as consumption.
func (s *lagSeries) resetBaseline(now int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastOffsets = nil
	s.resetAt = now
}

// useCluster drops the history when the connection now points somewhere
// else, so offsets from two clusters are never compared.
func (s *lagSeries) useCluster(fp string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.clusterFP != fp {
		s.clusterFP = fp
		s.snapshots = nil
		s.lastOffsets = nil
	}
}

func (s *lagSeries) touch(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastViewed = now
}

func (s *lagSeries) idle(now time.Time) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	return now.Sub(s.lastViewed)
}

func (s *lagSeries) view() lagHistoryResponse {
	s.mu.Lock()
	defer s.mu.Unlock()
	return lagHistoryResponse{
		IntervalMs:    lagSampleInterval.Milliseconds(),
		RetentionMs:   lagRetention.Milliseconds(),
		WatchTTLMs:    lagWatchTTL.Milliseconds(),
		SamplingSince: s.startedAt,
		LastError:     s.lastErr,
		Snapshots:     append([]LagSnapshot{}, s.snapshots...),
	}
}

// LagStore holds the groups being sampled in the background, per connection.
type LagStore struct {
	mu     sync.Mutex
	series map[string]*lagSeries // "connectionID/groupID"
}

func NewLagStore() *LagStore {
	return &LagStore{series: make(map[string]*lagSeries)}
}

func lagKey(connectionID, groupID string) string {
	return connectionID + "/" + groupID
}

// watch returns the group's series and whether it was just created.
func (ls *LagStore) watch(connectionID, groupID string, now time.Time) (*lagSeries, bool) {
	ls.mu.Lock()
	defer ls.mu.Unlock()
	k := lagKey(connectionID, groupID)
	if s, ok := ls.series[k]; ok {
		s.touch(now)
		return s, false
	}
	s := newLagSeries(lagRetention, now)
	ls.series[k] = s
	return s, true
}

// expire removes s if nobody has viewed it for ttl. It holds the store lock
// so a concurrent watch either renews s first or creates a new series.
func (ls *LagStore) expire(connectionID, groupID string, s *lagSeries, now time.Time, ttl time.Duration) bool {
	ls.mu.Lock()
	defer ls.mu.Unlock()
	if s.idle(now) <= ttl {
		return false
	}
	ls.removeLocked(connectionID, groupID, s)
	return true
}

func (ls *LagStore) remove(connectionID, groupID string, s *lagSeries) {
	ls.mu.Lock()
	defer ls.mu.Unlock()
	ls.removeLocked(connectionID, groupID, s)
}

func (ls *LagStore) removeLocked(connectionID, groupID string, s *lagSeries) {
	k := lagKey(connectionID, groupID)
	if ls.series[k] == s {
		delete(ls.series, k)
	}
}

func (ls *LagStore) resetBaseline(connectionID, groupID string) {
	ls.mu.Lock()
	s := ls.series[lagKey(connectionID, groupID)]
	ls.mu.Unlock()
	if s != nil {
		s.resetBaseline(time.Now().UnixMilli())
	}
}

// runLagSampler samples the group until nobody has viewed it for lagWatchTTL
// or the connection is deleted.
func (h *Handlers) runLagSampler(connectionID, groupID string, s *lagSeries) {
	ticker := time.NewTicker(lagSampleInterval)
	defer ticker.Stop()
	for {
		if h.lagStore.expire(connectionID, groupID, s, time.Now(), lagWatchTTL) {
			return
		}
		cluster, ok := h.store.Get(connectionID)
		if !ok {
			h.lagStore.remove(connectionID, groupID, s)
			return
		}
		s.useCluster(clusterFingerprint(cluster))
		ctx, cancel := context.WithTimeout(context.Background(), 2*lagSampleInterval)
		snap, offsets, err := h.sampleLag(ctx, cluster, groupID)
		cancel()
		if err != nil {
			s.recordError(err)
		} else {
			s.record(snap, offsets)
		}
		<-ticker.C
	}
}

// sampleLag reads committed and end offsets for every partition of the
// group's topics. Lag counts committed partitions only, matching the group
// page; incoming counts all of them. Any partition-level error fails the
// sample rather than recording a partial total.
func (h *Handlers) sampleLag(ctx context.Context, cluster *config.Cluster, groupID string) (LagSnapshot, map[topicPartition]partitionOffsets, error) {
	admClient, err := h.pool.get(cluster)
	if err != nil {
		return LagSnapshot{}, nil, err
	}
	// Before fetching, so the timestamp matches the offsets as closely as possible.
	sampledAt := time.Now().UnixMilli()

	groupResp := admClient.FetchManyOffsets(ctx, groupID)[groupID]
	if groupResp.Err != nil {
		return LagSnapshot{}, nil, fmt.Errorf("fetch committed offsets: %w", groupResp.Err)
	}
	described, err := admClient.DescribeGroups(ctx, groupID)
	if err != nil {
		return LagSnapshot{}, nil, fmt.Errorf("describe group: %w", err)
	}

	topics := map[string]struct{}{}
	for topic := range groupResp.Fetched {
		topics[topic] = struct{}{}
	}
	if g, ok := described[groupID]; ok && g.Err == nil {
		for _, m := range g.Members {
			if asgn, ok := m.Assigned.AsConsumer(); ok {
				for _, t := range asgn.Topics {
					topics[t.Topic] = struct{}{}
				}
			}
		}
	}
	snap := LagSnapshot{Ts: sampledAt, ByTopic: map[string]int64{}}
	offsets := map[topicPartition]partitionOffsets{}
	if len(topics) == 0 {
		// ListEndOffsets with no topics lists every topic in the cluster.
		return snap, offsets, nil
	}
	topicList := make([]string, 0, len(topics))
	for topic := range topics {
		topicList = append(topicList, topic)
	}
	leos, err := admClient.ListEndOffsets(ctx, topicList...)
	if err != nil {
		return LagSnapshot{}, nil, fmt.Errorf("list end offsets: %w", err)
	}

	var failed int
	for topic, parts := range leos {
		for partID, leo := range parts {
			if leo.Err != nil {
				if errors.Is(leo.Err, kerr.UnknownTopicOrPartition) {
					continue // deleted topic with stale commits
				}
				failed++
				continue
			}
			committed := int64(-1)
			if off, ok := groupResp.Fetched[topic][partID]; ok {
				if off.Err != nil {
					failed++
					continue
				}
				committed = off.At
				lag := lagFromOff(off.At, leo.Offset)
				snap.TotalLag += lag
				snap.ByTopic[topic] += lag
			}
			offsets[topicPartition{topic, partID}] = partitionOffsets{committed: committed, end: leo.Offset}
		}
	}
	if failed > 0 {
		return LagSnapshot{}, nil, fmt.Errorf("offsets unavailable for %d partition(s)", failed)
	}
	return snap, offsets, nil
}

// GetLagHistory returns the group's sampled lag history. The first call starts
// a background sampler, which keeps running for lagWatchTTL after the last call.
//
// GET /api/connections/:id/groups/:name/lag-history
func (h *Handlers) GetLagHistory(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	groupID := chi.URLParam(r, "name")
	s, created := h.lagStore.watch(cluster.ID, groupID, time.Now())
	if created {
		go h.runLagSampler(cluster.ID, groupID, s)
	}
	writeJSON(w, http.StatusOK, s.view())
}
