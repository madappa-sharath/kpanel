package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	awssession "github.com/kpanel/kpanel/internal/aws"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/credentials"
)

// addConnectionRequest is the shape accepted by POST /api/connections.
type addConnectionRequest struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Platform string   `json:"platform"` // "aws" | "confluent" | "generic"; defaults to "generic"
	Brokers  []string `json:"brokers"`
	Auth     struct {
		Mechanism      string `json:"mechanism"` // "sasl_plain" | "sasl_scram_sha256" | "sasl_scram_sha512" | "aws_iam"
		Username       string `json:"username,omitempty"`
		Password       string `json:"password,omitempty"`
		AWSProfile     string `json:"awsProfile,omitempty"`
		AWSRegion      string `json:"awsRegion,omitempty"`
		AWSClusterName string `json:"awsClusterName,omitempty"`
	} `json:"auth,omitempty"`
	TLS struct {
		Enabled bool   `json:"enabled"`
		CACert  string `json:"caCert,omitempty"` // PEM content; server writes to disk
	} `json:"tls,omitempty"`
}

type statusResponse struct {
	Connected    bool   `json:"connected"`
	BrokerCount  int    `json:"brokerCount,omitempty"`
	ControllerID int32  `json:"controllerId,omitempty"`
	Identity     string `json:"identity,omitempty"` // AWS ARN of the principal used for auth
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
	if _, exists := h.store.Get(req.ID); exists {
		writeError(w, http.StatusConflict, "connection id already exists")
		return
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

	if req.TLS.Enabled {
		certPath, err := h.writeCACert(cluster.ID, req.TLS.CACert, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "store CA cert: "+err.Error())
			return
		}
		cluster.TLS = &config.TLSConfig{Enabled: true, CACertPath: certPath}
	}

	// AWS clusters always use IAM auth.
	if platform == "aws" {
		req.Auth.Mechanism = "aws_iam"
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
			Profile:     req.Auth.AWSProfile,
			Region:      req.Auth.AWSRegion,
			ClusterName: req.Auth.AWSClusterName,
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

// UpdateConnection godoc
// PUT /api/connections/:id
func (h *Handlers) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	existing, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	var req addConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || len(req.Brokers) == 0 {
		writeError(w, http.StatusBadRequest, "name and brokers are required")
		return
	}

	cluster := config.Cluster{
		ID:       existing.ID,
		Name:     req.Name,
		Platform: existing.Platform,
		Brokers:  req.Brokers,
	}

	if req.TLS.Enabled {
		existingPath := ""
		if existing.TLS != nil {
			existingPath = existing.TLS.CACertPath
		}
		certPath, err := h.writeCACert(cluster.ID, req.TLS.CACert, existingPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "store CA cert: "+err.Error())
			return
		}
		cluster.TLS = &config.TLSConfig{Enabled: true, CACertPath: certPath}
	} else if existing.TLS != nil && existing.TLS.CACertPath != "" {
		// TLS disabled — remove old cert file.
		if err := os.Remove(existing.TLS.CACertPath); err != nil && !os.IsNotExist(err) {
			log.Printf("warn: remove CA cert %q: %v", existing.TLS.CACertPath, err)
		}
	}

	// AWS clusters always use IAM auth.
	if existing.Platform == "aws" {
		req.Auth.Mechanism = "aws_iam"
	}

	mechanism := req.Auth.Mechanism
	if mechanism == "" || mechanism == "none" {
		// Remove old keychain entry if present
		if existing.Auth != nil && existing.Auth.CredentialRef != "" {
			if err := credentials.Delete(existing.Auth.CredentialRef); err != nil {
				log.Printf("warn: delete keyring entry %q: %v", existing.Auth.CredentialRef, err)
			}
		}
	} else {
		credRef := ""
		if existing.Auth != nil {
			credRef = existing.Auth.CredentialRef
		}
		if mechanism != "aws_iam" && req.Auth.Password != "" {
			// New credentials provided — upsert
			credRef = existing.ID
			if err := credentials.Set(credRef, credentials.Credential{
				Username: req.Auth.Username,
				Password: req.Auth.Password,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "store credential: "+err.Error())
				return
			}
		}
		cluster.Auth = &config.ClusterAuth{
			Mechanism:     mechanism,
			CredentialRef: credRef,
		}
	}

	if existing.Platform == "aws" {
		awsCfg := config.AWSPlatformConfig{
			Profile:     req.Auth.AWSProfile,
			Region:      req.Auth.AWSRegion,
			ClusterName: req.Auth.AWSClusterName,
		}
		if awsCfg.Profile == "" {
			awsCfg.Profile = "default"
		}
		if err := cluster.SetAWSConfig(awsCfg); err != nil {
			writeError(w, http.StatusInternalServerError, "set aws config: "+err.Error())
			return
		}
	}

	h.pool.evict(existing.ID)
	if err := h.store.Add(cluster); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cluster)
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

	// Remove managed CA cert file if present.
	if cluster.TLS != nil && cluster.TLS.CACertPath != "" {
		if err := os.Remove(cluster.TLS.CACertPath); err != nil && !os.IsNotExist(err) {
			log.Printf("warn: remove CA cert %q: %v", cluster.TLS.CACertPath, err)
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
	h.pool.evict(cluster.ID)
	w.WriteHeader(http.StatusNoContent)
}

// ConnectionStatus godoc
// GET /api/connections/:id/status
func (h *Handlers) ConnectionStatus(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	// For AWS clusters, resolve caller identity concurrently with the Kafka
	// connection — don't block the connection attempt on the STS call.
	identityCh := make(chan string, 1)
	if cluster.Platform == "aws" {
		go func() {
			if awsCfg, ok := cluster.GetAWSConfig(); ok {
				if s := awssession.CheckSession(ctx, awsCfg.Profile, awsCfg.Region); s.Valid {
					identityCh <- s.UserARN
					return
				}
			}
			identityCh <- ""
		}()
	} else {
		identityCh <- ""
	}

	admClient, err := h.pool.get(cluster)
	identity := <-identityCh // STS result ready by now (Kafka is slower)

	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error(), Identity: identity})
		return
	}

	meta, err := admClient.BrokerMetadata(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{Connected: false, Error: err.Error(), Identity: identity})
		return
	}

	writeJSON(w, http.StatusOK, statusResponse{
		Connected:    true,
		BrokerCount:  len(meta.Brokers),
		ControllerID: meta.Controller,
		Identity:     identity,
	})
}

// writeCACert saves PEM content to certsDir/<id>.pem and returns the path.
// If pemContent is empty and existingPath is non-empty, the existing path is preserved.
// If both are empty, returns "".
func (h *Handlers) writeCACert(id, pemContent, existingPath string) (string, error) {
	if pemContent == "" {
		return existingPath, nil // nothing new — keep whatever was there
	}
	if err := os.MkdirAll(h.certsDir, 0700); err != nil {
		return "", err
	}
	dest := filepath.Join(h.certsDir, id+".pem")
	if err := os.WriteFile(dest, []byte(pemContent), 0600); err != nil {
		return "", err
	}
	return dest, nil
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
