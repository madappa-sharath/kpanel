package api

import (
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestParseQuery(t *testing.T) {
	tests := []struct {
		input   string
		isPlain bool
		path    string
		op      filterOp
		litType string
		strVal  string
		numVal  float64
		boolVal bool
		wantErr bool
	}{
		{input: "", wantErr: true},
		{input: "  ", wantErr: true},

		// Plain text
		{input: "hello world", isPlain: true},
		{input: "error", isPlain: true},

		// Path existence (dot, no spaces)
		{input: "user.premium", path: "user.premium", op: opExists},
		{input: "a.b.c", path: "a.b.c", op: opExists},

		// Strip $ prefix
		{input: "$.user.id == \"abc\"", path: "user.id", op: opEq, litType: "string", strVal: "abc"},
		{input: "$user.id == \"abc\"", path: "user.id", op: opEq, litType: "string", strVal: "abc"},

		// Equality operators
		{input: `user.id == "abc"`, path: "user.id", op: opEq, litType: "string", strVal: "abc"},
		{input: `user.id != "abc"`, path: "user.id", op: opNe, litType: "string", strVal: "abc"},
		{input: `metrics.latency > 100`, path: "metrics.latency", op: opGt, litType: "number", numVal: 100},
		{input: `metrics.latency >= 100`, path: "metrics.latency", op: opGte, litType: "number", numVal: 100},
		{input: `metrics.latency < 50`, path: "metrics.latency", op: opLt, litType: "number", numVal: 50},
		{input: `metrics.latency <= 50`, path: "metrics.latency", op: opLte, litType: "number", numVal: 50},
		{input: `name ~= "kafka"`, path: "name", op: opContains, litType: "string", strVal: "kafka"},

		// Bool literals
		{input: `user.active == true`, path: "user.active", op: opEq, litType: "bool", boolVal: true},
		{input: `user.active == false`, path: "user.active", op: opEq, litType: "bool", boolVal: false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			pq, err := parseQuery(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if pq.isPlain != tt.isPlain {
				t.Errorf("isPlain: got %v, want %v", pq.isPlain, tt.isPlain)
			}
			if !tt.isPlain {
				if pq.path != tt.path {
					t.Errorf("path: got %q, want %q", pq.path, tt.path)
				}
				if pq.op != tt.op {
					t.Errorf("op: got %v, want %v", pq.op, tt.op)
				}
				if tt.op != opExists {
					if pq.litType != tt.litType {
						t.Errorf("litType: got %q, want %q", pq.litType, tt.litType)
					}
					switch tt.litType {
					case "string":
						if pq.strVal != tt.strVal {
							t.Errorf("strVal: got %q, want %q", pq.strVal, tt.strVal)
						}
					case "number":
						if pq.numVal != tt.numVal {
							t.Errorf("numVal: got %v, want %v", pq.numVal, tt.numVal)
						}
					case "bool":
						if pq.boolVal != tt.boolVal {
							t.Errorf("boolVal: got %v, want %v", pq.boolVal, tt.boolVal)
						}
					}
				}
			}
		})
	}
}

func rec(key, value string) *kgo.Record {
	return &kgo.Record{
		Key:   []byte(key),
		Value: []byte(value),
	}
}

func TestMatchRecord(t *testing.T) {
	tests := []struct {
		name  string
		query string
		rec   *kgo.Record
		want  bool
	}{
		// Plain text
		{"plain match in value", "hello", rec("k", `{"msg":"hello world"}`), true},
		{"plain match in key", "mykey", rec("mykey", `{"x":1}`), true},
		{"plain no match", "xyz", rec("k", `{"msg":"hello"}`), false},
		{"plain case insensitive", "HELLO", rec("k", `{"msg":"hello"}`), true},

		// JSON path existence — pure presence check, not truthiness
		{"exists found true", "user.premium", rec("", `{"user":{"premium":true}}`), true},
		{"exists found false", "user.premium", rec("", `{"user":{"premium":false}}`), true},
		{"exists found null", "user.premium", rec("", `{"user":{"premium":null}}`), true},
		{"exists found zero", "user.premium", rec("", `{"user":{"premium":0}}`), true},
		{"exists found empty string", "user.premium", rec("", `{"user":{"premium":""}}`), true},
		{"exists missing", "user.premium", rec("", `{"user":{}}`), false},
		{"exists not json", "user.premium", rec("", `not json`), false},

		// Equality
		{`eq string match`, `user.id == "abc"`, rec("", `{"user":{"id":"abc"}}`), true},
		{`eq string no match`, `user.id == "abc"`, rec("", `{"user":{"id":"xyz"}}`), false},
		{`eq missing path no match`, `user.id == "abc"`, rec("", `{"user":{}}`), false},
		{`ne string match`, `user.id != "abc"`, rec("", `{"user":{"id":"xyz"}}`), true},
		{`ne string no match`, `user.id != "abc"`, rec("", `{"user":{"id":"abc"}}`), false},
		{`ne missing path no match`, `user.id != "abc"`, rec("", `{"user":{}}`), false},

		// Numeric comparisons
		{`gt match`, `metrics.latency > 100`, rec("", `{"metrics":{"latency":150}}`), true},
		{`gt no match`, `metrics.latency > 100`, rec("", `{"metrics":{"latency":50}}`), false},
		{`gt missing path no match`, `metrics.latency > 100`, rec("", `{"metrics":{}}`), false},
		{`gte match eq`, `metrics.latency >= 100`, rec("", `{"metrics":{"latency":100}}`), true},
		{`lt match`, `metrics.latency < 100`, rec("", `{"metrics":{"latency":50}}`), true},
		{`lt missing path no match`, `metrics.latency < 100`, rec("", `{"metrics":{}}`), false},
		{`lte match`, `metrics.latency <= 100`, rec("", `{"metrics":{"latency":100}}`), true},

		// Contains
		{`contains match`, `name ~= "kafka"`, rec("", `{"name":"apache-kafka-broker"}`), true},
		{`contains no match`, `name ~= "kafka"`, rec("", `{"name":"redis"}`), false},

		// Bool
		{`bool eq true`, `user.active == true`, rec("", `{"user":{"active":true}}`), true},
		{`bool eq false no match`, `user.active == true`, rec("", `{"user":{"active":false}}`), false},
		{`bool eq false missing path no match`, `user.active == false`, rec("", `{"user":{}}`), false},
		{`bool eq false present match`, `user.active == false`, rec("", `{"user":{"active":false}}`), true},

		// Contains missing path
		{`contains missing path no match`, `name ~= "kafka"`, rec("", `{}`), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pq, err := parseQuery(tt.query)
			if err != nil {
				t.Fatalf("parseQuery error: %v", err)
			}
			got := matchRecord(tt.rec, pq)
			if got != tt.want {
				t.Errorf("matchRecord = %v, want %v", got, tt.want)
			}
		})
	}
}
