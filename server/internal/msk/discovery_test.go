package msk

import (
	"context"
	"strings"
	"testing"
	"time"
)

// ── splitBrokers ─────────────────────────────────────────────────────────────

func TestSplitBrokers(t *testing.T) {
	cases := []struct {
		input string
		want  []string
	}{
		{"b-1:9092,b-2:9092", []string{"b-1:9092", "b-2:9092"}},
		{"  b-1:9092 , b-2:9092 ", []string{"b-1:9092", "b-2:9092"}},
		{"b-1:9092", []string{"b-1:9092"}},
		{"", nil},
		{",,,", nil},
	}
	for _, c := range cases {
		got := splitBrokers(c.input)
		if len(got) != len(c.want) {
			t.Errorf("splitBrokers(%q) = %v, want %v", c.input, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitBrokers(%q)[%d] = %q, want %q", c.input, i, got[i], c.want[i])
			}
		}
	}
}

// ── ClusterInfo ──────────────────────────────────────────────────────────────

// TestClusterInfo_PublicBrokersNilByDefault verifies that a zero-value
// ClusterInfo has nil PublicBrokers (not an empty allocated slice), so JSON
// serialisation omits the field rather than encoding [].
func TestClusterInfo_PublicBrokersNilByDefault(t *testing.T) {
	c := ClusterInfo{ARN: "arn", Name: "test", State: "ACTIVE", Region: "us-east-1"}
	if c.PublicBrokers != nil {
		t.Errorf("PublicBrokers should be nil by default, got %v", c.PublicBrokers)
	}
}

// TestClusterInfo_BothBrokerSetsIndependent verifies that private and public
// broker slices are stored independently.
func TestClusterInfo_BothBrokerSetsIndependent(t *testing.T) {
	private := []string{"b-1.example.com:9098", "b-2.example.com:9098"}
	public := []string{"b-1-public.example.com:9198", "b-2-public.example.com:9198"}

	c := ClusterInfo{
		ARN:           "arn:aws:kafka:us-east-1:123:cluster/test/id",
		Name:          "test",
		Brokers:       private,
		PublicBrokers: public,
		State:         "ACTIVE",
		Region:        "us-east-1",
	}

	if len(c.Brokers) != 2 {
		t.Errorf("Brokers: got %d, want 2", len(c.Brokers))
	}
	if len(c.PublicBrokers) != 2 {
		t.Errorf("PublicBrokers: got %d, want 2", len(c.PublicBrokers))
	}
	// Sanity: ports differ.
	for _, b := range c.Brokers {
		if len(b) == 0 || b[len(b)-4:] != "9098" {
			t.Errorf("private broker %q should end in 9098", b)
		}
	}
	for _, b := range c.PublicBrokers {
		if len(b) == 0 || b[len(b)-4:] != "9198" {
			t.Errorf("public broker %q should end in 9198", b)
		}
	}
}

// ── DiscoverClusters (no real AWS) ────────────────────────────────────────────

// TestDiscoverClusters_ReturnsNilNotErrorWhenNoCreds verifies that missing AWS
// credentials result in a nil slice (not an error), so callers can treat it
// as "no clusters found" rather than a failure.
func TestDiscoverClusters_ReturnsNilNotErrorWhenNoCreds(t *testing.T) {
	t.Setenv("AWS_PROFILE", "kpanel-nonexistent-profile-for-testing")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")

	ctx := context.Background()
	clusters, err := DiscoverClusters(ctx, "us-east-1")

	if err != nil {
		t.Errorf("expected nil error when credentials are unavailable, got: %v", err)
	}
	if clusters != nil {
		t.Errorf("expected nil clusters when credentials are unavailable, got: %v", clusters)
	}
}

// ── ClusterName ───────────────────────────────────────────────────────────────

// TestClusterName_InvalidARN verifies that ClusterName returns an error when
// the ARN is invalid or credentials are unavailable, without panicking.
func TestClusterName_InvalidARN(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name string
		arn  string
	}{
		{"empty ARN", ""},
		{"malformed ARN", "not-an-arn"},
		{"wrong service ARN", "arn:aws:iam::123:role/MyRole"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			_, err := ClusterName(ctx, "us-east-1", "", c.arn)
			if err == nil {
				t.Errorf("ClusterName(%q) expected error, got nil", c.arn)
			}
			// Error must be a non-empty string (not a silent failure).
			if strings.TrimSpace(err.Error()) == "" {
				t.Errorf("ClusterName(%q) returned blank error", c.arn)
			}
		})
	}
}
