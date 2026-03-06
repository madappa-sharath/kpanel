package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
)

// --- ListConnections ---

func TestListConnections_Empty(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp []config.Cluster
	decodeJSON(t, w, &resp)
	if len(resp) != 0 {
		t.Errorf("expected empty list, got %d clusters", len(resp))
	}
}

func TestListConnections_WithData(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "c1", Name: "One", Platform: "generic", Brokers: []string{"b"}})
	_ = store.Add(config.Cluster{ID: "c2", Name: "Two", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodGet, "/api/connections/", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp []config.Cluster
	decodeJSON(t, w, &resp)
	if len(resp) != 2 {
		t.Errorf("expected 2 clusters, got %d", len(resp))
	}
}

// --- AddConnection ---

func TestAddConnection_Valid_NoAuth(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"id":      "my-cluster",
		"name":    "My Cluster",
		"brokers": []string{"localhost:9092"},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.ID != "my-cluster" {
		t.Errorf("ID: got %q, want my-cluster", resp.ID)
	}
}

func TestAddConnection_MissingID(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{"brokers": []string{"b:9092"}}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAddConnection_MissingBrokers(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{"id": "x"}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAddConnection_InvalidBody(t *testing.T) {
	h, _ := testServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/connections/", strings.NewReader(`{not json`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAddConnection_WithSASLCredentials(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"id":      "sasl-cluster",
		"name":    "SASL Cluster",
		"brokers": []string{"b:9092"},
		"auth": map[string]any{
			"mechanism": "sasl_plain",
			"username":  "alice",
			"password":  "secret",
		},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.Auth == nil {
		t.Fatal("expected Auth to be set")
	}
	if resp.Auth.Mechanism != "sasl_plain" {
		t.Errorf("Mechanism: got %q, want sasl_plain", resp.Auth.Mechanism)
	}
	if resp.Auth.CredentialRef != "sasl-cluster" {
		t.Errorf("CredentialRef: got %q, want sasl-cluster", resp.Auth.CredentialRef)
	}

	// Credential must be stored in keyring.
	cred, err := credentials.Get("sasl-cluster")
	if err != nil {
		t.Fatalf("credentials.Get: %v", err)
	}
	if cred.Username != "alice" || cred.Password != "secret" {
		t.Errorf("stored cred: got {%q, %q}", cred.Username, cred.Password)
	}
}

func TestAddConnection_AWSIAMNoCredRef(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"id":      "aws-cluster",
		"name":    "AWS Cluster",
		"brokers": []string{"b:9092"},
		"auth": map[string]any{
			"mechanism": "aws_iam",
			"awsRegion": "us-east-1",
		},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusCreated)
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.Auth == nil {
		t.Fatal("expected Auth to be set")
	}
	if resp.Auth.CredentialRef != "" {
		t.Errorf("aws_iam should have no CredentialRef, got %q", resp.Auth.CredentialRef)
	}
	if resp.Platform != "aws" {
		t.Errorf("Platform: got %q, want aws", resp.Platform)
	}
}

func TestAddConnection_DefaultPlatformGeneric(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"id":      "plain",
		"name":    "Plain Cluster",
		"brokers": []string{"b:9092"},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusCreated)
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.Platform != "generic" {
		t.Errorf("Platform: got %q, want generic", resp.Platform)
	}
}

func TestAddConnection_AutoSlugFromName(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"name":    "Production MSK",
		"brokers": []string{"b:9092"},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)
	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.ID != "production-msk" {
		t.Errorf("auto-slug ID: got %q, want production-msk", resp.ID)
	}
}

func TestAddConnection_SlugTrimsEdgeDashes(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{"name": "  Cluster 2!!", "brokers": []string{"b"}}
	w := do(t, h, http.MethodPost, "/api/connections/", body)
	if w.Code != http.StatusCreated {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusCreated)
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if len(resp.ID) == 0 || resp.ID[0] == '-' || resp.ID[len(resp.ID)-1] == '-' {
		t.Errorf("slug %q has leading/trailing dashes", resp.ID)
	}
}

func TestAddConnection_DuplicateIDConflict(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{"id": "dup", "name": "Original", "brokers": []string{"b"}}
	do(t, h, http.MethodPost, "/api/connections/", body)

	body["name"] = "Updated"
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusConflict {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusConflict)
	}

	// List should still have only one cluster.
	wl := do(t, h, http.MethodGet, "/api/connections/", nil)
	var list []config.Cluster
	decodeJSON(t, wl, &list)
	if len(list) != 1 {
		t.Errorf("expected 1 cluster after upsert, got %d", len(list))
	}
	if list[0].Name != "Original" {
		t.Errorf("Name: got %q, want Original", list[0].Name)
	}
}

// --- UpdateConnection ---

func TestUpdateConnection_Basic(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "upd", Name: "Old Name", Platform: "generic", Brokers: []string{"old:9092"}})

	body := map[string]any{
		"name":    "New Name",
		"brokers": []string{"new:9092"},
	}
	w := do(t, h, http.MethodPut, "/api/connections/upd", body)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.ID != "upd" {
		t.Errorf("ID must not change: got %q", resp.ID)
	}
	if resp.Name != "New Name" {
		t.Errorf("Name: got %q, want New Name", resp.Name)
	}
	if len(resp.Brokers) != 1 || resp.Brokers[0] != "new:9092" {
		t.Errorf("Brokers: got %v", resp.Brokers)
	}
}

func TestUpdateConnection_NotFound(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{"name": "X", "brokers": []string{"b:9092"}}
	w := do(t, h, http.MethodPut, "/api/connections/ghost", body)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestUpdateConnection_MissingName(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "c", Name: "C", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodPut, "/api/connections/c", map[string]any{"brokers": []string{"b"}})

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestUpdateConnection_UpsertCredentials(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{
		ID: "sasl", Name: "SASL", Platform: "generic", Brokers: []string{"b"},
		Auth: &config.ClusterAuth{Mechanism: "sasl_plain", CredentialRef: "sasl"},
	})
	_ = credentials.Set("sasl", credentials.Credential{Username: "old", Password: "oldpw"})

	body := map[string]any{
		"name":    "SASL",
		"brokers": []string{"b"},
		"auth": map[string]any{
			"mechanism": "sasl_plain",
			"username":  "new",
			"password":  "newpw",
		},
	}
	w := do(t, h, http.MethodPut, "/api/connections/sasl", body)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	cred, err := credentials.Get("sasl")
	if err != nil {
		t.Fatalf("credentials.Get: %v", err)
	}
	if cred.Username != "new" || cred.Password != "newpw" {
		t.Errorf("updated cred: got {%q, %q}", cred.Username, cred.Password)
	}
}

func TestUpdateConnection_PreservesCredRefWhenNoPassword(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{
		ID: "keep", Name: "Keep", Platform: "generic", Brokers: []string{"b"},
		Auth: &config.ClusterAuth{Mechanism: "sasl_plain", CredentialRef: "keep"},
	})
	_ = credentials.Set("keep", credentials.Credential{Username: "u", Password: "p"})

	body := map[string]any{
		"name":    "Keep",
		"brokers": []string{"b2"},
		"auth":    map[string]any{"mechanism": "sasl_plain"},
	}
	w := do(t, h, http.MethodPut, "/api/connections/keep", body)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	if resp.Auth == nil || resp.Auth.CredentialRef != "keep" {
		t.Errorf("CredentialRef should be preserved: got %v", resp.Auth)
	}
	// Original credential still intact.
	cred, err := credentials.Get("keep")
	if err != nil {
		t.Fatalf("credentials.Get: %v", err)
	}
	if cred.Password != "p" {
		t.Errorf("password changed unexpectedly: got %q", cred.Password)
	}
}

func TestUpdateConnection_RemovesCredWhenSwitchingToNone(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{
		ID: "rm-auth", Name: "RM", Platform: "generic", Brokers: []string{"b"},
		Auth: &config.ClusterAuth{Mechanism: "sasl_plain", CredentialRef: "rm-auth"},
	})
	_ = credentials.Set("rm-auth", credentials.Credential{Username: "u", Password: "p"})

	body := map[string]any{
		"name":    "RM",
		"brokers": []string{"b"},
		"auth":    map[string]any{"mechanism": "none"},
	}
	w := do(t, h, http.MethodPut, "/api/connections/rm-auth", body)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
	if _, err := credentials.Get("rm-auth"); err == nil {
		t.Error("expected credential to be deleted from keyring")
	}
}

func TestUpdateConnection_AWSProfilePersisted(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "msk", Name: "MSK", Platform: "aws", Brokers: []string{"b"}})

	body := map[string]any{
		"name":    "MSK",
		"brokers": []string{"b"},
		"auth": map[string]any{
			"mechanism":  "aws_iam",
			"awsProfile": "prod-profile",
			"awsRegion":  "eu-west-1",
		},
	}
	w := do(t, h, http.MethodPut, "/api/connections/msk", body)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	awsCfg, ok := resp.GetAWSConfig()
	if !ok {
		t.Fatal("expected AWS config to be present")
	}
	if awsCfg.Profile != "prod-profile" {
		t.Errorf("Profile: got %q, want prod-profile", awsCfg.Profile)
	}
	if awsCfg.Region != "eu-west-1" {
		t.Errorf("Region: got %q, want eu-west-1", awsCfg.Region)
	}
}

// --- DeleteConnection ---

func TestDeleteConnection_Found(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "del-me", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodDelete, "/api/connections/del-me", nil)

	if w.Code != http.StatusNoContent {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNoContent)
	}
}

func TestDeleteConnection_NotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodDelete, "/api/connections/ghost", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestDeleteConnection_CleansKeyring(t *testing.T) {
	h, store := testServer(t)

	// Pre-store a credential then add a cluster that references it.
	ref := "del-cred-ref"
	_ = credentials.Set(ref, credentials.Credential{Username: "u", Password: "p"})
	_ = store.Add(config.Cluster{
		ID: "has-creds", Platform: "generic", Brokers: []string{"b"},
		Auth: &config.ClusterAuth{Mechanism: "sasl_plain", CredentialRef: ref},
	})

	w := do(t, h, http.MethodDelete, "/api/connections/has-creds", nil)

	if w.Code != http.StatusNoContent {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNoContent)
	}
	// Credential must be gone from keyring.
	if _, err := credentials.Get(ref); err == nil {
		t.Error("expected credential to be deleted from keyring")
	}
}

// --- ConnectionStatus ---

func TestConnectionStatus_Found(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "ok", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodGet, "/api/connections/ok/status", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
}

func TestConnectionStatus_NotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/status", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

// --- ConnectionSession ---

func TestConnectionSession_NotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/session", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestConnectionSession_NonAWSCluster(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "generic", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodGet, "/api/connections/generic/session", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if !strings.Contains(resp["error"], "AWS") {
		t.Errorf("error message should mention AWS: %q", resp["error"])
	}
}

// --- GetMetrics ---

// TestUpdateConnection_AWSClusterNamePersisted verifies that awsClusterName
// is stored in AWSPlatformConfig.ClusterName.
func TestUpdateConnection_AWSClusterNamePersisted(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "msk2", Name: "MSK2", Platform: "aws", Brokers: []string{"b"}})

	body := map[string]any{
		"name":    "MSK2",
		"brokers": []string{"b"},
		"auth": map[string]any{
			"mechanism":      "aws_iam",
			"awsProfile":     "myprofile",
			"awsRegion":      "us-east-1",
			"awsClusterName": "my-msk-cluster",
		},
	}
	w := do(t, h, http.MethodPut, "/api/connections/msk2", body)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	awsCfg, ok := resp.GetAWSConfig()
	if !ok {
		t.Fatal("expected AWS config to be present")
	}
	if awsCfg.ClusterName != "my-msk-cluster" {
		t.Errorf("ClusterName: got %q, want my-msk-cluster", awsCfg.ClusterName)
	}
}

func TestAddConnection_AWSClusterNamePersisted(t *testing.T) {
	h, _ := testServer(t)
	body := map[string]any{
		"id":      "msk3",
		"name":    "MSK3",
		"brokers": []string{"b:9092"},
		"auth": map[string]any{
			"mechanism":      "aws_iam",
			"awsRegion":      "us-east-1",
			"awsClusterName": "explicit-name",
		},
	}
	w := do(t, h, http.MethodPost, "/api/connections/", body)

	if w.Code != http.StatusCreated {
		t.Fatalf("status: got %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}
	var resp config.Cluster
	decodeJSON(t, w, &resp)
	awsCfg, ok := resp.GetAWSConfig()
	if !ok {
		t.Fatal("expected AWS config to be present")
	}
	if awsCfg.ClusterName != "explicit-name" {
		t.Errorf("ClusterName: got %q, want explicit-name", awsCfg.ClusterName)
	}
}

// --- GetMetrics ---

func TestGetMetrics_NotFound(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/connections/ghost/metrics", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestGetMetrics_NonMSKCluster(t *testing.T) {
	h, store := testServer(t)
	_ = store.Add(config.Cluster{ID: "plain", Platform: "generic", Brokers: []string{"b"}})

	w := do(t, h, http.MethodGet, "/api/connections/plain/metrics", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if !strings.Contains(resp["error"], "MSK") {
		t.Errorf("error message should mention MSK: %q", resp["error"])
	}
}

func TestGetMetrics_MissingAWSPlatformConfig(t *testing.T) {
	h, store := testServer(t)
	// AWS cluster but no platformConfig set → GetAWSConfig returns false.
	_ = store.Add(config.Cluster{ID: "aws-no-cfg", Platform: "aws", Brokers: []string{"b:9092"}})

	w := do(t, h, http.MethodGet, "/api/connections/aws-no-cfg/metrics", nil)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusInternalServerError, w.Body.String())
	}
}

func TestGetMetrics_NoClusterNameResolvable(t *testing.T) {
	h, store := testServer(t)
	// No ClusterName and no ClusterArn configured.
	cl := config.Cluster{ID: "aws-unknown", Platform: "aws", Brokers: []string{"custom.broker.example.com:9092"}}
	if err := cl.SetAWSConfig(config.AWSPlatformConfig{Profile: "default", Region: "us-east-1"}); err != nil {
		t.Fatalf("SetAWSConfig: %v", err)
	}
	_ = store.Add(cl)

	w := do(t, h, http.MethodGet, "/api/connections/aws-unknown/metrics", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if !strings.Contains(resp["error"], "CloudWatch cluster name is required") {
		t.Errorf("error should mention missing CloudWatch cluster name: %q", resp["error"])
	}
}

func TestGetMetrics_WithoutClusterNameOrArnEvenWithMSKBrokerFails(t *testing.T) {
	h, store := testServer(t)
	// Broker hostname is no longer parsed for cluster name inference.
	cl := config.Cluster{
		ID:       "aws-msk-broker",
		Platform: "aws",
		Brokers:  []string{"b-1-public.msk.hkmpj6.c1.kafka.us-east-1.amazonaws.com:9198"},
	}
	if err := cl.SetAWSConfig(config.AWSPlatformConfig{Profile: "default", Region: "us-east-1"}); err != nil {
		t.Fatalf("SetAWSConfig: %v", err)
	}
	_ = store.Add(cl)

	w := do(t, h, http.MethodGet, "/api/connections/aws-msk-broker/metrics", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if !strings.Contains(resp["error"], "CloudWatch cluster name is required") {
		t.Errorf("error should mention missing CloudWatch cluster name: %q", resp["error"])
	}
}

func TestGetMetrics_ClusterNameFromExplicitConfig(t *testing.T) {
	h, store := testServer(t)
	// Explicit ClusterName in config → used directly, no hostname parsing needed.
	cl := config.Cluster{ID: "aws-explicit", Platform: "aws", Brokers: []string{"custom.endpoint:9092"}}
	if err := cl.SetAWSConfig(config.AWSPlatformConfig{
		Profile:     "default",
		Region:      "us-east-1",
		ClusterName: "my-explicit-cluster",
	}); err != nil {
		t.Fatalf("SetAWSConfig: %v", err)
	}
	_ = store.Add(cl)

	w := do(t, h, http.MethodGet, "/api/connections/aws-explicit/metrics", nil)

	if w.Code == http.StatusBadRequest {
		var resp map[string]string
		decodeJSON(t, w, &resp)
		if strings.Contains(resp["error"], "cannot determine") {
			t.Errorf("should not fail on name resolution when ClusterName is set: %q", resp["error"])
		}
	}
}
