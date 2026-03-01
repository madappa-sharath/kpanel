//go:build integration

package api_test

import (
	"context"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/kpanel/kpanel/internal/config"
	kpkafka "github.com/kpanel/kpanel/internal/kafka"
)

// ── shared response types ────────────────────────────────────────────────────

type configEntryResp struct {
	Value  string `json:"value"`
	Source string `json:"source"`
}

type brokerSummaryResp struct {
	NodeID       int32  `json:"nodeId"`
	Host         string `json:"host"`
	Port         int32  `json:"port"`
	Rack         string `json:"rack"`
	IsController bool   `json:"isController"`
}

type overviewResp struct {
	ClusterID          string                     `json:"clusterId"`
	KafkaVersion       string                     `json:"kafkaVersion"`
	ControllerID       int32                      `json:"controllerId"`
	BrokerCount        int                        `json:"brokerCount"`
	Brokers            []brokerSummaryResp        `json:"brokers"`
	TotalPartitions    int                        `json:"totalPartitions"`
	UnderReplicated    int                        `json:"underReplicated"`
	OfflinePartitions  int                        `json:"offlinePartitions"`
	TopicCount         int                        `json:"topicCount"`
	ConsumerGroupCount int                        `json:"consumerGroupCount"`
	Configs            map[string]configEntryResp `json:"configs"`
}

type topicSummaryResp struct {
	Name                      string `json:"name"`
	Partitions                int    `json:"partitions"`
	ReplicationFactor         int    `json:"replication_factor"`
	Internal                  bool   `json:"internal"`
	ISRHealth                 string `json:"isr_health"`
	UnderReplicatedPartitions int    `json:"under_replicated_partitions"`
}

type partitionDetailResp struct {
	Partition      int32   `json:"partition"`
	Leader         int32   `json:"leader"`
	Replicas       []int32 `json:"replicas"`
	ISR            []int32 `json:"isr"`
	LogStartOffset int64   `json:"log_start_offset"`
	HighWatermark  int64   `json:"high_watermark"`
}

type topicDetailResp struct {
	Name       string                     `json:"name"`
	Partitions []partitionDetailResp      `json:"partitions"`
	Config     map[string]configEntryResp `json:"config"`
}

type messageResp struct {
	Partition int32             `json:"partition"`
	Offset    int64             `json:"offset"`
	Timestamp string            `json:"timestamp"`
	Key       *string           `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers"`
	Size      int               `json:"size"`
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
// It registers a t.Cleanup that deletes the topic after the test completes so that each
// test run starts with a clean slate.
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
	t.Cleanup(func() { deleteTopic(t, topic) })
}

// deleteTopic removes a topic via kadm. Errors are logged (not fatal) so that
// a cleanup failure never obscures the actual test result.
func deleteTopic(t *testing.T, topic string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cl, err := kpkafka.NewClient(ctx, &config.Cluster{
		ID: "seed", Name: "seed", Platform: "generic", Brokers: []string{testBroker},
	})
	if err != nil {
		t.Logf("deleteTopic: kafka client: %v", err)
		return
	}
	defer cl.Close()

	if _, err := cl.DeleteTopics(ctx, topic); err != nil {
		t.Logf("deleteTopic %q: %v", topic, err)
	}
}

// seedMessages produces a batch of messages to topicName using a raw kgo.Client.
func seedMessages(t *testing.T, topicName string, msgs []struct{ key, value string }) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cl, err := kpkafka.NewRawClient(ctx, &config.Cluster{
		ID: "seed", Name: "seed", Platform: "generic", Brokers: []string{testBroker},
	})
	if err != nil {
		t.Fatalf("raw kafka client for seed: %v", err)
	}
	defer cl.Close()

	records := make([]*kgo.Record, len(msgs))
	for i, m := range msgs {
		records[i] = &kgo.Record{Topic: topicName, Key: []byte(m.key), Value: []byte(m.value)}
	}
	if err := cl.ProduceSync(ctx, records...).FirstErr(); err != nil {
		t.Fatalf("produce to %q: %v", topicName, err)
	}
}
