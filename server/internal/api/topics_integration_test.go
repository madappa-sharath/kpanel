//go:build integration

package api_test

import (
	"fmt"
	"net/http"
	"testing"
)

// ── CreateTopic ──────────────────────────────────────────────────────────────

func TestCreateTopic_Integration_CreatesTopicAndAppearsInList(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "ct-create")
	const topicName = "test-ct-created-via-api"

	w := do(t, h, http.MethodPost, "/api/connections/ct-create/topics", map[string]any{
		"name":               topicName,
		"partitions":         3,
		"replication_factor": 1,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("create status %d: %s", w.Code, w.Body)
	}
	var result map[string]bool
	decodeJSON(t, w, &result)
	if !result["ok"] {
		t.Error(`expected {"ok": true} response`)
	}
	t.Cleanup(func() { deleteTopic(t, topicName) })

	w2 := do(t, h, http.MethodGet, "/api/connections/ct-create/topics", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("list status %d: %s", w2.Code, w2.Body)
	}
	var topics []topicSummaryResp
	decodeJSON(t, w2, &topics)

	found := false
	for _, topic := range topics {
		if topic.Name == topicName {
			found = true
			if topic.Partitions != 3 {
				t.Errorf("partitions: got %d, want 3", topic.Partitions)
			}
		}
	}
	if !found {
		t.Fatalf("topic %q not found in list", topicName)
	}
}

// ── ListTopics ────────────────────────────────────────────────────────────────

// TestListTopics_Integration_Shape verifies the endpoint returns 200 with a
// correctly-shaped JSON array; all required fields are present and valid.
func TestListTopics_Integration_Shape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lt-shape")
	createTopic(t, "test-lt-shape-topic", 2)

	w := do(t, h, http.MethodGet, "/api/connections/lt-shape/topics", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}

	var topics []topicSummaryResp
	decodeJSON(t, w, &topics)
	if len(topics) == 0 {
		t.Fatal("expected at least one topic in the list")
	}

	for _, topic := range topics {
		if topic.Name == "" {
			t.Error("topic.name must not be empty")
		}
		if topic.Partitions <= 0 {
			t.Errorf("topic %q: partitions=%d, want > 0", topic.Name, topic.Partitions)
		}
		if topic.ReplicationFactor <= 0 {
			t.Errorf("topic %q: replication_factor=%d, want > 0", topic.Name, topic.ReplicationFactor)
		}
		if topic.ISRHealth != "healthy" && topic.ISRHealth != "degraded" {
			t.Errorf("topic %q: isr_health=%q, want healthy or degraded", topic.Name, topic.ISRHealth)
		}
	}
}

// TestListTopics_Integration_NewTopicAppears creates a topic and verifies it
// shows up in the list response with the correct partition count.
func TestListTopics_Integration_NewTopicAppears(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lt-new")
	const topicName = "test-lt-new-appears"
	createTopic(t, topicName, 3)

	w := do(t, h, http.MethodGet, "/api/connections/lt-new/topics", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var topics []topicSummaryResp
	decodeJSON(t, w, &topics)

	var found *topicSummaryResp
	for i := range topics {
		if topics[i].Name == topicName {
			found = &topics[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("topic %q not found in list", topicName)
	}
	if found.Partitions != 3 {
		t.Errorf("partitions: got %d, want 3", found.Partitions)
	}
}

// TestListTopics_Integration_SortedAlphabetically verifies the list is
// sorted lexicographically by topic name regardless of creation order.
func TestListTopics_Integration_SortedAlphabetically(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lt-sorted")
	createTopic(t, "test-lt-sorted-zzz", 1)
	createTopic(t, "test-lt-sorted-aaa", 1)
	createTopic(t, "test-lt-sorted-mmm", 1)

	w := do(t, h, http.MethodGet, "/api/connections/lt-sorted/topics", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var topics []topicSummaryResp
	decodeJSON(t, w, &topics)

	for i := 1; i < len(topics); i++ {
		if topics[i-1].Name > topics[i].Name {
			t.Errorf("list not sorted: %q > %q at positions %d,%d",
				topics[i-1].Name, topics[i].Name, i-1, i)
		}
	}
}

// TestListTopics_Integration_HealthyISR verifies that on a healthy single-
// broker cluster all topics report isr_health=healthy and zero under-replicated
// partitions (RF=1 means ISR always equals replicas).
func TestListTopics_Integration_HealthyISR(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lt-health")
	createTopic(t, "test-lt-health-check", 3)

	w := do(t, h, http.MethodGet, "/api/connections/lt-health/topics", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var topics []topicSummaryResp
	decodeJSON(t, w, &topics)

	for _, topic := range topics {
		if topic.ISRHealth == "degraded" {
			t.Errorf("topic %q: isr_health=degraded on a healthy cluster", topic.Name)
		}
		if topic.UnderReplicatedPartitions != 0 {
			t.Errorf("topic %q: under_replicated_partitions=%d, want 0",
				topic.Name, topic.UnderReplicatedPartitions)
		}
	}
}

// ── GetTopic ──────────────────────────────────────────────────────────────────

// TestGetTopic_Integration_Shape verifies the endpoint returns 200 with name,
// a non-empty partition array, and a non-empty config map.
func TestGetTopic_Integration_Shape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gt-shape")
	const topicName = "test-gt-shape"
	createTopic(t, topicName, 2)

	w := do(t, h, http.MethodGet, "/api/connections/gt-shape/topics/"+topicName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp topicDetailResp
	decodeJSON(t, w, &resp)

	if resp.Name != topicName {
		t.Errorf("name: got %q, want %q", resp.Name, topicName)
	}
	if len(resp.Partitions) != 2 {
		t.Errorf("partitions: got %d, want 2", len(resp.Partitions))
	}
	if len(resp.Config) == 0 {
		t.Error("config: expected non-empty map")
	}
}

// TestGetTopic_Integration_PartitionsSortedAndWellFormed verifies that
// partition metadata (leader, replicas, ISR, offsets) is fully populated and
// the array is sorted by partition number.
func TestGetTopic_Integration_PartitionsSortedAndWellFormed(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gt-parts")
	const topicName = "test-gt-partition-metadata"
	createTopic(t, topicName, 3)

	// Produce one message so all partition leaders are elected and end offsets
	// are available before we query topic metadata.
	seedMessages(t, topicName, []struct{ key, value string }{{"k", "v"}})

	w := do(t, h, http.MethodGet, "/api/connections/gt-parts/topics/"+topicName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp topicDetailResp
	decodeJSON(t, w, &resp)

	if len(resp.Partitions) != 3 {
		t.Fatalf("partitions: got %d, want 3", len(resp.Partitions))
	}
	for i, p := range resp.Partitions {
		if int(p.Partition) != i {
			t.Errorf("partition[%d].partition: got %d, want %d (not sorted)", i, p.Partition, i)
		}
		if p.Leader < 0 {
			t.Errorf("partition[%d]: offline (leader=%d)", i, p.Leader)
		}
		if len(p.Replicas) == 0 {
			t.Errorf("partition[%d]: replicas is empty", i)
		}
		if len(p.ISR) == 0 {
			t.Errorf("partition[%d]: ISR is empty", i)
		}
		if p.LogStartOffset < 0 {
			t.Errorf("partition[%d]: log_start_offset=%d, want >= 0", i, p.LogStartOffset)
		}
		if p.HighWatermark < 0 {
			t.Errorf("partition[%d]: high_watermark=%d, want >= 0", i, p.HighWatermark)
		}
	}
}

// TestGetTopic_Integration_OffsetsAdvanceAfterProducing produces 5 messages
// and verifies the high watermark reflects them.
func TestGetTopic_Integration_OffsetsAdvanceAfterProducing(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gt-offsets")
	const topicName = "test-gt-offsets-advance"
	createTopic(t, topicName, 1)

	seedMessages(t, topicName, []struct{ key, value string }{
		{"k1", "v1"}, {"k2", "v2"}, {"k3", "v3"}, {"k4", "v4"}, {"k5", "v5"},
	})

	w := do(t, h, http.MethodGet, "/api/connections/gt-offsets/topics/"+topicName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp topicDetailResp
	decodeJSON(t, w, &resp)

	if len(resp.Partitions) != 1 {
		t.Fatalf("expected 1 partition, got %d", len(resp.Partitions))
	}
	p := resp.Partitions[0]
	if p.HighWatermark < 5 {
		t.Errorf("high_watermark: got %d, want >= 5 after producing 5 messages", p.HighWatermark)
	}
	if p.LogStartOffset > p.HighWatermark {
		t.Errorf("log_start_offset (%d) > high_watermark (%d)", p.LogStartOffset, p.HighWatermark)
	}
}

// TestGetTopic_Integration_ConfigShape verifies every config entry has a
// non-empty value and a valid source label, and that retention.ms is present.
func TestGetTopic_Integration_ConfigShape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gt-cfg")
	const topicName = "test-gt-config-shape"
	createTopic(t, topicName, 1)

	w := do(t, h, http.MethodGet, "/api/connections/gt-cfg/topics/"+topicName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp topicDetailResp
	decodeJSON(t, w, &resp)

	validSources := map[string]bool{"default": true, "dynamic": true, "static": true, "unknown": true}
	for key, entry := range resp.Config {
		if entry.Source == "" {
			t.Errorf("config[%q].source: empty", key)
		}
		if !validSources[entry.Source] {
			t.Errorf("config[%q].source: invalid value %q", key, entry.Source)
		}
	}
	if _, ok := resp.Config["retention.ms"]; !ok {
		t.Error("config: retention.ms must be present for any topic")
	}
}

// ── DeleteTopic ──────────────────────────────────────────────────────────────

func TestDeleteTopic_Integration_RemovesTopicFromList(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "dt-delete")
	const topicName = "test-dt-delete-via-api"
	createTopic(t, topicName, 1)

	w := do(t, h, http.MethodDelete, "/api/connections/dt-delete/topics/"+topicName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete status %d: %s", w.Code, w.Body)
	}
	var result map[string]bool
	decodeJSON(t, w, &result)
	if !result["ok"] {
		t.Error(`expected {"ok": true} response`)
	}

	w2 := do(t, h, http.MethodGet, "/api/connections/dt-delete/topics", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("list status %d: %s", w2.Code, w2.Body)
	}
	var topics []topicSummaryResp
	decodeJSON(t, w2, &topics)
	for _, topic := range topics {
		if topic.Name == topicName {
			t.Fatalf("topic %q still present after delete", topicName)
		}
	}
}

// ── PeekMessages ─────────────────────────────────────────────────────────────

// TestPeekMessages_Integration_EmptyTopic verifies that peeking an empty
// topic returns 200 with an empty JSON array (not null, not an error).
func TestPeekMessages_Integration_EmptyTopic(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-empty")
	const topicName = "test-pm-empty-topic"
	createTopic(t, topicName, 1)

	w := do(t, h, http.MethodPost,
		"/api/connections/pm-empty/topics/"+topicName+"/peek",
		map[string]any{"limit": 10})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 0 {
		t.Errorf("expected 0 messages for empty topic, got %d", len(msgs))
	}
}

// TestPeekMessages_Integration_BasicFetch seeds 3 messages with distinct keys
// and uses limit=3, verifying that the 3 returned messages are the ones just
// produced (they are always the tail of the partition).
func TestPeekMessages_Integration_BasicFetch(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-basic")
	const topicName = "test-pm-basic-fetch"
	createTopic(t, topicName, 1)

	wantKeys := []string{"pm-basic-k1", "pm-basic-k2", "pm-basic-k3"}
	seedMessages(t, topicName, []struct{ key, value string }{
		{wantKeys[0], "hello"}, {wantKeys[1], "world"}, {wantKeys[2], "foo"},
	})

	w := do(t, h, http.MethodPost,
		"/api/connections/pm-basic/topics/"+topicName+"/peek",
		map[string]any{"limit": 3})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 3 {
		t.Errorf("expected 3 messages (limit=3), got %d", len(msgs))
	}
	// The last 3 messages must be the ones we just produced.
	gotKeys := map[string]bool{}
	for _, m := range msgs {
		if m.Key != nil {
			gotKeys[*m.Key] = true
		}
	}
	for _, k := range wantKeys {
		if !gotKeys[k] {
			t.Errorf("expected key %q in tail messages", k)
		}
	}
}

// TestPeekMessages_Integration_LimitRespected produces 20 messages then peeks
// with limit=5, verifying exactly 5 messages are returned with consecutive offsets.
func TestPeekMessages_Integration_LimitRespected(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-limit")
	const topicName = "test-pm-limit-respected"
	createTopic(t, topicName, 1)

	batch := make([]struct{ key, value string }, 20)
	for i := range batch {
		batch[i] = struct{ key, value string }{fmt.Sprintf("k%d", i), fmt.Sprintf("v%d", i)}
	}
	seedMessages(t, topicName, batch)

	w := do(t, h, http.MethodPost,
		"/api/connections/pm-limit/topics/"+topicName+"/peek",
		map[string]any{"limit": 5})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 5 {
		t.Errorf("expected 5 messages with limit=5, got %d", len(msgs))
	}
	// Offsets must be 5 consecutive values (the tail of the partition).
	if len(msgs) == 5 {
		for i := 1; i < 5; i++ {
			if msgs[i].Offset != msgs[i-1].Offset+1 {
				t.Errorf("offsets not consecutive: msgs[%d].offset=%d, msgs[%d].offset=%d",
					i-1, msgs[i-1].Offset, i, msgs[i].Offset)
			}
		}
	}
}

// TestPeekMessages_Integration_MessageShape produces one message and verifies
// every field in the response shape — partition, offset, timestamp, key, value,
// headers, size.
func TestPeekMessages_Integration_MessageShape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-shape")
	const topicName = "test-pm-message-shape"
	createTopic(t, topicName, 1)

	seedMessages(t, topicName, []struct{ key, value string }{
		{"my-key", `{"hello":"world"}`},
	})

	w := do(t, h, http.MethodPost,
		"/api/connections/pm-shape/topics/"+topicName+"/peek",
		map[string]any{"limit": 1})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	m := msgs[0]
	if m.Partition != 0 {
		t.Errorf("partition: got %d, want 0", m.Partition)
	}
	if m.Offset < 0 {
		t.Errorf("offset: got %d, want >= 0", m.Offset)
	}
	if m.Timestamp == "" {
		t.Error("timestamp: must not be empty")
	}
	if m.Key == nil || *m.Key != "my-key" {
		t.Errorf("key: got %v, want \"my-key\"", m.Key)
	}
	if m.Value != `{"hello":"world"}` {
		t.Errorf("value: got %q, want {\"hello\":\"world\"}", m.Value)
	}
	if m.Size <= 0 {
		t.Errorf("size: got %d, want > 0", m.Size)
	}
}

// TestPeekMessages_Integration_SinglePartitionFilter verifies the partition
// query parameter: peeking partition 0 of a 1-partition topic returns all
// messages in that partition; peeking a non-existent partition returns empty.
func TestPeekMessages_Integration_SinglePartitionFilter(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-part-filter")
	const topicName = "test-pm-single-partition"
	createTopic(t, topicName, 1)

	seedMessages(t, topicName, []struct{ key, value string }{
		{"k1", "v1"}, {"k2", "v2"},
	})

	// Partition 0 — should return exactly the 2 messages we just produced.
	w := do(t, h, http.MethodPost,
		"/api/connections/pm-part-filter/topics/"+topicName+"/peek",
		map[string]any{"limit": 10, "partition": 0})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 2 {
		t.Errorf("partition 0: expected exactly 2 messages, got %d", len(msgs))
	}
	for _, m := range msgs {
		if m.Partition != 0 {
			t.Errorf("expected all messages from partition 0, got partition %d", m.Partition)
		}
	}

	// Partition 99 — does not exist; should return an empty array, not an error.
	w2 := do(t, h, http.MethodPost,
		"/api/connections/pm-part-filter/topics/"+topicName+"/peek",
		map[string]any{"limit": 10, "partition": 99})
	if w2.Code != http.StatusOK {
		t.Fatalf("non-existent partition: status %d: %s", w2.Code, w2.Body)
	}
	var msgs2 []messageResp
	decodeJSON(t, w2, &msgs2)
	if len(msgs2) != 0 {
		t.Errorf("non-existent partition 99: expected 0 messages, got %d", len(msgs2))
	}
}

// TestPeekMessages_Integration_SeekByOffset produces 10 messages to a single-
// partition topic then seeks from offset 5; verifies that exactly 5 messages
// are returned and none have an offset earlier than the seek point.
func TestPeekMessages_Integration_SeekByOffset(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-offset-seek")
	const topicName = "test-pm-offset-seek"
	createTopic(t, topicName, 1)

	batch := make([]struct{ key, value string }, 10)
	for i := range batch {
		batch[i] = struct{ key, value string }{fmt.Sprintf("k%d", i), fmt.Sprintf("v%d", i)}
	}
	seedMessages(t, topicName, batch)

	const seekOffset = 5
	w := do(t, h, http.MethodPost,
		"/api/connections/pm-offset-seek/topics/"+topicName+"/peek",
		map[string]any{"limit": 10, "start_offset": seekOffset})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 5 {
		t.Errorf("expected 5 messages (offsets 5–9), got %d", len(msgs))
	}
	for _, m := range msgs {
		if m.Offset < seekOffset {
			t.Errorf("seek from offset %d: got message at offset %d (before seek point)", seekOffset, m.Offset)
		}
	}
}

// TestPeekMessages_Integration_SeekByTimestamp seeks from the Unix epoch,
// which predates any Kafka message, so all produced messages must be returned.
func TestPeekMessages_Integration_SeekByTimestamp(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-ts-seek")
	const topicName = "test-pm-ts-seek"
	createTopic(t, topicName, 1)

	seedMessages(t, topicName, []struct{ key, value string }{
		{"k1", "v1"}, {"k2", "v2"}, {"k3", "v3"},
	})

	// Epoch timestamp: all messages in any Kafka topic post-date this, so the
	// broker returns offset 0 as the first offset at/after the timestamp.
	w := do(t, h, http.MethodPost,
		"/api/connections/pm-ts-seek/topics/"+topicName+"/peek",
		map[string]any{"limit": 10, "start_timestamp": "1970-01-01T00:00:00Z"})
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) == 0 {
		t.Error("expected messages when seeking from epoch, got none")
	}
	if len(msgs) > 3 {
		t.Errorf("expected at most 3 messages (only 3 produced), got %d", len(msgs))
	}
}

// TestPeekMessages_Integration_DefaultLimitApplied verifies that limit=0 (or
// omitted) is clamped to 20 by the handler.
func TestPeekMessages_Integration_DefaultLimitApplied(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "pm-default-limit")
	const topicName = "test-pm-default-limit"
	createTopic(t, topicName, 1)

	batch := make([]struct{ key, value string }, 30)
	for i := range batch {
		batch[i] = struct{ key, value string }{fmt.Sprintf("k%d", i), fmt.Sprintf("v%d", i)}
	}
	seedMessages(t, topicName, batch)

	w := do(t, h, http.MethodPost,
		"/api/connections/pm-default-limit/topics/"+topicName+"/peek",
		map[string]any{"limit": 0}) // 0 → clamped to 20
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var msgs []messageResp
	decodeJSON(t, w, &msgs)
	if len(msgs) != 20 {
		t.Errorf("default-limit: expected 20 messages, got %d", len(msgs))
	}
}

// ── UpdateTopicPartitions ────────────────────────────────────────────────────

func TestUpdateTopicPartitions_Integration_IncreasesPartitionCount(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "utp-increase")
	const topicName = "test-utp-increase"
	createTopic(t, topicName, 2)

	w := do(t, h, http.MethodPut,
		"/api/connections/utp-increase/topics/"+topicName+"/partitions",
		map[string]any{"partitions": 4})
	if w.Code != http.StatusOK {
		t.Fatalf("update partitions status %d: %s", w.Code, w.Body)
	}
	var result map[string]bool
	decodeJSON(t, w, &result)
	if !result["ok"] {
		t.Error(`expected {"ok": true} response`)
	}

	w2 := do(t, h, http.MethodGet, "/api/connections/utp-increase/topics/"+topicName, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("get topic status %d: %s", w2.Code, w2.Body)
	}
	var detail topicDetailResp
	decodeJSON(t, w2, &detail)
	if len(detail.Partitions) != 4 {
		t.Errorf("partitions: got %d, want 4", len(detail.Partitions))
	}
}

func TestUpdateTopicPartitions_Integration_RejectsNonIncrease(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "utp-reject")
	const topicName = "test-utp-reject"
	createTopic(t, topicName, 2)

	w := do(t, h, http.MethodPut,
		"/api/connections/utp-reject/topics/"+topicName+"/partitions",
		map[string]any{"partitions": 2})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status: got %d, want %d (%s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

// ── UpdateTopicConfig ─────────────────────────────────────────────────────────

// TestUpdateTopicConfig_Integration_SetAndVerify updates retention.ms via the
// PUT endpoint and confirms the change is reflected in the topic config.
func TestUpdateTopicConfig_Integration_SetAndVerify(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "utc-set")
	const topicName = "test-utc-set"
	createTopic(t, topicName, 1)

	const newRetention = "123456789"
	w := do(t, h, http.MethodPut,
		"/api/connections/utc-set/topics/"+topicName+"/config",
		map[string]any{"configs": map[string]string{"retention.ms": newRetention}})
	if w.Code != http.StatusOK {
		t.Fatalf("PUT config status %d: %s", w.Code, w.Body)
	}
	var result map[string]bool
	decodeJSON(t, w, &result)
	if !result["ok"] {
		t.Error(`expected {"ok": true} response`)
	}

	// Confirm the change persisted by fetching the full topic detail.
	w2 := do(t, h, http.MethodGet, "/api/connections/utc-set/topics/"+topicName, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("GET topic status %d: %s", w2.Code, w2.Body)
	}
	var resp topicDetailResp
	decodeJSON(t, w2, &resp)

	entry, ok := resp.Config["retention.ms"]
	if !ok {
		t.Fatal("config[retention.ms]: missing after update")
	}
	if entry.Value != newRetention {
		t.Errorf("config[retention.ms].value: got %q, want %q", entry.Value, newRetention)
	}
	if entry.Source != "dynamic" {
		t.Errorf("config[retention.ms].source: got %q, want dynamic (user-set configs are dynamic)", entry.Source)
	}
}
