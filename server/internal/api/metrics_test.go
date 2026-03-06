package api

import "testing"

func TestResolveUnit(t *testing.T) {
	unitMap := map[string]string{
		"bytes_in": "Bytes/Second",
		"sum_lag":  "Count",
	}

	if got := resolveUnit("bytes_in", unitMap); got != "Bytes/Second" {
		t.Fatalf("resolveUnit exact: got %q, want %q", got, "Bytes/Second")
	}
	if got := resolveUnit("sum_lag_1", unitMap); got != "Count" {
		t.Fatalf("resolveUnit prefix: got %q, want %q", got, "Count")
	}
	if got := resolveUnit("unknown", unitMap); got != "" {
		t.Fatalf("resolveUnit unknown: got %q, want empty", got)
	}
}
