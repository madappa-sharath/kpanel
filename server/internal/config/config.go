package config

import "encoding/json"

// Config is the top-level structure persisted to config.json.
type Config struct {
	Version       int       `json:"version"`
	ActiveCluster string    `json:"activeCluster,omitempty"`
	Clusters      []Cluster `json:"clusters"`
}

// Cluster represents a named Kafka cluster that kpanel can connect to.
type Cluster struct {
	ID             string                     `json:"id"`
	Name           string                     `json:"name"`
	Platform       string                     `json:"platform"` // "aws" | "confluent" | "generic"
	Brokers        []string                   `json:"brokers"`
	PlatformConfig map[string]json.RawMessage `json:"platformConfig,omitempty"`
	Auth           *ClusterAuth               `json:"auth,omitempty"`
	TLS            *TLSConfig                 `json:"tls,omitempty"`
}

// ClusterAuth describes how kpanel authenticates to the cluster.
type ClusterAuth struct {
	Mechanism          string `json:"mechanism"`                    // "sasl_plain" | "sasl_scram_sha256" | "sasl_scram_sha512" | "aws_iam"
	CredentialRef      string `json:"credentialRef,omitempty"`      // keychain lookup key; omitted for aws_iam
	CredentialUsername string `json:"credentialUsername,omitempty"` // resolved at API layer; never written to disk
}

// TLSConfig holds TLS settings for a cluster.
type TLSConfig struct {
	Enabled    bool   `json:"enabled"`
	CACertPath string `json:"caCertPath,omitempty"`
}

// AWSPlatformConfig is the typed representation of PlatformConfig["aws"].
type AWSPlatformConfig struct {
	Profile     string `json:"profile"`
	Region      string `json:"region"`
	ClusterArn  string `json:"clusterArn,omitempty"`
	ClusterName string `json:"clusterName,omitempty"` // CloudWatch "Cluster Name" dimension; derived from ARN if absent
}

// ConfluentPlatformConfig is the typed representation of PlatformConfig["confluent"].
type ConfluentPlatformConfig struct {
	Environment string `json:"environment"`
	ClusterID   string `json:"clusterId"`
}

// GetAWSConfig decodes the AWS platform config for a cluster, if present.
func (c *Cluster) GetAWSConfig() (*AWSPlatformConfig, bool) {
	if c.PlatformConfig == nil {
		return nil, false
	}
	raw, ok := c.PlatformConfig["aws"]
	if !ok {
		return nil, false
	}
	var cfg AWSPlatformConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, false
	}
	return &cfg, true
}

// SetAWSConfig encodes and stores an AWS platform config on a cluster.
func (c *Cluster) SetAWSConfig(cfg AWSPlatformConfig) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if c.PlatformConfig == nil {
		c.PlatformConfig = make(map[string]json.RawMessage)
	}
	c.PlatformConfig["aws"] = json.RawMessage(data)
	return nil
}

// GetConfluentConfig decodes the Confluent platform config for a cluster, if present.
func (c *Cluster) GetConfluentConfig() (*ConfluentPlatformConfig, bool) {
	if c.PlatformConfig == nil {
		return nil, false
	}
	raw, ok := c.PlatformConfig["confluent"]
	if !ok {
		return nil, false
	}
	var cfg ConfluentPlatformConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, false
	}
	return &cfg, true
}

// SetConfluentConfig encodes and stores a Confluent platform config on a cluster.
func (c *Cluster) SetConfluentConfig(cfg ConfluentPlatformConfig) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if c.PlatformConfig == nil {
		c.PlatformConfig = make(map[string]json.RawMessage)
	}
	c.PlatformConfig["confluent"] = json.RawMessage(data)
	return nil
}
