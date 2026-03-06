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
