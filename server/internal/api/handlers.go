package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/kpanel/kpanel/internal/config"
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
	store    *config.Store
	certsDir string // ~/.kpanel/certs/ — managed CA cert files live here
	lagStore *LagStore
	pool     *clientPool
}

// NewHandlers creates a Handlers instance.
func NewHandlers(store *config.Store) *Handlers {
	return &Handlers{
		store:    store,
		certsDir: filepath.Join(store.Dir(), "certs"),
		lagStore: NewLagStore(),
		pool:     newClientPool(),
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writeErrorWithFields writes a JSON error response that includes extra key/value
// fields alongside the standard "error" key (e.g. active_members on a conflict).
func writeErrorWithFields(w http.ResponseWriter, status int, msg string, extra map[string]any) {
	body := map[string]any{"error": msg}
	for k, v := range extra {
		body[k] = v
	}
	writeJSON(w, status, body)
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

// getClusterOrError looks up the cluster from the "id" URL param and writes a
// 404 if not found. Returns the cluster and true on success.
func (h *Handlers) getClusterOrError(w http.ResponseWriter, r *http.Request) (*config.Cluster, bool) {
	id := chi.URLParam(r, "id")
	cluster, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "connection not found")
		return nil, false
	}
	return cluster, true
}

// derefOrEmpty dereferences a *string, returning "" if nil.
func derefOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Health godoc
// GET /api/health
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
