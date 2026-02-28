package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	awssession "github.com/kpanel/kpanel/internal/aws"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
	"github.com/kpanel/kpanel/internal/kafka"
	"github.com/kpanel/kpanel/internal/msk"
)

var (
	slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)
	slugTrimDash = regexp.MustCompile(`^-+|-+$`)
)

// slugify converts a display name into a URL-safe, stable identifier.
// "Production MSK" → "production-msk", "dev cluster 2" → "dev-cluster-2"
func slugify(s string) string {
	s = strings.ToLower(s)
	s = slugNonAlnum.ReplaceAllString(s, "-")
	s = slugTrimDash.ReplaceAllString(s, "")
	if s == "" {
		s = "cluster"
	}
	return s
}

// Handlers holds shared dependencies for HTTP handlers.
type Handlers struct {
	store *config.Store
}

// NewHandlers creates a Handlers instance.
func NewHandlers(store *config.Store) *Handlers {
	return &Handlers{store: store}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// Health godoc
// GET /api/health
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// addConnectionRequest is the shape accepted by POST /api/connections.
type addConnectionRequest struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Platform string   `json:"platform"` // "aws" | "confluent" | "generic"; defaults to "generic"
	Brokers  []string `json:"brokers"`
	Auth     struct {
		Mechanism  string `json:"mechanism"` // "sasl_plain" | "sasl_scram_sha256" | "sasl_scram_sha512" | "aws_iam"
		Username   string `json:"username,omitempty"`
		Password   string `json:"password,omitempty"`
		AWSProfile string `json:"awsProfile,omitempty"`
		AWSRegion  string `json:"awsRegion,omitempty"`
	} `json:"auth,omitempty"`
	TLS struct {
		Enabled    bool   `json:"enabled"`
		CACertPath string `json:"caCertPath,omitempty"`
	} `json:"tls,omitempty"`
}

// ListConnections godoc
// GET /api/connections
func (h *Handlers) ListConnections(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.List())
}

// AddConnection godoc
// POST /api/connections
func (h *Handlers) AddConnection(w http.ResponseWriter, r *http.Request) {
	var req addConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || len(req.Brokers) == 0 {
		writeError(w, http.StatusBadRequest, "name and brokers are required")
		return
	}
	if req.ID == "" {
		req.ID = slugify(req.Name)
	}

	platform := req.Platform
	if platform == "" {
		if req.Auth.Mechanism == "aws_iam" {
			platform = "aws"
		} else {
			platform = "generic"
		}
	}
	switch platform {
	case "aws", "confluent", "generic":
	default:
		writeError(w, http.StatusBadRequest, "platform must be one of: aws, confluent, generic")
		return
	}

	cluster := config.Cluster{
		ID:       req.ID,
		Name:     req.Name,
		Platform: platform,
		Brokers:  req.Brokers,
	}

	if req.TLS.Enabled || req.TLS.CACertPath != "" {
		cluster.TLS = &config.TLSConfig{
			Enabled:    true,
			CACertPath: req.TLS.CACertPath,
		}
	}

	if req.Auth.Mechanism != "" && req.Auth.Mechanism != "none" {
		ref := ""
		if req.Auth.Mechanism != "aws_iam" && (req.Auth.Username != "" || req.Auth.Password != "") {
			ref = req.ID
			if err := credentials.Set(ref, credentials.Credential{
				Username: req.Auth.Username,
				Password: req.Auth.Password,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "store credential: "+err.Error())
				return
			}
		}
		cluster.Auth = &config.ClusterAuth{
			Mechanism:     req.Auth.Mechanism,
			CredentialRef: ref,
		}
	}

	if platform == "aws" {
		awsCfg := config.AWSPlatformConfig{
			Profile: req.Auth.AWSProfile,
			Region:  req.Auth.AWSRegion,
		}
		if awsCfg.Profile == "" {
			awsCfg.Profile = "default"
		}
		if err := cluster.SetAWSConfig(awsCfg); err != nil {
			writeError(w, http.StatusInternalServerError, "set aws config: "+err.Error())
			return
		}
	}

	if err := h.store.Add(cluster); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, cluster)
}

// DeleteConnection godoc
// DELETE /api/connections/:id
func (h *Handlers) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

	// Remove keychain entry if present.
	if cluster.Auth != nil && cluster.Auth.CredentialRef != "" {
		if err := credentials.Delete(cluster.Auth.CredentialRef); err != nil {
			log.Printf("warn: delete keyring entry %q: %v", cluster.Auth.CredentialRef, err)
		}
	}

	if err := h.store.Remove(id); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type statusResponse struct {
	Connected    bool   `json:"connected"`
	BrokerCount  int    `json:"brokerCount,omitempty"`
	ControllerID int32  `json:"controllerId,omitempty"`
	Error        string `json:"error,omitempty"`
}

// ConnectionStatus godoc
// GET /api/connections/:id/status
func (h *Handlers) ConnectionStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error()})
		return
	}
	defer admClient.Close()

	meta, err := admClient.BrokerMetadata(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, statusResponse{
		Connected:    true,
		BrokerCount:  len(meta.Brokers),
		ControllerID: meta.Controller,
	})
}

// ConnectionSession godoc
// GET /api/connections/:id/session
func (h *Handlers) ConnectionSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

	if cluster.Platform != "aws" {
		writeError(w, http.StatusBadRequest, "session check is only available for AWS clusters")
		return
	}

	awsCfg, ok := cluster.GetAWSConfig()
	if !ok {
		writeError(w, http.StatusInternalServerError, "aws cluster is missing platform config")
		return
	}

	status := awssession.CheckSession(r.Context(), awsCfg.Profile, awsCfg.Region)
	writeJSON(w, http.StatusOK, status)
}

type topicSummary struct {
	Name                      string `json:"name"`
	Partitions                int    `json:"partitions"`
	ReplicationFactor         int    `json:"replication_factor"`
	Internal                  bool   `json:"internal"`
	ISRHealth                 string `json:"isr_health"` // "healthy" | "degraded"
	UnderReplicatedPartitions int    `json:"under_replicated_partitions"`
}

// ListTopics godoc
// GET /api/connections/:id/topics
func (h *Handlers) ListTopics(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
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

type partitionDetail struct {
	Partition      int32   `json:"partition"`
	Leader         int32   `json:"leader"`
	Replicas       []int32 `json:"replicas"`
	ISR            []int32 `json:"isr"`
	LogStartOffset int64   `json:"log_start_offset"`
	HighWatermark  int64   `json:"high_watermark"`
}

type topicDetailResponse struct {
	Name       string                `json:"name"`
	Partitions []partitionDetail     `json:"partitions"`
	Config     map[string]configEntry `json:"config"`
}

// GetTopic godoc
// GET /api/connections/:id/topics/:name
func (h *Handlers) GetTopic(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	name := chi.URLParam(r, "name")

	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
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

	type detailRes struct {
		details kadm.TopicDetails
		err     error
	}
	type offsetRes struct {
		offsets kadm.ListedOffsets
		err     error
	}
	type cfgRes struct {
		configs kadm.ResourceConfigs
		err     error
	}

	detailCh := make(chan detailRes, 1)
	startCh := make(chan offsetRes, 1)
	endCh := make(chan offsetRes, 1)
	cfgCh := make(chan cfgRes, 1)

	go func() { d, e := admClient.ListTopics(ctx, name); detailCh <- detailRes{d, e} }()
	go func() { o, e := admClient.ListStartOffsets(ctx, name); startCh <- offsetRes{o, e} }()
	go func() { o, e := admClient.ListEndOffsets(ctx, name); endCh <- offsetRes{o, e} }()
	go func() { c, e := admClient.DescribeTopicConfigs(ctx, name); cfgCh <- cfgRes{c, e} }()

	dRes := <-detailCh
	sRes := <-startCh
	eRes := <-endCh
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
		if sRes.err == nil {
			if tOffsets, ok := sRes.offsets[name]; ok {
				if off, ok := tOffsets[partID]; ok && off.Err == nil {
					logStart = off.Offset
				}
			}
		}
		if eRes.err == nil {
			if tOffsets, ok := eRes.offsets[name]; ok {
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

// ListGroups godoc
// GET /api/connections/:id/groups
func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

// GetGroup godoc
// GET /api/connections/:id/groups/:name
func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not implemented")
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

// PeekMessages godoc
// POST /api/connections/:id/topics/:name/peek
func (h *Handlers) PeekMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	name := chi.URLParam(r, "name")

	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}

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

	type offsetRes struct {
		offsets kadm.ListedOffsets
		err     error
	}
	startCh := make(chan offsetRes, 1)
	endCh := make(chan offsetRes, 1)
	go func() { o, e := admClient.ListStartOffsets(ctx, name); startCh <- offsetRes{o, e} }()
	go func() { o, e := admClient.ListEndOffsets(ctx, name); endCh <- offsetRes{o, e} }()
	sRes := <-startCh
	eRes := <-endCh

	if sRes.err != nil {
		writeError(w, http.StatusInternalServerError, "list start offsets: "+sRes.err.Error())
		return
	}
	if eRes.err != nil {
		writeError(w, http.StatusInternalServerError, "list end offsets: "+eRes.err.Error())
		return
	}

	topicEndOffsets := eRes.offsets[name]
	if len(topicEndOffsets) == 0 {
		writeJSON(w, http.StatusOK, []messageResponse{})
		return
	}
	topicStartOffsets := sRes.offsets[name]

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
	collectedPerPartition := map[int32]int64{}
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
			collectedPerPartition[rec.Partition]++
			totalCollected++
			if totalCollected >= totalWanted {
				fetchCancel()
			}
		})
	}

	sort.Slice(msgs, func(i, j int) bool {
		if msgs[i].Partition != msgs[j].Partition {
			return msgs[i].Partition < msgs[j].Partition
		}
		return msgs[i].Offset < msgs[j].Offset
	})
	writeJSON(w, http.StatusOK, msgs)
}

type brokerResponse struct {
	NodeID           int32  `json:"nodeId"`
	Host             string `json:"host"`
	Port             int32  `json:"port"`
	Rack             string `json:"rack,omitempty"`
	IsController     bool   `json:"isController"`
	LeaderPartitions int    `json:"leaderPartitions"`
	Replicas         int    `json:"replicas"`
	LogSizeBytes     int64  `json:"logSizeBytes"`
}

// ListBrokers godoc
// GET /api/connections/:id/brokers
func (h *Handlers) ListBrokers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
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

	meta, err := admClient.BrokerMetadata(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch topic metadata and log dirs in parallel for enriched broker stats.
	type topicRes struct {
		details kadm.TopicDetails
		err     error
	}
	type logRes struct {
		dirs kadm.DescribedAllLogDirs
		err  error
	}
	topicCh := make(chan topicRes, 1)
	logCh := make(chan logRes, 1)

	go func() {
		d, e := admClient.ListTopics(ctx)
		topicCh <- topicRes{d, e}
	}()
	go func() {
		d, e := admClient.DescribeAllLogDirs(ctx, nil)
		logCh <- logRes{d, e}
	}()

	tRes := <-topicCh
	lRes := <-logCh

	leaderCount := make(map[int32]int)
	replicaCount := make(map[int32]int)
	if tRes.err == nil {
		tRes.details.EachPartition(func(p kadm.PartitionDetail) {
			if p.Leader >= 0 {
				leaderCount[p.Leader]++
			}
			for _, r := range p.Replicas {
				replicaCount[r]++
			}
		})
	}

	logSize := make(map[int32]int64)
	if lRes.err == nil {
		for nodeID, dirs := range lRes.dirs {
			logSize[nodeID] = dirs.Size()
		}
	}

	brokers := make([]brokerResponse, 0, len(meta.Brokers))
	for _, b := range meta.Brokers {
		rack := ""
		if b.Rack != nil {
			rack = *b.Rack
		}
		brokers = append(brokers, brokerResponse{
			NodeID:           b.NodeID,
			Host:             b.Host,
			Port:             b.Port,
			Rack:             rack,
			IsController:     b.NodeID == meta.Controller,
			LeaderPartitions: leaderCount[b.NodeID],
			Replicas:         replicaCount[b.NodeID],
			LogSizeBytes:     logSize[b.NodeID],
		})
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].NodeID < brokers[j].NodeID
	})
	writeJSON(w, http.StatusOK, brokers)
}

type configEntry struct {
	Value  string `json:"value"`
	Source string `json:"source"` // "default" | "dynamic" | "static" | "unknown"
}

func configSourceLabel(s kmsg.ConfigSource) string {
	switch s {
	case kmsg.ConfigSourceDynamicTopicConfig,
		kmsg.ConfigSourceDynamicBrokerConfig,
		kmsg.ConfigSourceDynamicDefaultBrokerConfig:
		return "dynamic"
	case kmsg.ConfigSourceStaticBrokerConfig:
		return "static"
	case kmsg.ConfigSourceDefaultConfig:
		return "default"
	default:
		return "unknown"
	}
}

type overviewBrokerSummary struct {
	NodeID       int32  `json:"nodeId"`
	Host         string `json:"host"`
	Port         int32  `json:"port"`
	Rack         string `json:"rack,omitempty"`
	IsController bool   `json:"isController"`
}

type clusterOverviewResponse struct {
	ClusterID          string                  `json:"clusterId"`
	KafkaVersion       string                  `json:"kafkaVersion"`
	ControllerID       int32                   `json:"controllerId"`
	BrokerCount        int                     `json:"brokerCount"`
	Brokers            []overviewBrokerSummary `json:"brokers"`
	TotalPartitions    int                     `json:"totalPartitions"`
	UnderReplicated    int                     `json:"underReplicated"`
	OfflinePartitions  int                     `json:"offlinePartitions"`
	TopicCount         int                     `json:"topicCount"`
	ConsumerGroupCount int                     `json:"consumerGroupCount"`
	Configs            map[string]configEntry  `json:"configs"`
}

// ClusterOverview godoc
// GET /api/connections/:id/overview
func (h *Handlers) ClusterOverview(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
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

	type metaRes struct {
		meta kadm.Metadata
		err  error
	}
	type topicRes struct {
		details kadm.TopicDetails
		err     error
	}
	type groupRes struct {
		groups kadm.ListedGroups
		err    error
	}
	type versionRes struct {
		versions kadm.BrokersApiVersions
		err      error
	}
	type configRes struct {
		configs kadm.ResourceConfigs
		err     error
	}

	metaCh := make(chan metaRes, 1)
	topicCh := make(chan topicRes, 1)
	groupCh := make(chan groupRes, 1)
	versionCh := make(chan versionRes, 1)
	configCh := make(chan configRes, 1)

	go func() { m, e := admClient.BrokerMetadata(ctx); metaCh <- metaRes{m, e} }()
	go func() { d, e := admClient.ListTopics(ctx); topicCh <- topicRes{d, e} }()
	go func() { g, e := admClient.ListGroups(ctx); groupCh <- groupRes{g, e} }()
	go func() { v, e := admClient.ApiVersions(ctx); versionCh <- versionRes{v, e} }()

	mRes := <-metaCh
	if mRes.err != nil {
		writeError(w, http.StatusInternalServerError, mRes.err.Error())
		return
	}

	// Query the controller broker specifically so we get effective (non-null) config values.
	// Cluster-default DescribeBrokerConfigs("") returns null for unoverridden keys.
	if mRes.meta.Controller >= 0 {
		go func() {
			c, e := admClient.DescribeBrokerConfigs(ctx, mRes.meta.Controller)
			configCh <- configRes{c, e}
		}()
	} else {
		configCh <- configRes{} // no controller elected; skip config fetch
	}

	tRes := <-topicCh
	gRes := <-groupCh
	vRes := <-versionCh
	cRes := <-configCh

	// Broker summaries
	brokers := make([]overviewBrokerSummary, 0, len(mRes.meta.Brokers))
	for _, b := range mRes.meta.Brokers {
		rack := ""
		if b.Rack != nil {
			rack = *b.Rack
		}
		brokers = append(brokers, overviewBrokerSummary{
			NodeID:       b.NodeID,
			Host:         b.Host,
			Port:         b.Port,
			Rack:         rack,
			IsController: b.NodeID == mRes.meta.Controller,
		})
	}
	sort.Slice(brokers, func(i, j int) bool { return brokers[i].NodeID < brokers[j].NodeID })

	// Partition health
	totalPartitions, underReplicated, offlinePartitions := 0, 0, 0
	topicCount := 0
	if tRes.err == nil {
		topicCount = len(tRes.details)
		tRes.details.EachPartition(func(p kadm.PartitionDetail) {
			totalPartitions++
			if p.Leader < 0 {
				offlinePartitions++
			}
			if len(p.ISR) < len(p.Replicas) {
				underReplicated++
			}
		})
	}

	consumerGroupCount := 0
	if gRes.err == nil {
		consumerGroupCount = len(gRes.groups)
	}

	kafkaVersion := "unknown"
	if vRes.err == nil {
		// Prefer the controller broker for a deterministic pick
		if bv, ok := vRes.versions[mRes.meta.Controller]; ok {
			kafkaVersion = bv.VersionGuess()
		} else {
			for _, bv := range vRes.versions {
				kafkaVersion = bv.VersionGuess()
				break
			}
		}
	}

	wantedKeys := map[string]bool{
		// Reliability
		"default.replication.factor":               true,
		"min.insync.replicas":                      true,
		"unclean.leader.election.enable":           true,
		"offsets.topic.replication.factor":         true,
		"transaction.state.log.replication.factor": true,
		"transaction.state.log.min.isr":            true,
		// Retention
		"log.retention.hours": true,
		"log.retention.bytes": true,
		"log.retention.ms":    true,
		// Governance
		"auto.create.topics.enable": true,
		"delete.topic.enable":       true,
		// Performance
		"num.partitions":    true,
		"message.max.bytes": true,
	}
	configs := make(map[string]configEntry)
	if cRes.err == nil {
		// All brokers share the same cluster-level config; just use the first response
		for _, rc := range cRes.configs {
			for _, cfg := range rc.Configs {
				if !wantedKeys[cfg.Key] || cfg.Value == nil {
					continue
				}
				// log.retention.ms == -1 means "defer to log.retention.hours"; skip it
				// since log.retention.hours already conveys the effective retention time.
				if cfg.Key == "log.retention.ms" && *cfg.Value == "-1" {
					continue
				}
				configs[cfg.Key] = configEntry{
					Value:  *cfg.Value,
					Source: configSourceLabel(cfg.Source),
				}
			}
			break
		}
	}

	writeJSON(w, http.StatusOK, clusterOverviewResponse{
		ClusterID:          mRes.meta.Cluster,
		KafkaVersion:       kafkaVersion,
		ControllerID:       mRes.meta.Controller,
		BrokerCount:        len(brokers),
		Brokers:            brokers,
		TotalPartitions:    totalPartitions,
		UnderReplicated:    underReplicated,
		OfflinePartitions:  offlinePartitions,
		TopicCount:         topicCount,
		ConsumerGroupCount: consumerGroupCount,
		Configs:            configs,
	})
}

// GetMetrics godoc
// GET /api/connections/:id/metrics
func (h *Handlers) GetMetrics(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}
	if cluster.Platform != "aws" {
		writeError(w, http.StatusNotFound, "metrics are only available for MSK connections")
		return
	}

	if _, ok := cluster.GetAWSConfig(); !ok {
		writeError(w, http.StatusInternalServerError, "aws cluster is missing platform config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// DiscoverMSK godoc
// GET /api/msk/clusters?region=us-east-1
func (h *Handlers) DiscoverMSK(w http.ResponseWriter, r *http.Request) {
	region := r.URL.Query().Get("region")
	if region == "" {
		region = os.Getenv("AWS_REGION")
	}
	if region == "" {
		region = "us-east-1"
	}
	clusters, err := msk.DiscoverClusters(r.Context(), region)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if clusters == nil {
		clusters = []msk.ClusterInfo{}
	}
	writeJSON(w, http.StatusOK, clusters)
}

// ImportMSKCluster godoc
// POST /api/msk/clusters/:arn/import
func (h *Handlers) ImportMSKCluster(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

