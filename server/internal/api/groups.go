package api

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/twmb/franz-go/pkg/kadm"
)

// consumerGroupSummary is the list-view payload for a consumer group.
type consumerGroupSummary struct {
	ID            string   `json:"id"`
	State         string   `json:"state"`
	Members       int      `json:"members"`
	Topics        []string `json:"topics"`
	TotalLag      int64    `json:"total_lag"`
	CoordinatorID int32    `json:"coordinator_id"`
	ProtocolType  string   `json:"protocol_type"`
}

type groupOffsetRow struct {
	Topic           string `json:"topic"`
	Partition       int32  `json:"partition"`
	CommittedOffset int64  `json:"committed_offset"`
	LogEndOffset    int64  `json:"log_end_offset"`
	Lag             int64  `json:"lag"`
	MemberID        string `json:"member_id,omitempty"`
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
	MemberLag   int64                 `json:"member_lag"`
}

type groupDetailResp struct {
	ID            string            `json:"id"`
	State         string            `json:"state"`
	Protocol      string            `json:"protocol"`
	ProtocolType  string            `json:"protocol_type"`
	CoordinatorID int32             `json:"coordinator_id"`
	Members       []groupMemberResp `json:"members"`
	Offsets       []groupOffsetRow  `json:"offsets"`
}

// lagFromOff computes lag given a committed offset and a log-end offset.
// If committed is negative (no offset recorded), the full LEO is the lag.
func lagFromOff(committed, leo int64) int64 {
	if committed < 0 {
		return leo
	}
	if lag := leo - committed; lag > 0 {
		return lag
	}
	return 0
}

// ListGroups returns all consumer groups with state, member count, subscribed topics, and total lag.
// GET /api/connections/:id/groups
func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	admClient, err := h.pool.get(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

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

	// Collect unique topics across all groups.
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
				totalLag += lagFromOff(off.At, endOff)
			}
		}

		sort.Strings(topics)
		result = append(result, consumerGroupSummary{
			ID:            g.Group,
			State:         g.State,
			Members:       len(g.Members),
			Topics:        topics,
			TotalLag:      totalLag,
			CoordinatorID: g.Coordinator.NodeID,
			ProtocolType:  g.ProtocolType,
		})
	}

	writeJSON(w, http.StatusOK, result)
}

// GetGroup returns full detail for a single consumer group: members with per-member lag,
// per-partition offsets with assigned member info, coordinator, and protocol.
// GET /api/connections/:id/groups/:name
func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	name := chi.URLParam(r, "name")

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	admClient, err := h.pool.get(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

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

	// Build partition → memberID lookup from member assignments.
	type partKey struct {
		topic     string
		partition int32
	}
	partToMember := map[partKey]string{}
	for _, m := range g.Members {
		if asgn, ok2 := m.Assigned.AsConsumer(); ok2 {
			for _, t := range asgn.Topics {
				for _, p := range t.Partitions {
					partToMember[partKey{t.Topic, p}] = m.MemberID
				}
			}
		}
	}

	// Build offset rows and accumulate per-member lag.
	memberLagByID := map[string]int64{}
	offsets := make([]groupOffsetRow, 0)
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
				lag = lagFromOff(off.At, endOff)
			}
			memberID := partToMember[partKey{topic, partID}]
			if memberID != "" {
				memberLagByID[memberID] += lag
			}
			offsets = append(offsets, groupOffsetRow{
				Topic:           topic,
				Partition:       partID,
				CommittedOffset: off.At,
				LogEndOffset:    endOff,
				Lag:             lag,
				MemberID:        memberID,
			})
		}
	}
	sort.Slice(offsets, func(i, j int) bool {
		if offsets[i].Topic != offsets[j].Topic {
			return offsets[i].Topic < offsets[j].Topic
		}
		return offsets[i].Partition < offsets[j].Partition
	})

	// Build member list with per-member lag.
	members := make([]groupMemberResp, 0, len(g.Members))
	for _, m := range g.Members {
		assignments := []partitionAssignment{}
		if asgn, ok2 := m.Assigned.AsConsumer(); ok2 {
			for _, t := range asgn.Topics {
				sorted := make([]int32, len(t.Partitions))
				copy(sorted, t.Partitions)
				sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
				assignments = append(assignments, partitionAssignment{
					Topic:      t.Topic,
					Partitions: sorted,
				})
			}
			sort.Slice(assignments, func(i, j int) bool {
				return assignments[i].Topic < assignments[j].Topic
			})
		}
		members = append(members, groupMemberResp{
			ID:          m.MemberID,
			ClientID:    m.ClientID,
			Host:        m.ClientHost,
			Assignments: assignments,
			MemberLag:   memberLagByID[m.MemberID],
		})
	}
	sort.Slice(members, func(i, j int) bool { return members[i].ClientID < members[j].ClientID })

	writeJSON(w, http.StatusOK, groupDetailResp{
		ID:            g.Group,
		State:         g.State,
		Protocol:      g.Protocol,
		ProtocolType:  g.ProtocolType,
		CoordinatorID: g.Coordinator.NodeID,
		Members:       members,
		Offsets:       offsets,
	})
}
