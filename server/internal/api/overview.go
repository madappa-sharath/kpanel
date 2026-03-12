package api

import (
	"context"
	"net/http"
	"sort"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
)

type overviewBrokerSummary struct {
	NodeID       int32  `json:"nodeId"`
	Host         string `json:"host"`
	Port         int32  `json:"port"`
	Rack         string `json:"rack,omitempty"`
	IsController bool   `json:"isController"`
}

type clusterOverviewResponse struct {
	ClusterID          string                  `json:"clusterId"`
	KafkaVersion       string                  `json:"kafkaVersion"`
	ControllerID       int32                   `json:"controllerId"`
	BrokerCount        int                     `json:"brokerCount"`
	Brokers            []overviewBrokerSummary `json:"brokers"`
	TotalPartitions    int                     `json:"totalPartitions"`
	UnderReplicated    int                     `json:"underReplicated"`
	OfflinePartitions  int                     `json:"offlinePartitions"`
	TopicCount         int                     `json:"topicCount"`
	ConsumerGroupCount int                     `json:"consumerGroupCount"`
	Configs            map[string]configEntry  `json:"configs"`
}

// clusterConfigKeys is the set of broker config keys returned in ClusterOverview.
var clusterConfigKeys = map[string]bool{
	// Reliability
	"default.replication.factor":               true,
	"min.insync.replicas":                      true,
	"unclean.leader.election.enable":           true,
	"offsets.topic.replication.factor":         true,
	"transaction.state.log.replication.factor": true,
	"transaction.state.log.min.isr":            true,
	// Retention
	"log.retention.hours": true,
	"log.retention.bytes": true,
	"log.retention.ms":    true,
	// Governance
	"auto.create.topics.enable": true,
	"delete.topic.enable":       true,
	// Performance
	"num.partitions":    true,
	"message.max.bytes": true,
}

// ClusterOverview godoc
// GET /api/connections/:id/overview
func (h *Handlers) ClusterOverview(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	admClient, err := h.pool.get(cluster)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type metaRes struct {
		meta kadm.Metadata
		err  error
	}
	type topicRes struct {
		details kadm.TopicDetails
		err     error
	}
	type groupRes struct {
		groups kadm.ListedGroups
		err    error
	}
	type versionRes struct {
		versions kadm.BrokersApiVersions
		err      error
	}
	type configRes struct {
		configs kadm.ResourceConfigs
		err     error
	}

	metaCh := make(chan metaRes, 1)
	topicCh := make(chan topicRes, 1)
	groupCh := make(chan groupRes, 1)
	versionCh := make(chan versionRes, 1)
	configCh := make(chan configRes, 1)

	go func() { m, e := admClient.BrokerMetadata(ctx); metaCh <- metaRes{m, e} }()
	go func() { d, e := admClient.ListTopics(ctx); topicCh <- topicRes{d, e} }()
	go func() { g, e := admClient.ListGroups(ctx); groupCh <- groupRes{g, e} }()
	go func() { v, e := admClient.ApiVersions(ctx); versionCh <- versionRes{v, e} }()

	mRes := <-metaCh
	if mRes.err != nil {
		writeError(w, http.StatusInternalServerError, mRes.err.Error())
		return
	}

	// Query the controller broker specifically so we get effective (non-null) config values.
	// Cluster-default DescribeBrokerConfigs("") returns null for unoverridden keys.
	if mRes.meta.Controller >= 0 {
		go func() {
			c, e := admClient.DescribeBrokerConfigs(ctx, mRes.meta.Controller)
			configCh <- configRes{c, e}
		}()
	} else {
		configCh <- configRes{} // no controller elected; skip config fetch
	}

	tRes := <-topicCh
	gRes := <-groupCh
	vRes := <-versionCh
	cRes := <-configCh

	// Broker summaries
	brokers := make([]overviewBrokerSummary, 0, len(mRes.meta.Brokers))
	for _, b := range mRes.meta.Brokers {
		brokers = append(brokers, overviewBrokerSummary{
			NodeID:       b.NodeID,
			Host:         b.Host,
			Port:         b.Port,
			Rack:         derefOrEmpty(b.Rack),
			IsController: b.NodeID == mRes.meta.Controller,
		})
	}
	sort.Slice(brokers, func(i, j int) bool { return brokers[i].NodeID < brokers[j].NodeID })

	// Partition health
	totalPartitions, underReplicated, offlinePartitions := 0, 0, 0
	topicCount := 0
	if tRes.err == nil {
		topicCount = len(tRes.details)
		tRes.details.EachPartition(func(p kadm.PartitionDetail) {
			totalPartitions++
			if p.Leader < 0 {
				offlinePartitions++
			}
			if len(p.ISR) < len(p.Replicas) {
				underReplicated++
			}
		})
	}

	consumerGroupCount := 0
	if gRes.err == nil {
		consumerGroupCount = len(gRes.groups)
	}

	kafkaVersion := "unknown"
	if vRes.err == nil {
		// Prefer the controller broker for a deterministic pick
		if bv, ok := vRes.versions[mRes.meta.Controller]; ok {
			kafkaVersion = bv.VersionGuess()
		} else {
			for _, bv := range vRes.versions {
				kafkaVersion = bv.VersionGuess()
				break
			}
		}
	}

	configs := make(map[string]configEntry)
	if cRes.err == nil {
		// All brokers share the same cluster-level config; just use the first response
		for _, rc := range cRes.configs {
			for _, cfg := range rc.Configs {
				if !clusterConfigKeys[cfg.Key] || cfg.Value == nil {
					continue
				}
				// log.retention.ms == -1 means "defer to log.retention.hours"; skip it
				// since log.retention.hours already conveys the effective retention time.
				if cfg.Key == "log.retention.ms" && *cfg.Value == "-1" {
					continue
				}
				configs[cfg.Key] = configEntry{
					Value:  *cfg.Value,
					Source: configSourceLabel(cfg.Source),
				}
			}
			break
		}
	}

	writeJSON(w, http.StatusOK, clusterOverviewResponse{
		ClusterID:          mRes.meta.Cluster,
		KafkaVersion:       kafkaVersion,
		ControllerID:       mRes.meta.Controller,
		BrokerCount:        len(brokers),
		Brokers:            brokers,
		TotalPartitions:    totalPartitions,
		UnderReplicated:    underReplicated,
		OfflinePartitions:  offlinePartitions,
		TopicCount:         topicCount,
		ConsumerGroupCount: consumerGroupCount,
		Configs:            configs,
	})
}
