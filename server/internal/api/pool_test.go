package api

import (
	"testing"

	"github.com/kpanel/kpanel/internal/config"
)

// franz-go is lazy — kgo.NewClient does not dial until the first API call,
// so these tests can use non-existent broker addresses safely.

func TestClientPool_CachesClient(t *testing.T) {
	p := newClientPool()
	cluster := &config.Cluster{ID: "c1", Name: "C1", Platform: "generic", Brokers: []string{"localhost:19092"}}

	cl1, err := p.get(cluster)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	cl2, err := p.get(cluster)
	if err != nil {
		t.Fatalf("get second: %v", err)
	}
	if cl1 != cl2 {
		t.Error("expected same cached client on second get")
	}
	p.evict(cluster.ID)
}

func TestClientPool_FingerprintMismatchReplacesClient(t *testing.T) {
	p := newClientPool()
	v1 := &config.Cluster{ID: "c2", Name: "C2", Platform: "generic", Brokers: []string{"localhost:19092"}}
	v2 := &config.Cluster{ID: "c2", Name: "C2", Platform: "generic", Brokers: []string{"localhost:19093"}}

	cl1, err := p.get(v1)
	if err != nil {
		t.Fatalf("get v1: %v", err)
	}
	cl2, err := p.get(v2)
	if err != nil {
		t.Fatalf("get v2: %v", err)
	}
	if cl1 == cl2 {
		t.Error("expected a new client after config change (fingerprint mismatch)")
	}
	p.evict(v2.ID)
}

func TestClientPool_EvictForcesNewClient(t *testing.T) {
	p := newClientPool()
	cluster := &config.Cluster{ID: "c3", Name: "C3", Platform: "generic", Brokers: []string{"localhost:19092"}}

	cl1, _ := p.get(cluster)
	p.evict(cluster.ID)
	cl2, err := p.get(cluster)
	if err != nil {
		t.Fatalf("get after evict: %v", err)
	}
	if cl1 == cl2 {
		t.Error("expected new client after evict")
	}
	p.evict(cluster.ID)
}
