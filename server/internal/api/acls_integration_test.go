//go:build integration

package api_test

import (
	"net/http"
	"testing"
)

type aclBindingResp struct {
	Principal    string `json:"principal"`
	Host         string `json:"host"`
	ResourceType string `json:"resource_type"`
	ResourceName string `json:"resource_name"`
	PatternType  string `json:"pattern_type"`
	Operation    string `json:"operation"`
	Permission   string `json:"permission"`
}

type aclResultsResp struct {
	Results []struct {
		aclBindingResp
		Deleted int    `json:"deleted"`
		Error   string `json:"error"`
	} `json:"results"`
}

func containsBinding(bs []aclBindingResp, want aclBindingResp) bool {
	for _, b := range bs {
		if b == want {
			return true
		}
	}
	return false
}

// The compose broker runs an authorizer (make kafka-up); the testcontainers
// broker used in CI does not. Either way the API must answer specifically.
func TestACLs_Integration_RoundTripOrSecurityDisabled(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "acl-rt")

	w := do(t, h, http.MethodGet, "/api/connections/acl-rt/acls", nil)
	if w.Code == http.StatusConflict {
		var body map[string]string
		decodeJSON(t, w, &body)
		if body["code"] != "security_disabled" {
			t.Fatalf("409 without security_disabled code: %v", body)
		}
		t.Skip("broker has no authorizer; security_disabled response verified")
	}
	if w.Code != http.StatusOK {
		t.Fatalf("list status %d: %s", w.Code, w.Body)
	}

	// Neighbouring bindings differ from the first in exactly one field, so a
	// delete filter that drops or rewrites a field removes more than it should.
	bindings := []map[string]any{
		{"principal": "User:kpanel-it", "host": "*", "resource_type": "topic", "resource_name": "acl-it-orders",
			"pattern_type": "literal", "operation": "write", "permission": "allow"},
		{"principal": "User:kpanel-it", "host": "10.0.0.1", "resource_type": "topic", "resource_name": "acl-it-orders",
			"pattern_type": "literal", "operation": "write", "permission": "allow"},
		{"principal": "User:kpanel-it", "host": "*", "resource_type": "topic", "resource_name": "acl-it-orders",
			"pattern_type": "prefixed", "operation": "write", "permission": "allow"},
		{"principal": "User:kpanel-it", "host": "*", "resource_type": "topic", "resource_name": "acl-it-orders",
			"pattern_type": "literal", "operation": "write", "permission": "deny"},
		{"principal": "User:kpanel-it", "host": "*", "resource_type": "cluster", "resource_name": "kafka-cluster",
			"pattern_type": "literal", "operation": "describe", "permission": "allow"},
	}
	expected := []aclBindingResp{
		{"User:kpanel-it", "*", "topic", "acl-it-orders", "literal", "write", "allow"},
		{"User:kpanel-it", "10.0.0.1", "topic", "acl-it-orders", "literal", "write", "allow"},
		{"User:kpanel-it", "*", "topic", "acl-it-orders", "prefixed", "write", "allow"},
		{"User:kpanel-it", "*", "topic", "acl-it-orders", "literal", "write", "deny"},
		{"User:kpanel-it", "*", "cluster", "kafka-cluster", "literal", "describe", "allow"},
	}
	t.Cleanup(func() {
		do(t, h, http.MethodPost, "/api/connections/acl-rt/acls/delete", map[string]any{"bindings": bindings})
	})

	w = do(t, h, http.MethodPost, "/api/connections/acl-rt/acls", map[string]any{"bindings": bindings})
	if w.Code != http.StatusOK {
		t.Fatalf("create status %d: %s", w.Code, w.Body)
	}
	var created aclResultsResp
	decodeJSON(t, w, &created)
	if len(created.Results) != len(bindings) {
		t.Fatalf("create results: %+v", created)
	}
	for _, r := range created.Results {
		if r.Error != "" {
			t.Fatalf("create error: %+v", r)
		}
	}

	w = do(t, h, http.MethodGet, "/api/connections/acl-rt/acls", nil)
	var listed []aclBindingResp
	decodeJSON(t, w, &listed)
	for _, want := range expected {
		if !containsBinding(listed, want) {
			t.Errorf("binding %+v not listed in %+v", want, listed)
		}
	}

	// Delete only the first binding; the exact filter must leave the others.
	w = do(t, h, http.MethodPost, "/api/connections/acl-rt/acls/delete", map[string]any{"bindings": bindings[:1]})
	if w.Code != http.StatusOK {
		t.Fatalf("delete status %d: %s", w.Code, w.Body)
	}
	var deleted aclResultsResp
	decodeJSON(t, w, &deleted)
	if len(deleted.Results) != 1 || deleted.Results[0].Deleted != 1 {
		t.Fatalf("delete results: %+v", deleted)
	}

	w = do(t, h, http.MethodGet, "/api/connections/acl-rt/acls", nil)
	listed = nil
	decodeJSON(t, w, &listed)
	if containsBinding(listed, expected[0]) {
		t.Errorf("deleted binding still listed")
	}
	for _, want := range expected[1:] {
		if !containsBinding(listed, want) {
			t.Errorf("neighbouring binding %+v was removed", want)
		}
	}

	// The cluster binding deletes by its listed name.
	w = do(t, h, http.MethodPost, "/api/connections/acl-rt/acls/delete", map[string]any{"bindings": bindings[4:]})
	decodeJSON(t, w, &deleted)
	if len(deleted.Results) != 1 || deleted.Results[0].Deleted != 1 {
		t.Fatalf("cluster delete results: %+v", deleted)
	}
}
