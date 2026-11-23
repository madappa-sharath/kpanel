package api

import "testing"

func TestOffsetRates(t *testing.T) {
	tp0 := topicPartition{"orders", 0}
	tp1 := topicPartition{"orders", 1}
	tests := []struct {
		name        string
		prev, cur   map[topicPartition]partitionOffsets
		dtMs        int64
		wantProduce *float64
		wantConsume *float64
	}{
		{
			name:        "sums growth across partitions",
			prev:        map[topicPartition]partitionOffsets{tp0: {committed: 100, end: 200}, tp1: {committed: 0, end: 50}},
			cur:         map[topicPartition]partitionOffsets{tp0: {committed: 130, end: 300}, tp1: {committed: 20, end: 70}},
			dtMs:        10_000,
			wantProduce: ptr(12.0), // (100 + 20) / 10s
			wantConsume: ptr(5.0),  // (30 + 20) / 10s
		},
		{
			name:        "skips partitions missing from either set",
			prev:        map[topicPartition]partitionOffsets{tp0: {committed: 0, end: 0}},
			cur:         map[topicPartition]partitionOffsets{tp0: {committed: 10, end: 10}, tp1: {committed: 900, end: 900}},
			dtMs:        1_000,
			wantProduce: ptr(10.0),
			wantConsume: ptr(10.0),
		},
		{
			name: "skips first commit and backwards reset",
			prev: map[topicPartition]partitionOffsets{tp0: {committed: -1, end: 100}, tp1: {committed: 500, end: 600}},
			cur:  map[topicPartition]partitionOffsets{tp0: {committed: 80, end: 110}, tp1: {committed: 0, end: 610}},
			dtMs: 1_000,
		},
		{
			name:        "both rates cover the same partitions",
			prev:        map[topicPartition]partitionOffsets{tp0: {committed: 0, end: 0}, tp1: {committed: 500, end: 500}},
			cur:         map[topicPartition]partitionOffsets{tp0: {committed: 10, end: 10}, tp1: {committed: 0, end: 600}},
			dtMs:        1_000,
			wantProduce: ptr(10.0),
			wantConsume: ptr(10.0),
		},
		{
			name: "nothing to compare",
			prev: nil,
			cur:  map[topicPartition]partitionOffsets{tp0: {committed: 1, end: 1}},
			dtMs: 1_000,
		},
		{
			name: "zero interval",
			prev: map[topicPartition]partitionOffsets{tp0: {committed: 1, end: 1}},
			cur:  map[topicPartition]partitionOffsets{tp0: {committed: 2, end: 2}},
			dtMs: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			produce, consume := offsetRates(tt.prev, tt.cur, tt.dtMs)
			assertRate(t, "produce", produce, tt.wantProduce)
			assertRate(t, "consume", consume, tt.wantConsume)
		})
	}
}

func TestLagRingBuffer_FillsRatesFromPreviousSnapshot(t *testing.T) {
	tp := topicPartition{"orders", 0}
	b := newLagRingBuffer(4)

	h := b.appendIfNew(LagSnapshot{Ts: 0}, map[topicPartition]partitionOffsets{tp: {committed: 0, end: 0}}, 5_000)
	if h[0].ProduceRate != nil || h[0].ConsumeRate != nil {
		t.Fatalf("first snapshot must have no rates, got %+v", h[0])
	}

	// Too soon: dropped.
	b.appendIfNew(LagSnapshot{Ts: 1_000}, map[topicPartition]partitionOffsets{tp: {committed: 999, end: 999}}, 5_000)

	h = b.appendIfNew(LagSnapshot{Ts: 10_000}, map[topicPartition]partitionOffsets{tp: {committed: 50, end: 200}}, 5_000)
	if len(h) != 2 {
		t.Fatalf("history length: got %d, want 2", len(h))
	}
	assertRate(t, "produce", h[1].ProduceRate, ptr(20.0))
	assertRate(t, "consume", h[1].ConsumeRate, ptr(5.0))
}

func TestLagRingBuffer_DropsSampleStartedBeforeNewestStored(t *testing.T) {
	tp := topicPartition{"orders", 0}
	b := newLagRingBuffer(4)
	b.appendIfNew(LagSnapshot{Ts: 0}, map[topicPartition]partitionOffsets{tp: {committed: 0, end: 0}}, 5_000)
	b.appendIfNew(LagSnapshot{Ts: 20_000}, map[topicPartition]partitionOffsets{tp: {committed: 100, end: 100}}, 5_000)

	// Slow poll started at 10s, finished last.
	h := b.appendIfNew(LagSnapshot{Ts: 10_000}, map[topicPartition]partitionOffsets{tp: {committed: 50, end: 50}}, 5_000)
	if len(h) != 2 {
		t.Fatalf("history length: got %d, want 2", len(h))
	}
	h = b.appendIfNew(LagSnapshot{Ts: 30_000}, map[topicPartition]partitionOffsets{tp: {committed: 200, end: 200}}, 5_000)
	assertRate(t, "consume", h[2].ConsumeRate, ptr(10.0)) // (200-100) / 10s
}

func TestLagRingBuffer_ResetBaselineHidesResetAsConsumption(t *testing.T) {
	tp := topicPartition{"orders", 0}
	b := newLagRingBuffer(4)
	b.appendIfNew(LagSnapshot{Ts: 0}, map[topicPartition]partitionOffsets{tp: {committed: 0, end: 1_000_000}}, 5_000)

	b.resetBaseline(12_000) // offsets reset to latest at 12s

	// Sample started before the reset: dropped.
	h := b.appendIfNew(LagSnapshot{Ts: 11_000}, map[topicPartition]partitionOffsets{tp: {committed: 0, end: 1_000_000}}, 5_000)
	if len(h) != 1 {
		t.Fatalf("pre-reset sample stored: history length %d, want 1", len(h))
	}
	// First sample after the reset has no rates.
	h = b.appendIfNew(LagSnapshot{Ts: 15_000}, map[topicPartition]partitionOffsets{tp: {committed: 1_000_000, end: 1_000_000}}, 5_000)
	if h[1].ProduceRate != nil || h[1].ConsumeRate != nil {
		t.Fatalf("rates after reset: got %v/%v, want nil", h[1].ProduceRate, h[1].ConsumeRate)
	}
	h = b.appendIfNew(LagSnapshot{Ts: 25_000}, map[topicPartition]partitionOffsets{tp: {committed: 1_000_100, end: 1_000_200}}, 5_000)
	assertRate(t, "consume", h[2].ConsumeRate, ptr(10.0))
	assertRate(t, "produce", h[2].ProduceRate, ptr(20.0))
}

func TestLagRingBuffer_NoRatesAcrossLongGap(t *testing.T) {
	tp := topicPartition{"orders", 0}
	b := newLagRingBuffer(4)
	b.appendIfNew(LagSnapshot{Ts: 0}, map[topicPartition]partitionOffsets{tp: {committed: 0, end: 0}}, 5_000)
	gap := lagRateMaxGap.Milliseconds() + 1
	h := b.appendIfNew(LagSnapshot{Ts: gap}, map[topicPartition]partitionOffsets{tp: {committed: 500, end: 900}}, 5_000)
	if h[1].ProduceRate != nil || h[1].ConsumeRate != nil {
		t.Fatalf("rates across long gap: got %v/%v, want nil", h[1].ProduceRate, h[1].ConsumeRate)
	}
	h = b.appendIfNew(LagSnapshot{Ts: gap + 10_000}, map[topicPartition]partitionOffsets{tp: {committed: 600, end: 1_100}}, 5_000)
	assertRate(t, "produce", h[2].ProduceRate, ptr(20.0))
}

func ptr(v float64) *float64 { return &v }

func assertRate(t *testing.T, name string, got, want *float64) {
	t.Helper()
	switch {
	case got == nil && want == nil:
	case got == nil || want == nil:
		t.Errorf("%s: got %v, want %v", name, got, want)
	case *got != *want:
		t.Errorf("%s: got %v, want %v", name, *got, *want)
	}
}
