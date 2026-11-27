package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

func addIAMCluster(t *testing.T, store *config.Store, id string) {
	t.Helper()
	c := config.Cluster{
		ID:       id,
		Name:     id,
		Platform: "aws",
		Brokers:  []string{"b-1.example.kafka.us-east-1.amazonaws.com:9098"},
		Auth:     &config.ClusterAuth{Mechanism: "aws_iam"},
	}
	if err := c.SetAWSConfig(config.AWSPlatformConfig{Profile: "default", Region: "us-east-1"}); err != nil {
		t.Fatal(err)
	}
	if err := store.Add(c); err != nil {
		t.Fatalf("store.Add: %v", err)
	}
}

var sampleBinding = map[string]any{
	"principal": "User:alice", "host": "*", "resource_type": "topic", "resource_name": "orders",
	"pattern_type": "literal", "operation": "write", "permission": "allow",
}

func TestACLs_IAMConnectionIsReportedWithoutContactingBroker(t *testing.T) {
	h, store := testServer(t)
	addIAMCluster(t, store, "msk")

	requests := []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, "/api/connections/msk/acls", nil},
		{http.MethodPost, "/api/connections/msk/acls", map[string]any{"bindings": []any{sampleBinding}}},
		{http.MethodPost, "/api/connections/msk/acls/delete", map[string]any{"bindings": []any{sampleBinding}}},
	}
	for _, rq := range requests {
		w := do(t, h, rq.method, rq.path, rq.body)
		if w.Code != http.StatusConflict {
			t.Fatalf("%s %s: status %d, want 409: %s", rq.method, rq.path, w.Code, w.Body)
		}
		var body map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body["code"] != "iam_managed" || body["error"] == "" {
			t.Errorf("%s %s: body %v", rq.method, rq.path, body)
		}
	}
}

func TestACLs_UnknownConnection(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/missing/acls", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status %d, want 404", w.Code)
	}
}

func TestACLs_CreateValidatesBody(t *testing.T) {
	h, store := testServer(t)
	if err := store.Add(config.Cluster{ID: "c", Name: "c", Platform: "generic", Brokers: []string{"127.0.0.1:1"}}); err != nil {
		t.Fatal(err)
	}
	bad := map[string]any{
		"principal": "User:alice", "resource_type": "topic", "resource_name": "orders",
		"operation": "any", "permission": "allow",
	}
	tests := []struct {
		name string
		body any
	}{
		{"no bindings", map[string]any{"bindings": []any{}}},
		{"invalid operation", map[string]any{"bindings": []any{sampleBinding, bad}}},
		{"not json", "nope"},
	}
	for _, path := range []string{"/api/connections/c/acls", "/api/connections/c/acls/delete"} {
		for _, tt := range tests {
			t.Run(path+" "+tt.name, func(t *testing.T) {
				w := do(t, h, http.MethodPost, path, tt.body)
				if w.Code != http.StatusBadRequest {
					t.Errorf("status %d, want 400: %s", w.Code, w.Body)
				}
			})
		}
	}
}
