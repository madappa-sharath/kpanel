package api

import (
	"testing"
	"time"
)

type offs = map[topicPartition]partitionOffsets

func TestOffsetRates(t *testing.T) {
	tp0 := topicPartition{"orders", 0}
	tp1 := topicPartition{"orders", 1}
	tests := []struct {
		name        string
		prev, cur   offs
		dtMs        int64
		wantProduce *float64
		wantConsume *float64
		wantCommits int
	}{
		{
			name:        "sums growth across partitions",
			prev:        offs{tp0: {committed: 100, end: 200}, tp1: {committed: 0, end: 50}},
			cur:         offs{tp0: {committed: 130, end: 300}, tp1: {committed: 20, end: 70}},
			dtMs:        10_000,
			wantProduce: ptr(12.0), // (100 + 20) / 10s
			wantConsume: ptr(5.0),  // (30 + 20) / 10s
			wantCommits: 2,
		},
		{
			name:        "skips partitions missing from either set",
			prev:        offs{tp0: {committed: 0, end: 0}},
			cur:         offs{tp0: {committed: 10, end: 10}, tp1: {committed: 900, end: 900}},
			dtMs:        1_000,
			wantProduce: ptr(10.0),
			wantConsume: ptr(10.0),
			wantCommits: 1,
		},
		{
			name:        "consumption skips first commit and backwards reset",
			prev:        offs{tp0: {committed: -1, end: 100}, tp1: {committed: 500, end: 600}},
			cur:         offs{tp0: {committed: 80, end: 110}, tp1: {committed: 0, end: 610}},
			dtMs:        1_000,
			wantProduce: ptr(20.0),
			wantConsume: ptr(0.0),
			wantCommits: 0,
		},
		{
			name:        "counts only partitions that committed",
			prev:        offs{tp0: {committed: 0, end: 0}, tp1: {committed: 5, end: 5}},
			cur:         offs{tp0: {committed: 10, end: 10}, tp1: {committed: 5, end: 9}},
			dtMs:        1_000,
			wantProduce: ptr(14.0),
			wantConsume: ptr(10.0),
			wantCommits: 1,
		},
		{
			name: "nothing to compare",
			prev: nil,
			cur:  offs{tp0: {committed: 1, end: 1}},
			dtMs: 1_000,
		},
		{
			name: "zero interval",
			prev: offs{tp0: {committed: 1, end: 1}},
			cur:  offs{tp0: {committed: 2, end: 2}},
			dtMs: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := offsetRates(tt.prev, tt.cur, tt.dtMs)
			assertRate(t, "produce", d.produce, tt.wantProduce)
			assertRate(t, "consume", d.consume, tt.wantConsume)
			if tt.wantProduce != nil && (d.commits == nil || *d.commits != tt.wantCommits) {
				t.Errorf("commits: got %v, want %d", d.commits, tt.wantCommits)
			}
		})
	}
}

func TestLagSeries_FillsRatesFromPreviousSnapshot(t *testing.T) {
	tp := topicPartition{"orders", 0}
	s := newLagSeries(time.Hour, time.UnixMilli(0))

	s.record(LagSnapshot{Ts: 0}, offs{tp: {committed: 0, end: 0}})
	s.record(LagSnapshot{Ts: 5_000}, offs{tp: {committed: 25, end: 100}})

	h := s.view().Snapshots
	if h[0].ProduceRate != nil || h[0].ConsumeRate != nil {
		t.Fatalf("first snapshot must have no rates, got %+v", h[0])
	}
	assertRate(t, "produce", h[1].ProduceRate, ptr(20.0))
	assertRate(t, "consume", h[1].ConsumeRate, ptr(5.0))
}

func TestLagSeries_KeepsOnlyRetention(t *testing.T) {
	s := newLagSeries(10*time.Second, time.UnixMilli(0))
	for i := int64(1); i <= 5; i++ {
		s.record(LagSnapshot{Ts: i * 5_000}, offs{})
	}
	h := s.view().Snapshots
	if len(h) != 3 || h[0].Ts != 15_000 || h[2].Ts != 25_000 {
		t.Fatalf("got %+v, want the last 10s", h)
	}
}

func TestLagSeries_UseClusterDropsHistoryOnChange(t *testing.T) {
	tp := topicPartition{"orders", 0}
	s := newLagSeries(time.Hour, time.UnixMilli(0))
	s.useCluster("a")
	s.record(LagSnapshot{Ts: 0}, offs{tp: {committed: 0, end: 0}})
	s.useCluster("a")
	if n := len(s.view().Snapshots); n != 1 {
		t.Fatalf("same cluster cleared history: %d", n)
	}
	s.useCluster("b")
	s.record(LagSnapshot{Ts: 5_000}, offs{tp: {committed: 1_000_000, end: 1_000_000}})
	h := s.view().Snapshots
	if len(h) != 1 || h[0].ConsumeRate != nil {
		t.Fatalf("history after repoint: %+v, want one snapshot with no rates", h)
	}
}

func TestLagSeries_ResetBaselineHidesResetAsConsumption(t *testing.T) {
	tp := topicPartition{"orders", 0}
	s := newLagSeries(time.Hour, time.UnixMilli(0))
	s.record(LagSnapshot{Ts: 0}, offs{tp: {committed: 0, end: 1_000_000}})

	s.resetBaseline(7_000)

	// Sample started before the reset: dropped.
	s.record(LagSnapshot{Ts: 6_000}, offs{tp: {committed: 0, end: 1_000_000}})
	if n := len(s.view().Snapshots); n != 1 {
		t.Fatalf("pre-reset sample stored: history length %d, want 1", n)
	}
	s.record(LagSnapshot{Ts: 10_000}, offs{tp: {committed: 1_000_000, end: 1_000_000}})
	s.record(LagSnapshot{Ts: 15_000}, offs{tp: {committed: 1_000_050, end: 1_000_100}})
	h := s.view().Snapshots
	if h[1].ProduceRate != nil || h[1].ConsumeRate != nil {
		t.Fatalf("rates after reset: got %v/%v, want nil", h[1].ProduceRate, h[1].ConsumeRate)
	}
	assertRate(t, "consume", h[2].ConsumeRate, ptr(10.0))
	assertRate(t, "produce", h[2].ProduceRate, ptr(20.0))
}

func TestLagSeries_NoRatesAcrossLongGap(t *testing.T) {
	tp := topicPartition{"orders", 0}
	s := newLagSeries(time.Hour, time.UnixMilli(0))
	s.record(LagSnapshot{Ts: 0}, offs{tp: {committed: 0, end: 0}})
	gap := lagRateMaxGap.Milliseconds() + 1
	s.record(LagSnapshot{Ts: gap}, offs{tp: {committed: 500, end: 900}})
	s.record(LagSnapshot{Ts: gap + 5_000}, offs{tp: {committed: 600, end: 1_000}})
	h := s.view().Snapshots
	if h[1].ProduceRate != nil || h[1].ConsumeRate != nil {
		t.Fatalf("rates across long gap: got %v/%v, want nil", h[1].ProduceRate, h[1].ConsumeRate)
	}
	assertRate(t, "produce", h[2].ProduceRate, ptr(20.0))
}

func TestLagStore_WatchReusesSeries(t *testing.T) {
	ls := NewLagStore()
	a, created := ls.watch("c", "g", time.UnixMilli(0))
	if !created {
		t.Fatal("first watch should create")
	}
	b, created := ls.watch("c", "g", time.UnixMilli(1_000))
	if created || a != b {
		t.Fatal("second watch should reuse the series")
	}
	if idle := a.idle(time.UnixMilli(3_000)); idle != 2*time.Second {
		t.Fatalf("idle: got %v, want 2s", idle)
	}
	if ls.expire("c", "g", a, time.UnixMilli(3_000), 5*time.Second) {
		t.Fatal("expired before ttl")
	}
	if !ls.expire("c", "g", a, time.UnixMilli(7_000), 5*time.Second) {
		t.Fatal("not expired after ttl")
	}
	if _, created := ls.watch("c", "g", time.UnixMilli(8_000)); !created {
		t.Fatal("watch after expiry should create")
	}
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
