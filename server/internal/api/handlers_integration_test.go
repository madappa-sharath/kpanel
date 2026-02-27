//go:build integration

package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/kpanel/kpanel/internal/config"
	kpkafka "github.com/kpanel/kpanel/internal/kafka"
)

// overviewResp mirrors clusterOverviewResponse for decoding in tests.
type overviewResp struct {
	ClusterID          string            `json:"clusterId"`
	KafkaVersion       string            `json:"kafkaVersion"`
	ControllerID       int32             `json:"controllerId"`
	BrokerCount        int               `json:"brokerCount"`
	Brokers            []brokerSummaryResp `json:"brokers"`
	TotalPartitions    int               `json:"totalPartitions"`
	UnderReplicated    int               `json:"underReplicated"`
	OfflinePartitions  int               `json:"offlinePartitions"`
	TopicCount         int               `json:"topicCount"`
	ConsumerGroupCount int               `json:"consumerGroupCount"`
	Configs            map[string]string `json:"configs"`
}

type brokerSummaryResp struct {
	NodeID       int32  `json:"nodeId"`
	Host         string `json:"host"`
	Port         int32  `json:"port"`
	Rack         string `json:"rack"`
	IsController bool   `json:"isController"`
}

// addCluster registers a cluster pointing at testBroker and returns its ID.
func addCluster(t *testing.T, store *config.Store, id string) {
	t.Helper()
	if err := store.Add(config.Cluster{
		ID:       id,
		Name:     "integration-" + id,
		Platform: "generic",
		Brokers:  []string{testBroker},
	}); err != nil {
		t.Fatalf("store.Add %q: %v", id, err)
	}
}

// createTopic seeds a topic directly via kadm so integration tests can assert on topicCount.
func createTopic(t *testing.T, topic string, partitions int32) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cl, err := kpkafka.NewClient(ctx, &config.Cluster{
		ID: "seed", Name: "seed", Platform: "generic", Brokers: []string{testBroker},
	})
	if err != nil {
		t.Fatalf("kafka client for topic seed: %v", err)
	}
	defer cl.Close()

	// CreateTopics outer error is request-level only; topic-already-exists is a
	// response-level error and is silently ignored here.
	if _, err := cl.CreateTopics(ctx, partitions, 1, nil, topic); err != nil {
		t.Fatalf("create topic %q: %v", topic, err)
	}
}

// --- ClusterOverview integration tests ---

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
		if v, ok := resp.Configs[key]; !ok || v == "" {
			t.Errorf("configs[%q]: missing or empty (got %q)", key, v)
		}
	}
}
