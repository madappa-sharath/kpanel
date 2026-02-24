package config_test

import (
	"encoding/json"
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

func TestCluster_GetAWSConfig_NilPlatformConfig(t *testing.T) {
	c := config.Cluster{ID: "c1", PlatformConfig: nil}
	_, ok := c.GetAWSConfig()
	if ok {
		t.Error("expected false for nil PlatformConfig")
	}
}

func TestCluster_GetAWSConfig_MissingKey(t *testing.T) {
	c := config.Cluster{
		ID: "c1",
		PlatformConfig: map[string]json.RawMessage{
			"confluent": json.RawMessage(`{}`),
		},
	}
	_, ok := c.GetAWSConfig()
	if ok {
		t.Error("expected false when aws key is absent")
	}
}

func TestCluster_GetAWSConfig_InvalidJSON(t *testing.T) {
	c := config.Cluster{
		ID: "c1",
		PlatformConfig: map[string]json.RawMessage{
			"aws": json.RawMessage(`{invalid`),
		},
	}
	_, ok := c.GetAWSConfig()
	if ok {
		t.Error("expected false for malformed JSON")
	}
}

func TestCluster_SetGetAWSConfig_RoundTrip(t *testing.T) {
	c := config.Cluster{ID: "c1", Platform: "aws"}
	want := config.AWSPlatformConfig{
		Profile:    "prod",
		Region:     "us-east-1",
		ClusterArn: "arn:aws:kafka:us-east-1:123456:cluster/test/abc",
	}

	if err := c.SetAWSConfig(want); err != nil {
		t.Fatalf("SetAWSConfig: %v", err)
	}

	got, ok := c.GetAWSConfig()
	if !ok {
		t.Fatal("GetAWSConfig returned false after Set")
	}
	if got.Profile != want.Profile {
		t.Errorf("Profile: got %q, want %q", got.Profile, want.Profile)
	}
	if got.Region != want.Region {
		t.Errorf("Region: got %q, want %q", got.Region, want.Region)
	}
	if got.ClusterArn != want.ClusterArn {
		t.Errorf("ClusterArn: got %q, want %q", got.ClusterArn, want.ClusterArn)
	}
}

func TestCluster_SetAWSConfig_OverwritesPrevious(t *testing.T) {
	c := config.Cluster{ID: "c1", Platform: "aws"}
	_ = c.SetAWSConfig(config.AWSPlatformConfig{Profile: "dev", Region: "eu-west-1"})
	_ = c.SetAWSConfig(config.AWSPlatformConfig{Profile: "prod", Region: "us-east-1"})

	got, ok := c.GetAWSConfig()
	if !ok {
		t.Fatal("GetAWSConfig returned false")
	}
	if got.Profile != "prod" {
		t.Errorf("expected prod, got %q", got.Profile)
	}
}
