package api

import "testing"

func TestClampSearchLimit(t *testing.T) {
	tests := []struct {
		name string
		in   int
		def  int
		max  int
		want int
	}{
		{"unset falls back to default", 0, defaultSearchScanLimit, maxSearchScanLimit, defaultSearchScanLimit},
		{"negative falls back to default", -5, defaultSearchScanLimit, maxSearchScanLimit, defaultSearchScanLimit},
		{"in range is kept", 25000, defaultSearchScanLimit, maxSearchScanLimit, 25000},
		{"max is kept", maxSearchScanLimit, defaultSearchScanLimit, maxSearchScanLimit, maxSearchScanLimit},
		// The old code reset an over-large value to the default, so asking for
		// more than the ceiling quietly scanned far less than the ceiling.
		{"over max clamps to max", 1_000_000, defaultSearchScanLimit, maxSearchScanLimit, maxSearchScanLimit},
		{"result limit over max clamps to max", 5000, defaultSearchLimit, maxSearchLimit, maxSearchLimit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clampSearchLimit(tt.in, tt.def, tt.max); got != tt.want {
				t.Errorf("clampSearchLimit(%d, %d, %d) = %d, want %d", tt.in, tt.def, tt.max, got, tt.want)
			}
		})
	}
}
