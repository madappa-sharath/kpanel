package api

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/kpanel/kpanel/internal/kafka"
)

type brokerResponse struct {
	NodeID           int32  `json:"nodeId"`
	Host             string `json:"host"`
	Port             int32  `json:"port"`
	Rack             string `json:"rack,omitempty"`
	IsController     bool   `json:"isController"`
	LeaderPartitions int    `json:"leaderPartitions"`
	Replicas         int    `json:"replicas"`
	LogSizeBytes     int64  `json:"logSizeBytes"`
}

// ListBrokers godoc
// GET /api/connections/:id/brokers
func (h *Handlers) ListBrokers(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	admClient, err := kafka.NewClient(ctx, cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer admClient.Close()

	meta, err := admClient.BrokerMetadata(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch topic metadata and log dirs in parallel for enriched broker stats.
	type topicRes struct {
		details kadm.TopicDetails
		err     error
	}
	type logRes struct {
		dirs kadm.DescribedAllLogDirs
		err  error
	}
	topicCh := make(chan topicRes, 1)
	logCh := make(chan logRes, 1)

	go func() {
		d, e := admClient.ListTopics(ctx)
		topicCh <- topicRes{d, e}
	}()
	go func() {
		d, e := admClient.DescribeAllLogDirs(ctx, nil)
		logCh <- logRes{d, e}
	}()

	tRes := <-topicCh
	lRes := <-logCh

	leaderCount := make(map[int32]int)
	replicaCount := make(map[int32]int)
	if tRes.err == nil {
		tRes.details.EachPartition(func(p kadm.PartitionDetail) {
			if p.Leader >= 0 {
				leaderCount[p.Leader]++
			}
			for _, r := range p.Replicas {
				replicaCount[r]++
			}
		})
	}

	logSize := make(map[int32]int64)
	if lRes.err == nil {
		for nodeID, dirs := range lRes.dirs {
			logSize[nodeID] = dirs.Size()
		}
	}

	brokers := make([]brokerResponse, 0, len(meta.Brokers))
	for _, b := range meta.Brokers {
		brokers = append(brokers, brokerResponse{
			NodeID:           b.NodeID,
			Host:             b.Host,
			Port:             b.Port,
			Rack:             derefOrEmpty(b.Rack),
			IsController:     b.NodeID == meta.Controller,
			LeaderPartitions: leaderCount[b.NodeID],
			Replicas:         replicaCount[b.NodeID],
			LogSizeBytes:     logSize[b.NodeID],
		})
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].NodeID < brokers[j].NodeID
	})
	writeJSON(w, http.StatusOK, brokers)
}
