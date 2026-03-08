//go:build !integration

package api_test

import (
	"net/http"
	"testing"
)

// ── DiscoverMSK ──────────────────────────────────────────────────────────────

// TestDiscoverMSK_ReturnsEmptyArrayNotNull verifies that when no AWS creds are
// available, the endpoint returns an empty JSON array rather than null or an
// error status.
func TestDiscoverMSK_ReturnsEmptyArrayNotNull(t *testing.T) {
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/msk/clusters", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	var resp []any
	decodeJSON(t, w, &resp)
	if resp == nil {
		t.Error("response should be an empty array, not null")
	}
}

// TestDiscoverMSK_RegionQueryParam verifies the endpoint accepts a ?region= param
// without error.
func TestDiscoverMSK_RegionQueryParam(t *testing.T) {
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/msk/clusters?region=us-west-2", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
}

// ── ImportMSKCluster ─────────────────────────────────────────────────────────

// TestImportMSKCluster_InvalidARNPrefix verifies that an ARN not starting with
// "arn" returns 400.
func TestImportMSKCluster_InvalidARNPrefix(t *testing.T) {
	h, _ := testServer(t)
	// URL-encode so chi routes it to the {arn} param correctly.
	w := do(t, h, http.MethodPost, "/api/msk/clusters/notanarn/import", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

// TestImportMSKCluster_InvalidARNTooFewParts verifies that an ARN with fewer
// than 5 colon-separated segments returns 400.
func TestImportMSKCluster_InvalidARNTooFewParts(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPost, "/api/msk/clusters/arn%3Aaws%3Akafka/import", nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

// TestImportMSKCluster_ValidARNFormatButNoAWS verifies that a structurally
// valid ARN returns 404 when no real AWS credentials are available (discovery
// returns an empty list, so the cluster is not found).
func TestImportMSKCluster_ValidARNFormatButNoAWS(t *testing.T) {
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)

	// A structurally valid MSK ARN, URL-encoded.
	arn := "arn%3Aaws%3Akafka%3Aus-east-1%3A123456789012%3Acluster%2Fmy-cluster%2Fabc"
	w := do(t, h, http.MethodPost, "/api/msk/clusters/"+arn+"/import", nil)

	// Discovery returns empty list → cluster not found.
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusNotFound, w.Body.String())
	}
}

// TestImportMSKCluster_PublicAccessQueryParamNotFoundWithoutAWS verifies that
// ?access=public also returns 404 (not 400 or 500) when AWS is unavailable.
func TestImportMSKCluster_PublicAccessQueryParamNotFoundWithoutAWS(t *testing.T) {
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)

	arn := "arn%3Aaws%3Akafka%3Aus-east-1%3A123456789012%3Acluster%2Fmy-cluster%2Fabc"
	w := do(t, h, http.MethodPost, "/api/msk/clusters/"+arn+"/import?access=public", nil)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusNotFound, w.Body.String())
	}
}

// TestImportMSKCluster_ErrorResponseShape verifies that error responses from
// the import endpoint always use the standard {"error": "..."} shape.
func TestImportMSKCluster_ErrorResponseShape(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodPost, "/api/msk/clusters/notanarn/import", nil)

	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Errorf("error response must have an 'error' field, got: %s", w.Body.String())
	}
}
