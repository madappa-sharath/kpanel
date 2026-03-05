package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kpanel/kpanel/internal/kafka"
	"github.com/twmb/franz-go/pkg/kadm"
)

type resetScope string

const (
	scopeAll   resetScope = "all"
	scopeTopic resetScope = "topic"
)

type resetOffsetDiff struct {
	Topic     string `json:"topic"`
	Partition int32  `json:"partition"`
	OldOffset int64  `json:"old_offset"`
	NewOffset int64  `json:"new_offset"`
	Delta     int64  `json:"delta"`
}

type resetOffsetsRequest struct {
	Scope       resetScope `json:"scope"`           // "all" | "topic"
	Topic       string     `json:"topic,omitempty"` // required when scope = "topic"
	Strategy    any        `json:"strategy"`        // "earliest" | "latest" | "timestamp" | "offset" | {"timestamp":"..."} | {"offset":N}
	TimestampMS *int64     `json:"timestamp_ms,omitempty"`
	Offset      *int64     `json:"offset,omitempty"`
	DryRun      bool       `json:"dry_run,omitempty"`
	Force       bool       `json:"force,omitempty"` // bypass active-member guard
}

type resetOffsetsResponse struct {
	ActiveMembers int               `json:"active_members"`
	DryRun        bool              `json:"dry_run"`
	Diff          []resetOffsetDiff `json:"diff"`
}

// ResetOffsets computes (and optionally applies) an offset reset for a consumer group.
// POST /api/connections/:id/groups/:name/reset-offsets
func (h *Handlers) ResetOffsets(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	groupID := chi.URLParam(r, "name")

	var req resetOffsetsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Scope == "" {
		req.Scope = scopeAll
	}
	if req.Scope == scopeTopic && req.Topic == "" {
		writeError(w, http.StatusBadRequest, "topic required when scope is 'topic'")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	// Check active members.
	described, err := admClient.DescribeGroups(ctx, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	dg, exists := described[groupID]
	if !exists || dg.Err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	activeMembers := len(dg.Members)
	if activeMembers > 0 && !req.Force {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{ //nolint:errcheck
			"error":          fmt.Sprintf("group has %d active member(s); stop the consumer first or use force=true", activeMembers),
			"active_members": activeMembers,
		})
		return
	}

	// Fetch current committed offsets to build the scope.
	committed, err := admClient.FetchOffsets(ctx, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Narrow to the requested topic if scope = "topic".
	if req.Scope == scopeTopic {
		filtered := kadm.OffsetResponses{}
		if parts, ok := committed[req.Topic]; ok {
			filtered[req.Topic] = parts
		}
		committed = filtered
	}

	if len(committed) == 0 {
		writeError(w, http.StatusBadRequest, "no committed offsets found for the specified scope")
		return
	}

	// Collect topic list for offset resolution.
	topicSet := map[string]struct{}{}
	for topic := range committed {
		topicSet[topic] = struct{}{}
	}
	topics := make([]string, 0, len(topicSet))
	for t := range topicSet {
		topics = append(topics, t)
	}

	// Resolve the target offsets based on strategy.
	var targetOffsets kadm.ListedOffsets
	strategy, tsMillis, exactOffset, err := resolveResetStrategy(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid strategy: "+err.Error())
		return
	}
	switch strategy {
	case "earliest":
		targetOffsets, err = admClient.ListStartOffsets(ctx, topics...)
	case "latest":
		targetOffsets, err = admClient.ListEndOffsets(ctx, topics...)
	case "timestamp":
		targetOffsets, err = admClient.ListOffsetsAfterMilli(ctx, tsMillis, topics...)
	case "offset":
		// Exact offset does not require broker-side resolution.
	default:
		writeError(w, http.StatusBadRequest, "strategy must be 'earliest', 'latest', 'timestamp', 'offset', {timestamp:...}, or {offset:N}")
		return
	}
	if strategy != "offset" && err != nil {
		writeError(w, http.StatusInternalServerError, "resolve target offsets: "+err.Error())
		return
	}

	// Build the diff and the new Offsets object to commit.
	newOffsets := kadm.Offsets{}
	diff := []resetOffsetDiff{}

	for topic, partOffsets := range committed {
		topicTarget := targetOffsets[topic]
		for partID, old := range partOffsets {
			if old.Err != nil {
				continue
			}
			newAt := exactOffset
			if strategy == "offset" {
				// per-partition exact offset already resolved in resolveResetStrategy
			} else {
				if t, ok := topicTarget[partID]; ok && t.Err == nil {
					newAt = t.Offset
				}
			}
			newOffsets.Add(kadm.Offset{
				Topic:     topic,
				Partition: partID,
				At:        newAt,
			})
			diff = append(diff, resetOffsetDiff{
				Topic:     topic,
				Partition: partID,
				OldOffset: old.At,
				NewOffset: newAt,
				Delta:     newAt - old.At,
			})
		}
	}
	sort.Slice(diff, func(i, j int) bool {
		if diff[i].Topic != diff[j].Topic {
			return diff[i].Topic < diff[j].Topic
		}
		return diff[i].Partition < diff[j].Partition
	})

	resp := resetOffsetsResponse{
		ActiveMembers: activeMembers,
		DryRun:        req.DryRun,
		Diff:          diff,
	}

	// Apply unless dry run.
	if !req.DryRun {
		if _, err := admClient.CommitOffsets(ctx, groupID, newOffsets); err != nil {
			writeError(w, http.StatusInternalServerError, "commit offsets: "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func resolveResetStrategy(req resetOffsetsRequest) (string, int64, int64, error) {
	strategy, err := parseStrategy(req.Strategy)
	if err != nil {
		return "", 0, 0, err
	}

	switch strategy {
	case "earliest", "latest":
		return strategy, 0, 0, nil
	case "timestamp":
		if req.TimestampMS != nil {
			return strategy, *req.TimestampMS, 0, nil
		}
		ts, err := parseTimestampStrategy(req.Strategy)
		if err != nil {
			return "", 0, 0, err
		}
		return strategy, ts, 0, nil
	case "offset":
		if req.Offset != nil {
			return strategy, 0, *req.Offset, nil
		}
		off, err := parseExactOffsetStrategy(req.Strategy)
		if err != nil {
			return "", 0, 0, err
		}
		return strategy, 0, off, nil
	default:
		return "", 0, 0, fmt.Errorf("unknown strategy %q", strategy)
	}
}

// parseStrategy extracts the strategy name string from the decoded JSON value.
// Strategy is either a string ("earliest", "latest") or an object ({"timestamp":"..."} or {"offset":N}).
func parseStrategy(raw any) (string, error) {
	switch v := raw.(type) {
	case string:
		if v == "earliest" || v == "latest" || v == "timestamp" || v == "offset" {
			return v, nil
		}
		return "", fmt.Errorf("unknown strategy %q", v)
	case map[string]any:
		if _, ok := v["timestamp"]; ok {
			return "timestamp", nil
		}
		if _, ok := v["offset"]; ok {
			return "offset", nil
		}
	}
	return "", fmt.Errorf("unrecognised strategy format")
}

func parseTimestampStrategy(raw any) (int64, error) {
	m, ok := raw.(map[string]any)
	if !ok {
		return 0, fmt.Errorf("expected object")
	}
	ts, ok := m["timestamp"].(string)
	if !ok {
		return 0, fmt.Errorf("timestamp must be a string")
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return 0, err
	}
	return t.UnixMilli(), nil
}

func parseExactOffsetStrategy(raw any) (int64, error) {
	m, ok := raw.(map[string]any)
	if !ok {
		return 0, fmt.Errorf("expected object")
	}
	switch v := m["offset"].(type) {
	case float64:
		return int64(v), nil
	case int64:
		return v, nil
	}
	return 0, fmt.Errorf("offset must be a number")
}
