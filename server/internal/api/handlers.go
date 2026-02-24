package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	awssession "github.com/kpanel/kpanel/internal/aws"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
	"github.com/kpanel/kpanel/internal/msk"
)

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
	if req.ID == "" || len(req.Brokers) == 0 {
		writeError(w, http.StatusBadRequest, "id and brokers are required")
		return
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

	if req.Auth.Mechanism != "" {
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

// ConnectionStatus godoc
// GET /api/connections/:id/status
func (h *Handlers) ConnectionStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
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
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// GetTopic godoc
// GET /api/connections/:id/topics/:name
func (h *Handlers) GetTopic(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// ListGroups godoc
// GET /api/connections/:id/groups
func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// GetGroup godoc
// GET /api/connections/:id/groups/:name
func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// PeekMessages godoc
// POST /api/connections/:id/topics/:name/peek
func (h *Handlers) PeekMessages(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

// ListBrokers godoc
// GET /api/connections/:id/brokers
func (h *Handlers) ListBrokers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
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

