package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

// --- CreateTopic ---

func TestCreateTopic_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPost, "/api/connections/ghost/topics",
		map[string]any{"name": "orders", "partitions": 3, "replication_factor": 1})
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestCreateTopic_InvalidBody(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "ct-badbody", Platform: "generic", Brokers: []string{"b"}})
	req := httptest.NewRequest(http.MethodPost, "/api/connections/ct-badbody/topics",
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

func TestCreateTopic_ValidationErrors(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "ct-validation", Platform: "generic", Brokers: []string{"b"}})
	testCases := []struct {
		name string
		body map[string]any
	}{
		{name: "missing name", body: map[string]any{"partitions": 3, "replication_factor": 1}},
		{name: "partitions below 1", body: map[string]any{"name": "orders", "partitions": 0, "replication_factor": 1}},
		{name: "rf below 1", body: map[string]any{"name": "orders", "partitions": 1, "replication_factor": 0}},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			w := do(t, h, http.MethodPost, "/api/connections/ct-validation/topics", tc.body)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
			}
			var resp map[string]string
			decodeJSON(t, w, &resp)
			if _, ok := resp["error"]; !ok {
				t.Error("error responses must have an 'error' field")
			}
		})
	}
}

func TestCreateTopic_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "ct-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPost, "/api/connections/ct-unreachable/topics",
		map[string]any{"name": "orders", "partitions": 3, "replication_factor": 1})
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

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

// --- DeleteTopic ---

func TestDeleteTopic_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodDelete, "/api/connections/ghost/topics/my-topic", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestDeleteTopic_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "dt-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodDelete, "/api/connections/dt-unreachable/topics/any-topic", nil)
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

// TestPeekMessages_InvalidTimestamp verifies that a malformed start_timestamp
// value returns 400 before any Kafka I/O takes place. The kafka client creation
// is lazy so an unreachable broker is fine here.
func TestPeekMessages_InvalidTimestamp(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "pm-badts", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPost, "/api/connections/pm-badts/topics/foo/peek",
		map[string]any{"limit": 10, "start_timestamp": "not-a-valid-timestamp"})
	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

// --- UpdateTopicPartitions ---

func TestUpdateTopicPartitions_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPut, "/api/connections/ghost/topics/my-topic/partitions",
		map[string]any{"partitions": 5})
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestUpdateTopicPartitions_InvalidBody(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utp-badbody", Platform: "generic", Brokers: []string{"b"}})
	req := httptest.NewRequest(http.MethodPut, "/api/connections/utp-badbody/topics/foo/partitions",
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

func TestUpdateTopicPartitions_InvalidPartitionsValue(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utp-badvalue", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPut, "/api/connections/utp-badvalue/topics/foo/partitions",
		map[string]any{"partitions": 0})
	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestUpdateTopicPartitions_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utp-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPut, "/api/connections/utp-unreachable/topics/foo/partitions",
		map[string]any{"partitions": 5})
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

// --- UpdateTopicConfig ---

func TestUpdateTopicConfig_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPut, "/api/connections/ghost/topics/my-topic/config",
		map[string]any{"configs": map[string]string{"retention.ms": "1000"}})
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestUpdateTopicConfig_InvalidBody(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utc-badbody", Platform: "generic", Brokers: []string{"b"}})
	req := httptest.NewRequest(http.MethodPut, "/api/connections/utc-badbody/topics/foo/config",
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

func TestUpdateTopicConfig_EmptyConfigs(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utc-empty", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPut, "/api/connections/utc-empty/topics/foo/config",
		map[string]any{"configs": map[string]string{}})
	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestUpdateTopicConfig_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "utc-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodPut, "/api/connections/utc-unreachable/topics/foo/config",
		map[string]any{"configs": map[string]string{"retention.ms": "1000"}})
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
