package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	awssession "github.com/kpanel/kpanel/internal/aws"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
	"github.com/kpanel/kpanel/internal/kafka"
)

// addConnectionRequest is the shape accepted by POST /api/connections.
type addConnectionRequest struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Platform string   `json:"platform"` // "aws" | "confluent" | "generic"; defaults to "generic"
	Brokers  []string `json:"brokers"`
	Auth     struct {
		Mechanism  string `json:"mechanism"` // "sasl_plain" | "sasl_scram_sha256" | "sasl_scram_sha512" | "aws_iam"
		Username   string `json:"username,omitempty"`
		Password   string `json:"password,omitempty"`
		AWSProfile string `json:"awsProfile,omitempty"`
		AWSRegion  string `json:"awsRegion,omitempty"`
	} `json:"auth,omitempty"`
	TLS struct {
		Enabled    bool   `json:"enabled"`
		CACertPath string `json:"caCertPath,omitempty"`
	} `json:"tls,omitempty"`
}

type statusResponse struct {
	Connected    bool   `json:"connected"`
	BrokerCount  int    `json:"brokerCount,omitempty"`
	ControllerID int32  `json:"controllerId,omitempty"`
	Error        string `json:"error,omitempty"`
}

// ListConnections godoc
// GET /api/connections
func (h *Handlers) ListConnections(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.List())
}

// AddConnection godoc
// POST /api/connections
func (h *Handlers) AddConnection(w http.ResponseWriter, r *http.Request) {
	var req addConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || len(req.Brokers) == 0 {
		writeError(w, http.StatusBadRequest, "name and brokers are required")
		return
	}
	if req.ID == "" {
		req.ID = slugify(req.Name)
	}

	platform := req.Platform
	if platform == "" {
		if req.Auth.Mechanism == "aws_iam" {
			platform = "aws"
		} else {
			platform = "generic"
		}
	}
	switch platform {
	case "aws", "confluent", "generic":
	default:
		writeError(w, http.StatusBadRequest, "platform must be one of: aws, confluent, generic")
		return
	}

	cluster := config.Cluster{
		ID:       req.ID,
		Name:     req.Name,
		Platform: platform,
		Brokers:  req.Brokers,
	}

	if req.TLS.Enabled || req.TLS.CACertPath != "" {
		cluster.TLS = &config.TLSConfig{
			Enabled:    true,
			CACertPath: req.TLS.CACertPath,
		}
	}

	if req.Auth.Mechanism != "" && req.Auth.Mechanism != "none" {
		ref := ""
		if req.Auth.Mechanism != "aws_iam" && (req.Auth.Username != "" || req.Auth.Password != "") {
			ref = req.ID
			if err := credentials.Set(ref, credentials.Credential{
				Username: req.Auth.Username,
				Password: req.Auth.Password,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "store credential: "+err.Error())
				return
			}
		}
		cluster.Auth = &config.ClusterAuth{
			Mechanism:     req.Auth.Mechanism,
			CredentialRef: ref,
		}
	}

	if platform == "aws" {
		awsCfg := config.AWSPlatformConfig{
			Profile: req.Auth.AWSProfile,
			Region:  req.Auth.AWSRegion,
		}
		if awsCfg.Profile == "" {
			awsCfg.Profile = "default"
		}
		if err := cluster.SetAWSConfig(awsCfg); err != nil {
			writeError(w, http.StatusInternalServerError, "set aws config: "+err.Error())
			return
		}
	}

	if err := h.store.Add(cluster); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, cluster)
}

// DeleteConnection godoc
// DELETE /api/connections/:id
func (h *Handlers) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	// Remove keychain entry if present.
	if cluster.Auth != nil && cluster.Auth.CredentialRef != "" {
		if err := credentials.Delete(cluster.Auth.CredentialRef); err != nil {
			log.Printf("warn: delete keyring entry %q: %v", cluster.Auth.CredentialRef, err)
		}
	}

	if err := h.store.Remove(cluster.ID); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, http.StatusNotFound, "connection not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ConnectionStatus godoc
// GET /api/connections/:id/status
func (h *Handlers) ConnectionStatus(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error()})
		return
	}
	defer admClient.Close()

	meta, err := admClient.BrokerMetadata(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, statusResponse{
		Connected:    true,
		BrokerCount:  len(meta.Brokers),
		ControllerID: meta.Controller,
	})
}

// ConnectionSession godoc
// GET /api/connections/:id/session
func (h *Handlers) ConnectionSession(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	if cluster.Platform != "aws" {
		writeError(w, http.StatusBadRequest, "session check is only available for AWS clusters")
		return
	}

	awsCfg, ok := cluster.GetAWSConfig()
	if !ok {
		writeError(w, http.StatusInternalServerError, "aws cluster is missing platform config")
		return
	}

	status := awssession.CheckSession(r.Context(), awsCfg.Profile, awsCfg.Region)
	writeJSON(w, http.StatusOK, status)
}
