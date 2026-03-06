package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/kafka"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
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

func topicAdminErrorStatus(err error) int {
	switch {
	case errors.Is(err, kerr.TopicAlreadyExists):
		return http.StatusConflict
	case errors.Is(err, kerr.UnknownTopicOrPartition):
		return http.StatusNotFound
	case errors.Is(err, kerr.InvalidRequest),
		errors.Is(err, kerr.InvalidTopicException),
		errors.Is(err, kerr.InvalidPartitions),
		errors.Is(err, kerr.InvalidReplicationFactor),
		errors.Is(err, kerr.PolicyViolation),
		errors.Is(err, kerr.TopicDeletionDisabled):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

func writeTopicAdminResponse(w http.ResponseWriter, err error) {
	writeError(w, topicAdminErrorStatus(err), err.Error())
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

// CreateTopic godoc
// POST /api/connections/:id/topics
func (h *Handlers) CreateTopic(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	var req struct {
		Name              string `json:"name"`
		Partitions        int32  `json:"partitions"`
		ReplicationFactor int16  `json:"replication_factor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Partitions < 1 {
		writeError(w, http.StatusBadRequest, "partitions must be >= 1")
		return
	}
	if req.ReplicationFactor < 1 {
		writeError(w, http.StatusBadRequest, "replication_factor must be >= 1")
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

	responses, err := admClient.CreateTopics(ctx, req.Partitions, req.ReplicationFactor, nil, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create topic: "+err.Error())
		return
	}
	resp, exists := responses[req.Name]
	if !exists {
		writeError(w, http.StatusInternalServerError, "create topic: missing response for topic")
		return
	}
	if resp.Err != nil {
		writeTopicAdminResponse(w, resp.Err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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

// DeleteTopic godoc
// DELETE /api/connections/:id/topics/:name
func (h *Handlers) DeleteTopic(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "topic name is required")
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

	responses, err := admClient.DeleteTopics(ctx, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete topic: "+err.Error())
		return
	}
	resp, exists := responses[name]
	if !exists {
		writeError(w, http.StatusInternalServerError, "delete topic: missing response for topic")
		return
	}
	if resp.Err != nil {
		writeTopicAdminResponse(w, resp.Err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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
		Limit          int    `json:"limit"`
		Partition      *int32 `json:"partition"`       // nil = all partitions
		StartOffset    *int64 `json:"start_offset"`    // seek to specific offset
		StartTimestamp string `json:"start_timestamp"` // RFC3339: seek to first offset at/after this time
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

	// For timestamp-based seek, resolve start offsets before fetching end offsets.
	var timestampOffsets kadm.ListedOffsets
	if req.StartTimestamp != "" {
		ts, tsErr := time.Parse(time.RFC3339, req.StartTimestamp)
		if tsErr != nil {
			writeError(w, http.StatusBadRequest, "invalid start_timestamp: "+tsErr.Error())
			return
		}
		timestampOffsets, err = admClient.ListOffsetsAfterMilli(ctx, ts.UnixMilli(), name)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list offsets by timestamp: "+err.Error())
			return
		}
	}

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

		var startAt int64
		switch {
		case req.StartOffset != nil:
			// Seek to explicit offset
			startAt = *req.StartOffset
			if startAt < logStart {
				startAt = logStart
			}
		case timestampOffsets != nil:
			// Seek to first offset at/after timestamp
			startAt = logStart
			if tOff, ok2 := timestampOffsets[name]; ok2 {
				if pOff, ok2 := tOff[partID]; ok2 && pOff.Err == nil {
					startAt = pOff.Offset
				}
			}
		default:
			// Default: tail — last N messages
			startAt = endOff.Offset - int64(req.Limit)
			if startAt < logStart {
				startAt = logStart
			}
		}

		wantCount := endOff.Offset - startAt
		if wantCount <= 0 {
			continue
		}
		// Cap per-partition want to limit
		if wantCount > int64(req.Limit) {
			wantCount = int64(req.Limit)
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

// UpdateTopicPartitions godoc
// PUT /api/connections/:id/topics/:name/partitions
func (h *Handlers) UpdateTopicPartitions(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	var req struct {
		Partitions int `json:"partitions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Partitions < 1 {
		writeError(w, http.StatusBadRequest, "partitions must be >= 1")
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

	details, err := admClient.ListTopics(ctx, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "describe topic: "+err.Error())
		return
	}
	detail, exists := details[name]
	if !exists || detail.Err != nil {
		writeError(w, http.StatusNotFound, "topic not found")
		return
	}
	currentPartitions := len(detail.Partitions)
	if req.Partitions <= currentPartitions {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("partitions must be greater than current count (%d)", currentPartitions))
		return
	}

	responses, err := admClient.UpdatePartitions(ctx, req.Partitions, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update partitions: "+err.Error())
		return
	}
	resp, exists := responses[name]
	if !exists {
		writeError(w, http.StatusInternalServerError, "update partitions: missing response for topic")
		return
	}
	if resp.Err != nil {
		writeTopicAdminResponse(w, resp.Err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// UpdateTopicConfig godoc
// PUT /api/connections/:id/topics/:name/config
func (h *Handlers) UpdateTopicConfig(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	var req struct {
		Configs map[string]string `json:"configs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Configs) == 0 {
		writeError(w, http.StatusBadRequest, "no configs provided")
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

	configs := make([]kadm.AlterConfig, 0, len(req.Configs))
	for k, v := range req.Configs {
		val := v // capture
		configs = append(configs, kadm.AlterConfig{
			Op:    kadm.SetConfig,
			Name:  k,
			Value: &val,
		})
	}

	responses, err := admClient.AlterTopicConfigs(ctx, configs, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "alter configs: "+err.Error())
		return
	}
	for _, resp := range responses {
		if resp.Err != nil {
			writeError(w, http.StatusBadRequest, resp.Err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
