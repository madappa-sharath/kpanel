package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

// --- ListGroups ---

func TestListGroups_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/groups", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestListGroups_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "lg-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodGet, "/api/connections/lg-unreachable/groups", nil)
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}

// --- GetGroup ---

func TestGetGroup_ConnectionNotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/groups/my-group", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}

func TestGetGroup_UnreachableBroker_ReturnsValidJSONError(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "gg-unreachable", Platform: "generic", Brokers: []string{"b"}})
	w := do(t, h, http.MethodGet, "/api/connections/gg-unreachable/groups/my-group", nil)
	if w.Code == http.StatusOK {
		t.Error("expected non-200 status with unreachable broker")
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(w.Body).Decode(&raw); err != nil {
		t.Fatalf("response must be valid JSON: %v (body: %s)", err, w.Body.String())
	}
}
