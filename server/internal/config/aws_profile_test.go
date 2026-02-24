package config_test

import (
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

func TestActiveAWSProfile_Default(t *testing.T) {
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("AWS_DEFAULT_PROFILE", "")

	if got := config.ActiveAWSProfile(); got != "default" {
		t.Errorf("got %q, want default", got)
	}
}

func TestActiveAWSProfile_FromAWSProfile(t *testing.T) {
	t.Setenv("AWS_PROFILE", "prod")
	t.Setenv("AWS_DEFAULT_PROFILE", "staging")

	if got := config.ActiveAWSProfile(); got != "prod" {
		t.Errorf("AWS_PROFILE should take precedence: got %q, want prod", got)
	}
}

func TestActiveAWSProfile_FallbackToDefault(t *testing.T) {
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("AWS_DEFAULT_PROFILE", "staging")

	if got := config.ActiveAWSProfile(); got != "staging" {
		t.Errorf("got %q, want staging", got)
	}
}

// --- FilterByProfile ---

func awsCluster(id, profile string) config.Cluster {
	c := config.Cluster{ID: id, Platform: "aws", Brokers: []string{"b"}}
	_ = c.SetAWSConfig(config.AWSPlatformConfig{Profile: profile, Region: "us-east-1"})
	return c
}

func genericCluster(id string) config.Cluster {
	return config.Cluster{ID: id, Platform: "generic", Brokers: []string{"b"}}
}

func TestFilterByProfile_Empty(t *testing.T) {
	result := config.FilterByProfile(nil, "prod")
	if len(result) != 0 {
		t.Errorf("expected empty, got %d", len(result))
	}
}

func TestFilterByProfile_NoneMatch(t *testing.T) {
	clusters := []config.Cluster{awsCluster("a", "dev"), awsCluster("b", "staging")}
	result := config.FilterByProfile(clusters, "prod")
	if len(result) != 0 {
		t.Errorf("expected none, got %d", len(result))
	}
}

func TestFilterByProfile_SomeMatch(t *testing.T) {
	clusters := []config.Cluster{
		awsCluster("a", "prod"),
		awsCluster("b", "dev"),
		awsCluster("c", "prod"),
		genericCluster("g"),
	}
	result := config.FilterByProfile(clusters, "prod")
	if len(result) != 2 {
		t.Errorf("expected 2, got %d", len(result))
	}
	for _, c := range result {
		if c.ID == "b" || c.ID == "g" {
			t.Errorf("unexpected cluster %q in result", c.ID)
		}
	}
}

func TestFilterByProfile_ExcludesNonAWS(t *testing.T) {
	clusters := []config.Cluster{
		genericCluster("x"),
		genericCluster("y"),
	}
	result := config.FilterByProfile(clusters, "default")
	if len(result) != 0 {
		t.Errorf("non-AWS clusters should be excluded, got %d", len(result))
	}
}

// --- ProfileMatchResult ---

func TestProfileMatchResult_AutoSelectWhenOne(t *testing.T) {
	t.Setenv("AWS_PROFILE", "solo")
	t.Setenv("AWS_DEFAULT_PROFILE", "")

	clusters := []config.Cluster{awsCluster("only-one", "solo")}
	match := config.ProfileMatchResult(clusters)

	if !match.AutoSelect {
		t.Error("expected AutoSelect=true when exactly one cluster matches")
	}
	if len(match.MatchedIDs) != 1 || match.MatchedIDs[0] != "only-one" {
		t.Errorf("MatchedIDs: got %v", match.MatchedIDs)
	}
	if match.Profile != "solo" {
		t.Errorf("Profile: got %q, want solo", match.Profile)
	}
}

func TestProfileMatchResult_NoAutoSelectWhenMultiple(t *testing.T) {
	t.Setenv("AWS_PROFILE", "shared")
	t.Setenv("AWS_DEFAULT_PROFILE", "")

	clusters := []config.Cluster{
		awsCluster("c1", "shared"),
		awsCluster("c2", "shared"),
	}
	match := config.ProfileMatchResult(clusters)

	if match.AutoSelect {
		t.Error("expected AutoSelect=false when multiple clusters match")
	}
	if len(match.MatchedIDs) != 2 {
		t.Errorf("expected 2 matched IDs, got %d", len(match.MatchedIDs))
	}
}

func TestProfileMatchResult_NoAutoSelectWhenNone(t *testing.T) {
	t.Setenv("AWS_PROFILE", "nobody")
	t.Setenv("AWS_DEFAULT_PROFILE", "")

	clusters := []config.Cluster{awsCluster("a", "prod")}
	match := config.ProfileMatchResult(clusters)

	if match.AutoSelect {
		t.Error("expected AutoSelect=false when nothing matches")
	}
	if len(match.MatchedIDs) != 0 {
		t.Errorf("expected 0 matched IDs, got %d", len(match.MatchedIDs))
	}
}
