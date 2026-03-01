package api

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/kpanel/kpanel/internal/kafka"
)

type consumerGroupSummary struct {
	ID       string   `json:"id"`
	State    string   `json:"state"`
	Members  int      `json:"members"`
	Topics   []string `json:"topics"`
	TotalLag int64    `json:"total_lag"`
}

// ListGroups godoc
// GET /api/connections/:id/groups
func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
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

	groups, err := admClient.DescribeGroups(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "describe groups: "+err.Error())
		return
	}

	if len(groups) == 0 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	fetchedOffsets := admClient.FetchManyOffsets(ctx, groups.Names()...)

	// Collect unique topics across all groups
	topicSet := map[string]struct{}{}
	for _, groupResp := range fetchedOffsets {
		for topic := range groupResp.Fetched {
			topicSet[topic] = struct{}{}
		}
	}

	var endOffsets kadm.ListedOffsets
	if len(topicSet) > 0 {
		topics := make([]string, 0, len(topicSet))
		for t := range topicSet {
			topics = append(topics, t)
		}
		var endErr error
		endOffsets, endErr = admClient.ListEndOffsets(ctx, topics...)
		if endErr != nil {
			writeError(w, http.StatusInternalServerError, "list end offsets: "+endErr.Error())
			return
		}
	}

	result := make([]consumerGroupSummary, 0, len(groups))
	for _, g := range groups.Sorted() {
		if g.Err != nil {
			continue
		}
		groupResp := fetchedOffsets[g.Group]
		topics := []string{}
		totalLag := int64(0)

		for topic, partitions := range groupResp.Fetched {
			topics = append(topics, topic)
			for partID, off := range partitions {
				if off.Err != nil {
					continue
				}
				endOff := int64(0)
				if endOffsets != nil {
					if tEnd, ok2 := endOffsets[topic]; ok2 {
						if pEnd, ok2 := tEnd[partID]; ok2 && pEnd.Err == nil {
							endOff = pEnd.Offset
						}
					}
				}
				var lag int64
				if off.At < 0 {
					lag = endOff // no committed offset → full lag
				} else {
					lag = endOff - off.At
					if lag < 0 {
						lag = 0
					}
				}
				totalLag += lag
			}
		}

		sort.Strings(topics)
		result = append(result, consumerGroupSummary{
			ID:       g.Group,
			State:    g.State,
			Members:  len(g.Members),
			Topics:   topics,
			TotalLag: totalLag,
		})
	}

	writeJSON(w, http.StatusOK, result)
}

// GetGroup godoc
// GET /api/connections/:id/groups/:name
func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	// Describe group and fetch committed offsets concurrently.
	type descResult struct {
		groups kadm.DescribedGroups
		err    error
	}
	descCh := make(chan descResult, 1)
	go func() {
		g, e := admClient.DescribeGroups(ctx, name)
		descCh <- descResult{g, e}
	}()
	fetchedOffsets := admClient.FetchManyOffsets(ctx, name)
	dRes := <-descCh

	if dRes.err != nil {
		writeError(w, http.StatusInternalServerError, "describe group: "+dRes.err.Error())
		return
	}
	g, exists := dRes.groups[name]
	if !exists || g.Err != nil {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}

	groupResp := fetchedOffsets[name]
	topicSet := map[string]struct{}{}
	for topic := range groupResp.Fetched {
		topicSet[topic] = struct{}{}
	}

	var endOffsets kadm.ListedOffsets
	if len(topicSet) > 0 {
		topics := make([]string, 0, len(topicSet))
		for t := range topicSet {
			topics = append(topics, t)
		}
		endOffsets, err = admClient.ListEndOffsets(ctx, topics...)
		if err != nil {
			endOffsets = kadm.ListedOffsets{}
		}
	}

	type partitionAssignment struct {
		Topic      string  `json:"topic"`
		Partitions []int32 `json:"partitions"`
	}
	type groupMemberResp struct {
		ID          string                `json:"id"`
		ClientID    string                `json:"client_id"`
		Host        string                `json:"host"`
		Assignments []partitionAssignment `json:"assignments"`
	}
	type groupOffsetRow struct {
		Topic           string `json:"topic"`
		Partition       int32  `json:"partition"`
		CommittedOffset int64  `json:"committed_offset"`
		LogEndOffset    int64  `json:"log_end_offset"`
		Lag             int64  `json:"lag"`
	}
	type groupDetailResp struct {
		ID      string            `json:"id"`
		State   string            `json:"state"`
		Members []groupMemberResp `json:"members"`
		Offsets []groupOffsetRow  `json:"offsets"`
	}

	members := make([]groupMemberResp, 0, len(g.Members))
	for _, m := range g.Members {
		assignments := []partitionAssignment{}
		if asgn, ok2 := m.Assigned.AsConsumer(); ok2 {
			for _, t := range asgn.Topics {
				assignments = append(assignments, partitionAssignment{
					Topic:      t.Topic,
					Partitions: t.Partitions,
				})
			}
		}
		members = append(members, groupMemberResp{
			ID:          m.MemberID,
			ClientID:    m.ClientID,
			Host:        m.ClientHost,
			Assignments: assignments,
		})
	}

	offsets := []groupOffsetRow{}
	for topic, partitions := range groupResp.Fetched {
		for partID, off := range partitions {
			if off.Err != nil {
				continue
			}
			endOff := int64(-1)
			if endOffsets != nil {
				if tEnd, ok2 := endOffsets[topic]; ok2 {
					if pEnd, ok2 := tEnd[partID]; ok2 && pEnd.Err == nil {
						endOff = pEnd.Offset
					}
				}
			}
			lag := int64(0)
			if endOff >= 0 {
				if off.At < 0 {
					lag = endOff
				} else {
					lag = endOff - off.At
					if lag < 0 {
						lag = 0
					}
				}
			}
			offsets = append(offsets, groupOffsetRow{
				Topic:           topic,
				Partition:       partID,
				CommittedOffset: off.At,
				LogEndOffset:    endOff,
				Lag:             lag,
			})
		}
	}
	sort.Slice(offsets, func(i, j int) bool {
		if offsets[i].Topic != offsets[j].Topic {
			return offsets[i].Topic < offsets[j].Topic
		}
		return offsets[i].Partition < offsets[j].Partition
	})

	writeJSON(w, http.StatusOK, groupDetailResp{
		ID:      g.Group,
		State:   g.State,
		Members: members,
		Offsets: offsets,
	})
}
