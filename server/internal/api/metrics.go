package api

import (
	"net/http"
)

// GetMetrics godoc
// GET /api/connections/:id/metrics
func (h *Handlers) GetMetrics(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	if cluster.Platform != "aws" {
		writeError(w, http.StatusNotFound, "metrics are only available for MSK connections")
		return
	}

	if _, ok := cluster.GetAWSConfig(); !ok {
		writeError(w, http.StatusInternalServerError, "aws cluster is missing platform config")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "not implemented"})
}
