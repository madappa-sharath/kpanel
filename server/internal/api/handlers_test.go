package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/api"
	"github.com/kpanel/kpanel/internal/config"
)

// testServer creates a fresh chi router with a real config.Store backed by a temp dir.
func testServer(t *testing.T) (http.Handler, *config.Store) {
	t.Helper()
	dir := t.TempDir()
	store, err := config.NewStore(dir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	r := chi.NewRouter()
	api.Mount(r, store)
	return r, store
}

func do(t *testing.T, h http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf *bytes.Buffer
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
		buf = bytes.NewBuffer(data)
	} else {
		buf = &bytes.Buffer{}
	}
	req := httptest.NewRequest(method, path, buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func decodeJSON(t *testing.T, w *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(w.Body).Decode(v); err != nil {
		t.Fatalf("decode response: %v (body: %s)", err, w.Body.String())
	}
}

// --- Health ---

func TestHealth(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodGet, "/api/health", nil)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusOK)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if resp["status"] != "ok" {
		t.Errorf("status field: got %q, want ok", resp["status"])
	}
}

// --- Error response shape ---

func TestErrorResponse_Shape(t *testing.T) {
	h, _ := testServer(t)
	w := do(t, h, http.MethodDelete, "/api/connections/nobody", nil)

	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error responses must have an 'error' field")
	}
}
