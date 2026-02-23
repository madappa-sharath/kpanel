package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/connections"
	"github.com/kpanel/kpanel/internal/msk"
)

// Handlers holds shared dependencies for HTTP handlers.
type Handlers struct {
	store *connections.Store
}

// NewHandlers creates a Handlers instance.
func NewHandlers(store *connections.Store) *Handlers {
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

// ListConnections godoc
// GET /api/connections
func (h *Handlers) ListConnections(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.List())
}

// AddConnection godoc
// POST /api/connections
func (h *Handlers) AddConnection(w http.ResponseWriter, r *http.Request) {
	var c connections.Connection
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if c.ID == "" || len(c.Brokers) == 0 {
		writeError(w, http.StatusBadRequest, "id and brokers are required")
		return
	}
	if err := h.store.Add(&c); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// DeleteConnection godoc
// DELETE /api/connections/:id
func (h *Handlers) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.Remove(id); err != nil {
		if errors.Is(err, connections.ErrNotFound) {
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
	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
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
	conn, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return
	}
	if conn.MSK == nil {
		writeError(w, http.StatusNotFound, "metrics are only available for MSK connections")
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
