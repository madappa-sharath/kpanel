//go:build integration

package api_test

import (
	"net/http"
	"testing"
)

// TestClusterOverview_Integration_HTTPShape verifies the endpoint returns 200
// and a fully-populated JSON body on a live cluster.
func TestClusterOverview_Integration_HTTPShape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "shape-test")

	w := do(t, h, http.MethodGet, "/api/connections/shape-test/overview", nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}

	var resp overviewResp
	decodeJSON(t, w, &resp)

	if resp.BrokerCount < 1 {
		t.Errorf("brokerCount: got %d, want >= 1", resp.BrokerCount)
	}
	if resp.KafkaVersion == "" || resp.KafkaVersion == "unknown" {
		t.Errorf("kafkaVersion: got %q, want a real version string", resp.KafkaVersion)
	}
	if resp.OfflinePartitions != 0 {
		t.Errorf("offlinePartitions: got %d, want 0 on a healthy cluster", resp.OfflinePartitions)
	}
	if resp.UnderReplicated != 0 {
		t.Errorf("underReplicated: got %d, want 0 on a healthy cluster", resp.UnderReplicated)
	}
}

// TestClusterOverview_Integration_BrokerFleet verifies broker field completeness
// and that exactly one broker carries isController=true with a nodeId matching controllerId.
func TestClusterOverview_Integration_BrokerFleet(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "broker-fleet-test")

	w := do(t, h, http.MethodGet, "/api/connections/broker-fleet-test/overview", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp overviewResp
	decodeJSON(t, w, &resp)

	if len(resp.Brokers) == 0 {
		t.Fatal("brokers: got empty list")
	}
	if len(resp.Brokers) != resp.BrokerCount {
		t.Errorf("len(brokers)=%d != brokerCount=%d", len(resp.Brokers), resp.BrokerCount)
	}

	controllers := 0
	for _, b := range resp.Brokers {
		if b.Host == "" {
			t.Errorf("broker %d: host is empty", b.NodeID)
		}
		if b.Port <= 0 {
			t.Errorf("broker %d: port %d is invalid", b.NodeID, b.Port)
		}
		if b.IsController {
			controllers++
			if b.NodeID != resp.ControllerID {
				t.Errorf("broker %d has isController=true but controllerId=%d", b.NodeID, resp.ControllerID)
			}
		}
	}
	if controllers != 1 {
		t.Errorf("expected exactly 1 controller broker, got %d", controllers)
	}
}

// TestClusterOverview_Integration_PartitionCounts creates a topic and verifies
// totalPartitions reflects it and partition health fields remain at zero.
func TestClusterOverview_Integration_PartitionCounts(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "partition-count-test")

	const partitions = 3
	createTopic(t, "test-overview-partitions", partitions)

	w := do(t, h, http.MethodGet, "/api/connections/partition-count-test/overview", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp overviewResp
	decodeJSON(t, w, &resp)

	if resp.TopicCount < 1 {
		t.Errorf("topicCount: got %d, want >= 1", resp.TopicCount)
	}
	if resp.TotalPartitions < partitions {
		t.Errorf("totalPartitions: got %d, want >= %d", resp.TotalPartitions, partitions)
	}
	if resp.OfflinePartitions != 0 {
		t.Errorf("offlinePartitions: got %d, want 0", resp.OfflinePartitions)
	}
	if resp.UnderReplicated != 0 {
		t.Errorf("underReplicated: got %d, want 0", resp.UnderReplicated)
	}
}

// TestClusterOverview_Integration_Configs verifies that at least the core
// cluster config keys are returned and have non-empty values.
func TestClusterOverview_Integration_Configs(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "config-test")

	w := do(t, h, http.MethodGet, "/api/connections/config-test/overview", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp overviewResp
	decodeJSON(t, w, &resp)

	wantKeys := []string{
		"log.retention.hours",
		"default.replication.factor",
		"min.insync.replicas",
	}
	for _, key := range wantKeys {
		entry, ok := resp.Configs[key]
		if !ok {
			t.Errorf("configs[%q]: missing", key)
			continue
		}
		if entry.Value == "" {
			t.Errorf("configs[%q].value: empty", key)
		}
		validSources := map[string]bool{"default": true, "dynamic": true, "static": true, "unknown": true}
		if !validSources[entry.Source] {
			t.Errorf("configs[%q].source: invalid value %q", key, entry.Source)
		}
	}
}
