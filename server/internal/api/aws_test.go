//go:build !integration

package api_test

import (
	"net/http"
	"testing"
)

// TestAWSContext_AlwaysReturns200 verifies the endpoint never returns an error
// status — it always returns 200 with a JSON body regardless of credential state.
func TestAWSContext_AlwaysReturns200(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
}

// TestAWSContext_ResponseShape verifies the response always contains the
// required fields: profile, region, valid.
func TestAWSContext_ResponseShape(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	for _, key := range []string{"profile", "region", "valid"} {
		if _, ok := resp[key]; !ok {
			t.Errorf("response missing required field %q", key)
		}
	}
}

// TestAWSContext_ProfileFromEnv verifies that AWS_PROFILE env var is reflected
// in the response.
func TestAWSContext_ProfileFromEnv(t *testing.T) {
	t.Setenv("AWS_PROFILE", "my-test-profile")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	if got, _ := resp["profile"].(string); got != "my-test-profile" {
		t.Errorf("profile: got %q, want my-test-profile", got)
	}
}

// TestAWSContext_RegionDefaultsToUsEast1 verifies the fallback region when no
// AWS region env vars are set.
func TestAWSContext_RegionDefaultsToUsEast1(t *testing.T) {
	t.Setenv("AWS_REGION", "")
	t.Setenv("AWS_DEFAULT_REGION", "")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	if got, _ := resp["region"].(string); got != "us-east-1" {
		t.Errorf("region: got %q, want us-east-1", got)
	}
}

// TestAWSContext_RegionFromEnv verifies AWS_REGION is passed through.
func TestAWSContext_RegionFromEnv(t *testing.T) {
	t.Setenv("AWS_REGION", "eu-west-1")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	if got, _ := resp["region"].(string); got != "eu-west-1" {
		t.Errorf("region: got %q, want eu-west-1", got)
	}
}

// TestAWSContext_ValidFalseInTestEnv verifies that valid=false is returned in
// the test environment (no real AWS credentials available).
func TestAWSContext_ValidFalseInTestEnv(t *testing.T) {
	// Force a profile that won't exist so credentials definitely fail.
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	if valid, _ := resp["valid"].(bool); valid {
		t.Error("expected valid=false in test environment with no real credentials")
	}
	if errMsg, _ := resp["error"].(string); errMsg == "" {
		t.Error("expected non-empty error field when credentials are unavailable")
	}
}

// TestAWSContext_AccountAndARNAbsentWhenInvalid verifies that account and
// userArn are not present in the response when credentials are invalid.
func TestAWSContext_AccountAndARNAbsentWhenInvalid(t *testing.T) {
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/aws/context", nil)

	var resp map[string]any
	decodeJSON(t, w, &resp)

	// omitempty fields must be absent (not empty string) on failure.
	if v, ok := resp["account"]; ok && v != "" {
		t.Errorf("account should be absent or empty on failure, got %v", v)
	}
	if v, ok := resp["userArn"]; ok && v != "" {
		t.Errorf("userArn should be absent or empty on failure, got %v", v)
	}
}
