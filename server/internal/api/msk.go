package api

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/msk"
)

// DiscoverMSK godoc
// GET /api/msk/clusters?region=us-east-1
func (h *Handlers) DiscoverMSK(w http.ResponseWriter, r *http.Request) {
	region := r.URL.Query().Get("region")
	if region == "" {
		region = os.Getenv("AWS_REGION")
	}
	// If still empty, DiscoverClusters lets the AWS SDK resolve from profile/AWS_DEFAULT_REGION.
	clusters, err := msk.DiscoverClusters(r.Context(), region)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if clusters == nil {
		clusters = []msk.ClusterInfo{}
	}
	writeJSON(w, http.StatusOK, clusters)
}

// ImportMSKCluster godoc
// POST /api/msk/clusters/:arn/import
func (h *Handlers) ImportMSKCluster(w http.ResponseWriter, r *http.Request) {
	rawARN := chi.URLParam(r, "arn")
	arn, err := url.PathUnescape(rawARN)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid arn encoding")
		return
	}

	// Parse region from ARN: arn:aws:kafka:REGION:account:cluster/name/id
	parts := strings.SplitN(arn, ":", 6)
	if len(parts) < 5 || parts[0] != "arn" {
		writeError(w, http.StatusBadRequest, "invalid ARN format")
		return
	}
	region := parts[3]

	clusters, err := msk.DiscoverClusters(r.Context(), region)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "discover clusters: "+err.Error())
		return
	}

	var target *msk.ClusterInfo
	for i := range clusters {
		if clusters[i].ARN == arn {
			target = &clusters[i]
			break
		}
	}
	if target == nil {
		writeError(w, http.StatusNotFound, "MSK cluster not found")
		return
	}

	// Choose private or public brokers based on ?access=public query param.
	brokers := target.Brokers
	if r.URL.Query().Get("access") == "public" {
		if len(target.PublicBrokers) == 0 {
			writeError(w, http.StatusBadRequest, "public access brokers not available for this cluster")
			return
		}
		brokers = target.PublicBrokers
	}

	id := slugify(target.Name)
	if _, exists := h.store.Get(id); exists {
		writeError(w, http.StatusConflict, "cluster already imported (id: "+id+")")
		return
	}

	profile := config.ActiveAWSProfile()
	cluster := config.Cluster{
		ID:       id,
		Name:     target.Name,
		Platform: "aws",
		Brokers:  brokers,
		Auth:     &config.ClusterAuth{Mechanism: "aws_iam"},
		TLS:      &config.TLSConfig{Enabled: true},
	}
	if err := cluster.SetAWSConfig(config.AWSPlatformConfig{
		Profile:     profile,
		Region:      region,
		ClusterArn:  target.ARN,
		ClusterName: target.Name,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "set aws config: "+err.Error())
		return
	}

	if err := h.store.Add(cluster); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, cluster)
}
