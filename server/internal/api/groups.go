package api

import (
	"net/http"
)

// ListGroups godoc
// GET /api/connections/:id/groups
func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

// GetGroup godoc
// GET /api/connections/:id/groups/:name
func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not implemented")
}
