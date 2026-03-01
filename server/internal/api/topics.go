package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/kpanel/kpanel/internal/kafka"
)

type topicSummary struct {
	Name                      string `json:"name"`
	Partitions                int    `json:"partitions"`
	ReplicationFactor         int    `json:"replication_factor"`
	Internal                  bool   `json:"internal"`
	ISRHealth                 string `json:"isr_health"` // "healthy" | "degraded"
	UnderReplicatedPartitions int    `json:"under_replicated_partitions"`
}

type partitionDetail struct {
	Partition      int32   `json:"partition"`
	Leader         int32   `json:"leader"`
	Replicas       []int32 `json:"replicas"`
	ISR            []int32 `json:"isr"`
	LogStartOffset int64   `json:"log_start_offset"`
	HighWatermark  int64   `json:"high_watermark"`
}

type topicDetailResponse struct {
	Name       string                 `json:"name"`
	Partitions []partitionDetail      `json:"partitions"`
	Config     map[string]configEntry `json:"config"`
}

type messageResponse struct {
	Partition int32             `json:"partition"`
	Offset    int64             `json:"offset"`
	Timestamp string            `json:"timestamp"`
	Key       *string           `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers"`
	Size      int               `json:"size"`
}

// fetchOffsets concurrently fetches start and end offsets for a topic.
func fetchOffsets(ctx context.Context, adm *kadm.Client, topic string) (
	start kadm.ListedOffsets, end kadm.ListedOffsets, startErr, endErr error,
) {
	type result struct {
		offsets kadm.ListedOffsets
		err     error
	}
	startCh := make(chan result, 1)
	endCh := make(chan result, 1)
	go func() { o, e := adm.ListStartOffsets(ctx, topic); startCh <- result{o, e} }()
	go func() { o, e := adm.ListEndOffsets(ctx, topic); endCh <- result{o, e} }()
	s, e := <-startCh, <-endCh
	return s.offsets, e.offsets, s.err, e.err
}

// ListTopics godoc
// GET /api/connections/:id/topics
func (h *Handlers) ListTopics(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	details, err := admClient.ListTopics(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	topics := make([]topicSummary, 0, len(details))
	for _, td := range details {
		if td.Err != nil {
			continue
		}
		underReplicated := 0
		replicationFactor := 0
		for _, p := range td.Partitions {
			if p.Err != nil {
				continue
			}
			if replicationFactor == 0 {
				replicationFactor = len(p.Replicas)
			}
			if len(p.ISR) < len(p.Replicas) {
				underReplicated++
			}
		}
		isrHealth := "healthy"
		if underReplicated > 0 {
			isrHealth = "degraded"
		}
		topics = append(topics, topicSummary{
			Name:                      td.Topic,
			Partitions:                len(td.Partitions),
			ReplicationFactor:         replicationFactor,
			Internal:                  td.IsInternal,
			ISRHealth:                 isrHealth,
			UnderReplicatedPartitions: underReplicated,
		})
	}
	sort.Slice(topics, func(i, j int) bool { return topics[i].Name < topics[j].Name })
	writeJSON(w, http.StatusOK, topics)
}

// GetTopic godoc
// GET /api/connections/:id/topics/:name
func (h *Handlers) GetTopic(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	type detailRes struct {
		details kadm.TopicDetails
		err     error
	}
	type cfgRes struct {
		configs kadm.ResourceConfigs
		err     error
	}

	detailCh := make(chan detailRes, 1)
	cfgCh := make(chan cfgRes, 1)

	go func() { d, e := admClient.ListTopics(ctx, name); detailCh <- detailRes{d, e} }()
	go func() { c, e := admClient.DescribeTopicConfigs(ctx, name); cfgCh <- cfgRes{c, e} }()
	startOffsets, endOffsets, startErr, endErr := fetchOffsets(ctx, admClient, name)

	dRes := <-detailCh
	cRes := <-cfgCh

	if dRes.err != nil {
		writeError(w, http.StatusInternalServerError, dRes.err.Error())
		return
	}
	td, exists := dRes.details[name]
	if !exists || td.Err != nil {
		writeError(w, http.StatusNotFound, "topic not found")
		return
	}

	partitions := make([]partitionDetail, 0, len(td.Partitions))
	for partID, p := range td.Partitions {
		if p.Err != nil {
			continue
		}
		logStart := int64(-1)
		hwm := int64(-1)
		if startErr == nil {
			if tOffsets, ok := startOffsets[name]; ok {
				if off, ok := tOffsets[partID]; ok && off.Err == nil {
					logStart = off.Offset
				}
			}
		}
		if endErr == nil {
			if tOffsets, ok := endOffsets[name]; ok {
				if off, ok := tOffsets[partID]; ok && off.Err == nil {
					hwm = off.Offset
				}
			}
		}
		replicas := make([]int32, len(p.Replicas))
		copy(replicas, p.Replicas)
		isr := make([]int32, len(p.ISR))
		copy(isr, p.ISR)
		partitions = append(partitions, partitionDetail{
			Partition:      partID,
			Leader:         p.Leader,
			Replicas:       replicas,
			ISR:            isr,
			LogStartOffset: logStart,
			HighWatermark:  hwm,
		})
	}
	sort.Slice(partitions, func(i, j int) bool { return partitions[i].Partition < partitions[j].Partition })

	configMap := map[string]configEntry{}
	if cRes.err == nil {
		for _, rc := range cRes.configs {
			for _, cfg := range rc.Configs {
				if cfg.Value == nil {
					continue
				}
				configMap[cfg.Key] = configEntry{
					Value:  *cfg.Value,
					Source: configSourceLabel(cfg.Source),
				}
			}
			break
		}
	}

	writeJSON(w, http.StatusOK, topicDetailResponse{
		Name:       name,
		Partitions: partitions,
		Config:     configMap,
	})
}

// PeekMessages godoc
// POST /api/connections/:id/topics/:name/peek
func (h *Handlers) PeekMessages(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	var req struct {
		Limit     int    `json:"limit"`
		Partition *int32 `json:"partition"` // nil = all partitions
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Limit <= 0 || req.Limit > 500 {
		req.Limit = 20
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	startOffsets, endOffsets, startErr, endErr := fetchOffsets(ctx, admClient, name)

	if startErr != nil {
		writeError(w, http.StatusInternalServerError, "list start offsets: "+startErr.Error())
		return
	}
	if endErr != nil {
		writeError(w, http.StatusInternalServerError, "list end offsets: "+endErr.Error())
		return
	}

	topicEndOffsets := endOffsets[name]
	if len(topicEndOffsets) == 0 {
		writeJSON(w, http.StatusOK, []messageResponse{})
		return
	}
	topicStartOffsets := startOffsets[name]

	// Per-partition: where to start consuming and how many messages to expect.
	type consumeRange struct {
		startAt   int64
		wantCount int64
	}
	consumeRanges := map[int32]consumeRange{}
	partitionOffsets := map[int32]kgo.Offset{}

	for partID, endOff := range topicEndOffsets {
		if req.Partition != nil && partID != *req.Partition {
			continue
		}
		if endOff.Err != nil || endOff.Offset <= 0 {
			continue
		}
		logStart := int64(0)
		if startOff, ok := topicStartOffsets[partID]; ok && startOff.Err == nil {
			logStart = startOff.Offset
		}
		startAt := endOff.Offset - int64(req.Limit)
		if startAt < logStart {
			startAt = logStart
		}
		wantCount := endOff.Offset - startAt
		if wantCount <= 0 {
			continue
		}
		consumeRanges[partID] = consumeRange{startAt: startAt, wantCount: wantCount}
		partitionOffsets[partID] = kgo.NewOffset().At(startAt)
	}

	if len(consumeRanges) == 0 {
		writeJSON(w, http.StatusOK, []messageResponse{})
		return
	}

	consumeMap := map[string]map[int32]kgo.Offset{name: partitionOffsets}
	consumerClient, err := kafka.NewRawClient(ctx, cluster, kgo.ConsumePartitions(consumeMap))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer consumerClient.Close()

	var msgs []messageResponse
	totalWanted := int64(0)
	for _, cr := range consumeRanges {
		totalWanted += cr.wantCount
	}
	var totalCollected int64

	fetchCtx, fetchCancel := context.WithCancel(ctx)
	defer fetchCancel()

	for totalCollected < totalWanted {
		fetches := consumerClient.PollFetches(fetchCtx)
		if fetchCtx.Err() != nil {
			break
		}
		fetches.EachRecord(func(rec *kgo.Record) {
			if rec.Topic != name {
				return
			}
			cr, ok := consumeRanges[rec.Partition]
			if !ok {
				return
			}
			if rec.Offset < cr.startAt || rec.Offset >= cr.startAt+cr.wantCount {
				return
			}
			var key *string
			if len(rec.Key) > 0 {
				s := string(rec.Key)
				key = &s
			}
			headers := map[string]string{}
			for _, h := range rec.Headers {
				headers[h.Key] = string(h.Value)
			}
			msgs = append(msgs, messageResponse{
				Partition: rec.Partition,
				Offset:    rec.Offset,
				Timestamp: rec.Timestamp.UTC().Format(time.RFC3339),
				Key:       key,
				Value:     string(rec.Value),
				Headers:   headers,
				Size:      len(rec.Key) + len(rec.Value),
			})
			totalCollected++
			if totalCollected >= totalWanted {
				fetchCancel()
			}
		})
	}

	sort.Slice(msgs, func(i, j int) bool {
		if msgs[i].Timestamp != msgs[j].Timestamp {
			return msgs[i].Timestamp > msgs[j].Timestamp // newest first
		}
		if msgs[i].Partition != msgs[j].Partition {
			return msgs[i].Partition < msgs[j].Partition
		}
		return msgs[i].Offset > msgs[j].Offset
	})
	writeJSON(w, http.StatusOK, msgs)
}
