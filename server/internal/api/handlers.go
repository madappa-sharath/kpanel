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

// ListTopics godoc
// GET /api/connections/:id/topics
func (h *Handlers) ListTopics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

// GetTopic godoc
// GET /api/connections/:id/topics/:name
func (h *Handlers) GetTopic(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not implemented")
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

// PeekMessages godoc
// POST /api/connections/:id/topics/:name/peek
func (h *Handlers) PeekMessages(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
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
	case kmsg.ConfigSourceDynamicBrokerConfig,
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
	go func() {
		c, e := admClient.DescribeBrokerConfigs(ctx, mRes.meta.Controller)
		configCh <- configRes{c, e}
	}()

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

