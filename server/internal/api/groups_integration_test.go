//go:build integration

package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/kpanel/kpanel/internal/config"
	kpkafka "github.com/kpanel/kpanel/internal/kafka"
)

// ── shared response types ────────────────────────────────────────────────────

type consumerGroupResp struct {
	ID       string   `json:"id"`
	State    string   `json:"state"`
	Members  int      `json:"members"`
	Topics   []string `json:"topics"`
	TotalLag int64    `json:"total_lag"`
}

type groupMemberDetailResp struct {
	ID       string `json:"id"`
	ClientID string `json:"client_id"`
	Host     string `json:"host"`
}

type groupOffsetDetailResp struct {
	Topic           string `json:"topic"`
	Partition       int32  `json:"partition"`
	CommittedOffset int64  `json:"committed_offset"`
	LogEndOffset    int64  `json:"log_end_offset"`
	Lag             int64  `json:"lag"`
}

type groupDetailRespFull struct {
	ID      string                  `json:"id"`
	State   string                  `json:"state"`
	Members []groupMemberDetailResp `json:"members"`
	Offsets []groupOffsetDetailResp `json:"offsets"`
}

// ── helpers ──────────────────────────────────────────────────────────────────

// commitGroupOffsets directly commits offsets for a consumer group via kadm,
// creating an Empty-state group without a live consumer process. This lets
// integration tests assert on lag and group visibility without running a real
// consumer.
func commitGroupOffsets(t *testing.T, group, topic string, partition int32, offset int64) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cl, err := kpkafka.NewClient(ctx, &config.Cluster{
		ID: "commit-helper", Name: "commit-helper", Platform: "generic", Brokers: []string{testBroker},
	})
	if err != nil {
		t.Fatalf("kafka client for commitGroupOffsets: %v", err)
	}
	defer cl.Close()

	offsets := make(kadm.Offsets)
	offsets.Add(kadm.Offset{Topic: topic, Partition: partition, At: offset})
	if _, err := cl.CommitOffsets(ctx, group, offsets); err != nil {
		t.Fatalf("CommitOffsets group=%q topic=%q partition=%d: %v", group, topic, partition, err)
	}
}

// ── ListGroups ────────────────────────────────────────────────────────────────

// TestListGroups_Integration_Shape verifies the endpoint returns 200 with a
// valid JSON array; every present group has the required fields.
func TestListGroups_Integration_Shape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lg-shape")

	w := do(t, h, http.MethodGet, "/api/connections/lg-shape/groups", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}

	var groups []consumerGroupResp
	decodeJSON(t, w, &groups)

	for _, g := range groups {
		if g.ID == "" {
			t.Error("group.id must not be empty")
		}
		if g.State == "" {
			t.Errorf("group %q: state must not be empty", g.ID)
		}
		if g.Topics == nil {
			t.Errorf("group %q: topics must not be nil (want empty array not null)", g.ID)
		}
		if g.TotalLag < 0 {
			t.Errorf("group %q: total_lag=%d, want >= 0", g.ID, g.TotalLag)
		}
	}
}

// TestListGroups_Integration_GroupAppearsAfterCommit commits offsets for a new
// group and verifies the group surfaces in the list response with the correct
// topic name.
func TestListGroups_Integration_GroupAppearsAfterCommit(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lg-appears")

	const (
		topicName = "test-lg-appears"
		groupName = "test-lg-appears-group"
	)
	createTopic(t, topicName, 1)
	seedMessages(t, topicName, []struct{ key, value string }{
		{"k1", "v1"}, {"k2", "v2"}, {"k3", "v3"},
	})
	// Commit offset 3 — consumer is fully caught up.
	commitGroupOffsets(t, groupName, topicName, 0, 3)

	w := do(t, h, http.MethodGet, "/api/connections/lg-appears/groups", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var groups []consumerGroupResp
	decodeJSON(t, w, &groups)

	var found *consumerGroupResp
	for i := range groups {
		if groups[i].ID == groupName {
			found = &groups[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("group %q not found in list after committing offsets", groupName)
	}
	hasTopicName := false
	for _, tp := range found.Topics {
		if tp == topicName {
			hasTopicName = true
			break
		}
	}
	if !hasTopicName {
		t.Errorf("group.topics: expected %q in %v", topicName, found.Topics)
	}
}

// TestListGroups_Integration_LagCalculated produces 5 messages and commits
// offset 2; verifies that total_lag = 3.
func TestListGroups_Integration_LagCalculated(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "lg-lag")

	const (
		topicName = "test-lg-lag"
		groupName = "test-lg-lag-group"
	)
	createTopic(t, topicName, 1)
	seedMessages(t, topicName, []struct{ key, value string }{
		{"k0", "v0"}, {"k1", "v1"}, {"k2", "v2"}, {"k3", "v3"}, {"k4", "v4"},
	})
	// Consumer has processed messages 0–1; offset 2 means next to fetch is 2.
	// end_offset=5, committed=2 → lag=3.
	commitGroupOffsets(t, groupName, topicName, 0, 2)

	w := do(t, h, http.MethodGet, "/api/connections/lg-lag/groups", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var groups []consumerGroupResp
	decodeJSON(t, w, &groups)

	var found *consumerGroupResp
	for i := range groups {
		if groups[i].ID == groupName {
			found = &groups[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("group %q not found in list", groupName)
	}
	if found.TotalLag != 3 {
		t.Errorf("total_lag: got %d, want 3 (end=5, committed=2)", found.TotalLag)
	}
}

// ── GetGroup ─────────────────────────────────────────────────────────────────

// TestGetGroup_Integration_NotFound verifies that describing a group that has
// never existed returns 404 with an error field.
func TestGetGroup_Integration_NotFound(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gg-notfound")

	w := do(t, h, http.MethodGet, "/api/connections/gg-notfound/groups/this-group-does-not-exist", nil)
	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusNotFound)
	}
	var resp map[string]string
	decodeJSON(t, w, &resp)
	if _, ok := resp["error"]; !ok {
		t.Error("error response must have an 'error' field")
	}
}

// TestGetGroup_Integration_Shape commits offsets for a group across 2
// partitions and verifies all response fields are correctly populated.
func TestGetGroup_Integration_Shape(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gg-shape")

	const (
		topicName = "test-gg-shape"
		groupName = "test-gg-shape-group"
	)
	createTopic(t, topicName, 2)
	seedMessages(t, topicName, []struct{ key, value string }{{"k1", "v1"}, {"k2", "v2"}})
	commitGroupOffsets(t, groupName, topicName, 0, 1)
	commitGroupOffsets(t, groupName, topicName, 1, 1)

	w := do(t, h, http.MethodGet, "/api/connections/gg-shape/groups/"+groupName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}

	var resp groupDetailRespFull
	decodeJSON(t, w, &resp)

	if resp.ID != groupName {
		t.Errorf("id: got %q, want %q", resp.ID, groupName)
	}
	if resp.State == "" {
		t.Error("state: must not be empty")
	}
	// An Empty-state group has no active members; the slice must be non-nil.
	if resp.Members == nil {
		t.Error("members: must not be nil (want empty array, not null)")
	}
	if resp.Offsets == nil {
		t.Error("offsets: must not be nil (want empty array, not null)")
	}
	if len(resp.Offsets) != 2 {
		t.Errorf("offsets: got %d rows, want 2 (one per committed partition)", len(resp.Offsets))
	}

	for _, o := range resp.Offsets {
		if o.Topic != topicName {
			t.Errorf("offset.topic: got %q, want %q", o.Topic, topicName)
		}
		if o.Partition < 0 {
			t.Errorf("offset.partition: got %d, want >= 0", o.Partition)
		}
		if o.CommittedOffset < 0 {
			t.Errorf("offset[%d].committed_offset: got %d, want >= 0", o.Partition, o.CommittedOffset)
		}
		if o.LogEndOffset < o.CommittedOffset {
			t.Errorf("offset[%d]: log_end_offset (%d) < committed_offset (%d)",
				o.Partition, o.LogEndOffset, o.CommittedOffset)
		}
		if o.Lag < 0 {
			t.Errorf("offset[%d].lag: got %d, want >= 0", o.Partition, o.Lag)
		}
	}
}

// TestGetGroup_Integration_OffsetsSortedByTopicAndPartition commits offsets
// for 3 partitions and verifies the offsets array is sorted by topic then partition.
func TestGetGroup_Integration_OffsetsSortedByTopicAndPartition(t *testing.T) {
	h, store := testServer(t)
	addCluster(t, store, "gg-sorted")

	const (
		topicName = "test-gg-sorted"
		groupName = "test-gg-sorted-group"
	)
	createTopic(t, topicName, 3)
	commitGroupOffsets(t, groupName, topicName, 0, 1)
	commitGroupOffsets(t, groupName, topicName, 1, 1)
	commitGroupOffsets(t, groupName, topicName, 2, 1)

	w := do(t, h, http.MethodGet, "/api/connections/gg-sorted/groups/"+groupName, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	var resp groupDetailRespFull
	decodeJSON(t, w, &resp)

	if len(resp.Offsets) != 3 {
		t.Fatalf("offsets: got %d rows, want 3", len(resp.Offsets))
	}
	for i := 1; i < len(resp.Offsets); i++ {
		a, b := resp.Offsets[i-1], resp.Offsets[i]
		if a.Topic > b.Topic || (a.Topic == b.Topic && a.Partition > b.Partition) {
			t.Errorf("offsets not sorted: [%d](%s/%d) > [%d](%s/%d)",
				i-1, a.Topic, a.Partition, i, b.Topic, b.Partition)
		}
	}
}
