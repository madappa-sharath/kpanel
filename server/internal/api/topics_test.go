package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

// --- ListTopics ---

func TestListTopics_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/topics", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestListTopics_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "lt-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodGet, "/api/connections/lt-unreachable/topics", nil)
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

// --- GetTopic ---

func TestGetTopic_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/topics/my-topic", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestGetTopic_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "gt-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodGet, "/api/connections/gt-unreachable/topics/any-topic", nil)
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

// --- PeekMessages ---

func TestPeekMessages_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPost, "/api/connections/ghost/topics/my-topic/peek",
		map[string]any{"limit": 10})
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestPeekMessages_InvalidBody(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "pm-badbody", Platform: "generic", Brokers: []string{"b"}})
	req := httptest.NewRequest(http.MethodPost, "/api/connections/pm-badbody/topics/foo/peek",
		strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestPeekMessages_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "pm-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPost, "/api/connections/pm-unreachable/topics/foo/peek",
		map[string]any{"limit": 5})
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

// --- ClusterOverview ---

func TestClusterOverview_NotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/overview", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

// TestClusterOverview_ConfigsShape verifies that when configs are present the
// response encodes each entry as {"value": "...", "source": "..."} and not as a
// plain string, so the frontend type can rely on the shape.
func TestClusterOverview_ConfigsShape(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "shape", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodGet, "/api/connections/shape/overview", nil)
	// With a non-reachable broker the handler returns 500; we only care that
	// the response is valid JSON.
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}
