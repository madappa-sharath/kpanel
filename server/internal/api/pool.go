package api

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/kpanel/kpanel/internal/config"
	"github.com/kpanel/kpanel/internal/kafka"
)

type poolEntry struct {
	client      *kadm.Client
	fingerprint string // JSON of the cluster config used to build this client
}

// clientPool caches long-lived kadm.Client instances keyed by cluster ID.
// franz-go clients are goroutine-safe and designed to be reused across requests.
// Creating one per request forces a full TLS + SASL handshake on every API call,
// which adds 2–5 s of latency on AWS MSK (IAM auth over TLS).
type clientPool struct {
	mu      sync.RWMutex
	entries map[string]poolEntry
}

func newClientPool() *clientPool {
	return &clientPool{entries: make(map[string]poolEntry)}
}

func clusterFingerprint(cluster *config.Cluster) string {
	b, _ := json.Marshal(cluster)
	return string(b)
}

// get returns a cached admin client for the cluster, creating or replacing one
// if the cluster config has changed since the client was built. This handles
// the race where an in-flight request holds a stale cluster struct after an
// update: the fingerprint mismatch is caught on the next get and the client is
// replaced.
func (p *clientPool) get(cluster *config.Cluster) (*kadm.Client, error) {
	fp := clusterFingerprint(cluster)

	p.mu.RLock()
	entry, ok := p.entries[cluster.ID]
	p.mu.RUnlock()
	if ok && entry.fingerprint == fp {
		return entry.client, nil
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	// Re-read under write lock — another goroutine may have already built the entry.
	if cur, exists := p.entries[cluster.ID]; exists {
		if cur.fingerprint == fp {
			return cur.client, nil
		}
		// Stale entry (fingerprint mismatch) — close before replacing.
		cur.client.Close()
	}
	cl, err := kafka.NewClient(context.Background(), cluster)
	if err != nil {
		return nil, err
	}
	p.entries[cluster.ID] = poolEntry{client: cl, fingerprint: fp}
	return cl, nil
}

// evict removes and closes the cached client for the given cluster ID.
// Call this when a connection is deleted or its configuration changes.
func (p *clientPool) evict(id string) {
	p.mu.Lock()
	entry, ok := p.entries[id]
	delete(p.entries, id)
	p.mu.Unlock()
	if ok {
		entry.client.Close()
	}
}
