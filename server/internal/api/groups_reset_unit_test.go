package api

import "testing"

func TestResolveResetStrategy_StringTimestampWithMillis(t *testing.T) {
	ts := int64(1700000000000)
	strategy, gotTS, gotOffset, err := resolveResetStrategy(resetOffsetsRequest{
		Strategy:    "timestamp",
		TimestampMS: &ts,
	})
	if err != nil {
		t.Fatalf("resolveResetStrategy returned error: %v", err)
	}
	if strategy != "timestamp" {
		t.Fatalf("strategy: got %q, want timestamp", strategy)
	}
	if gotTS != ts {
		t.Fatalf("timestamp_ms: got %d, want %d", gotTS, ts)
	}
	if gotOffset != 0 {
		t.Fatalf("offset: got %d, want 0", gotOffset)
	}
}

func TestResolveResetStrategy_StringOffsetWithValue(t *testing.T) {
	off := int64(42)
	strategy, gotTS, gotOffset, err := resolveResetStrategy(resetOffsetsRequest{
		Strategy: "offset",
		Offset:   &off,
	})
	if err != nil {
		t.Fatalf("resolveResetStrategy returned error: %v", err)
	}
	if strategy != "offset" {
		t.Fatalf("strategy: got %q, want offset", strategy)
	}
	if gotTS != 0 {
		t.Fatalf("timestamp_ms: got %d, want 0", gotTS)
	}
	if gotOffset != off {
		t.Fatalf("offset: got %d, want %d", gotOffset, off)
	}
}

func TestResolveResetStrategy_ObjectTimestamp(t *testing.T) {
	strategy, gotTS, _, err := resolveResetStrategy(resetOffsetsRequest{
		Strategy: map[string]any{"timestamp": "2025-03-01T00:00:00Z"},
	})
	if err != nil {
		t.Fatalf("resolveResetStrategy returned error: %v", err)
	}
	if strategy != "timestamp" {
		t.Fatalf("strategy: got %q, want timestamp", strategy)
	}
	if gotTS <= 0 {
		t.Fatalf("timestamp_ms: got %d, want > 0", gotTS)
	}
}

func TestResolveResetStrategy_InvalidTimestampStringWithoutMillis(t *testing.T) {
	_, _, _, err := resolveResetStrategy(resetOffsetsRequest{Strategy: "timestamp"})
	if err == nil {
		t.Fatal("expected error for timestamp strategy without timestamp value")
	}
}

func TestResolveResetStrategy_InvalidOffsetStringWithoutValue(t *testing.T) {
	_, _, _, err := resolveResetStrategy(resetOffsetsRequest{Strategy: "offset"})
	if err == nil {
		t.Fatal("expected error for offset strategy without offset value")
	}
}
