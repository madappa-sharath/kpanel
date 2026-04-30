package api

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatch/types"
)

type cwRange struct {
	duration time.Duration
	period   int32
}

var cwRanges = map[string]cwRange{
	"1h":  {1 * time.Hour, 60},
	"3h":  {3 * time.Hour, 300},
	"6h":  {6 * time.Hour, 600},
	"12h": {12 * time.Hour, 900},
	"1d":  {24 * time.Hour, 1800},
	"3d":  {72 * time.Hour, 3600},
	"7d":  {168 * time.Hour, 7200},
}

type metricsWindow struct {
	Start         string `json:"start"`
	End           string `json:"end"`
	PeriodSeconds int32  `json:"period_seconds"`
}

type metricsDatapoint struct {
	TS int64   `json:"ts"`
	V  float64 `json:"v"`
}

type metricsSeries struct {
	ID         string             `json:"id"`
	Label      string             `json:"label"`
	Unit       string             `json:"unit"`
	Datapoints []metricsDatapoint `json:"datapoints"`
}

type metricsResponse struct {
	Window metricsWindow   `json:"window"`
	Series []metricsSeries `json:"series"`
}

// GetMetrics godoc
// GET /api/connections/:id/metrics?scope=cluster|broker|topic|consumer
func (h *Handlers) GetMetrics(w http.ResponseWriter, r *http.Request) {
	cluster, ok := h.getClusterOrError(w, r)
	if !ok {
		return
	}
	if cluster.Platform != "aws" {
		writeError(w, http.StatusNotFound, "metrics are only available for MSK connections")
		return
	}

	awsCfg, ok := cluster.GetAWSConfig()
	if !ok {
		writeError(w, http.StatusInternalServerError, "aws cluster is missing platform config")
		return
	}

	clusterName := awsCfg.ClusterName
	if clusterName == "" {
		writeError(w, http.StatusBadRequest, "CloudWatch cluster name is required — set it in Connection Settings")
		return
	}

	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "cluster"
	}

	ctx := r.Context()
	loadOpts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(awsCfg.Region),
	}
	if awsCfg.Profile != "" {
		loadOpts = append(loadOpts, awsconfig.WithSharedConfigProfile(awsCfg.Profile))
	}

	sdkCfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to load aws config: %v", err))
		return
	}

	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "3h"
	}
	rng, ok := cwRanges[rangeParam]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid range: must be one of 1h, 3h, 6h, 12h, 1d, 3d, 7d")
		return
	}

	cwClient := cloudwatch.NewFromConfig(sdkCfg)
	end := time.Now()
	start := end.Add(-rng.duration)
	period := rng.period

	var queries []cwtypes.MetricDataQuery
	unitMap := map[string]string{}

	switch scope {
	case "cluster":
		queries, unitMap = buildClusterQueries(clusterName, period)
	case "broker":
		brokerID := r.URL.Query().Get("broker_id")
		if brokerID == "" {
			writeError(w, http.StatusBadRequest, "broker_id required for scope=broker")
			return
		}
		queries, unitMap = buildBrokerQueries(clusterName, brokerID, period)
	case "topic":
		topicName := r.URL.Query().Get("topic")
		if topicName == "" {
			writeError(w, http.StatusBadRequest, "topic required for scope=topic")
			return
		}
		queries, unitMap = buildTopicQueries(clusterName, topicName, period)
	case "consumer":
		groupID := r.URL.Query().Get("group")
		if groupID == "" {
			writeError(w, http.StatusBadRequest, "group required for scope=consumer")
			return
		}
		queries, unitMap = buildConsumerQueries(clusterName, groupID, period)
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown scope %q", scope))
		return
	}

	series, err := fetchCWMetrics(ctx, cwClient, start, end, queries, unitMap)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("cloudwatch: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, metricsResponse{
		Window: metricsWindow{
			Start:         start.UTC().Format(time.RFC3339),
			End:           end.UTC().Format(time.RFC3339),
			PeriodSeconds: period,
		},
		Series: series,
	})
}

// fetchCWMetrics calls GetMetricData and maps results to metricsSeries.
// unitMap maps result IDs (or ID prefixes for SEARCH results) to unit strings.
func fetchCWMetrics(ctx context.Context, cw *cloudwatch.Client, start, end time.Time, queries []cwtypes.MetricDataQuery, unitMap map[string]string) ([]metricsSeries, error) {
	if len(queries) == 0 {
		return []metricsSeries{}, nil
	}

	seriesByID := map[string]*metricsSeries{}
	order := make([]string, 0)
	var nextToken *string

	for {
		out, err := cw.GetMetricData(ctx, &cloudwatch.GetMetricDataInput{
			StartTime:         aws.Time(start),
			EndTime:           aws.Time(end),
			MetricDataQueries: queries,
			ScanBy:            cwtypes.ScanByTimestampAscending,
			NextToken:         nextToken,
		})
		if err != nil {
			return nil, err
		}

		for _, res := range out.MetricDataResults {
			id := aws.ToString(res.Id)
			label := aws.ToString(res.Label)
			if label == "" {
				label = id
			}

			s, ok := seriesByID[id]
			if !ok {
				s = &metricsSeries{
					ID:         id,
					Label:      label,
					Unit:       resolveUnit(id, unitMap),
					Datapoints: make([]metricsDatapoint, 0, len(res.Timestamps)),
				}
				seriesByID[id] = s
				order = append(order, id)
			}

			for i, ts := range res.Timestamps {
				if i < len(res.Values) {
					s.Datapoints = append(s.Datapoints, metricsDatapoint{TS: ts.UnixMilli(), V: res.Values[i]})
				}
			}
		}

		if out.NextToken == nil || aws.ToString(out.NextToken) == "" {
			break
		}
		nextToken = out.NextToken
	}

	series := make([]metricsSeries, 0, len(order))
	for _, id := range order {
		s := seriesByID[id]
		sort.Slice(s.Datapoints, func(i, j int) bool { return s.Datapoints[i].TS < s.Datapoints[j].TS })
		series = append(series, *s)
	}
	return series, nil
}

// resolveUnit looks up the unit for a result ID, checking exact match then prefix match
// (SEARCH results get a numeric suffix appended to the query ID).
func resolveUnit(id string, unitMap map[string]string) string {
	if u, ok := unitMap[id]; ok {
		return u
	}
	for prefix, unit := range unitMap {
		if strings.HasPrefix(id, prefix+"_") {
			return unit
		}
	}
	return ""
}

// searchBrokerExpr builds a SEARCH expression for broker-level MSK metrics.
func searchBrokerExpr(clusterName, metricName, stat string, period int32) string {
	return fmt.Sprintf(
		`SEARCH('{AWS/Kafka,"Broker ID","Cluster Name"} MetricName="%s" "Cluster Name"="%s"', '%s', %d)`,
		metricName, clusterName, stat, period,
	)
}

// buildClusterQueries returns SEARCH+math queries to aggregate all brokers to cluster level.
func buildClusterQueries(clusterName string, period int32) ([]cwtypes.MetricDataQuery, map[string]string) {
	unitMap := map[string]string{
		"cpu_user":  "Percent",
		"disk_used": "Percent",
		"bytes_in":  "Bytes/Second",
		"bytes_out": "Bytes/Second",
	}
	queries := []cwtypes.MetricDataQuery{
		// CpuUser — average across all brokers
		{Id: aws.String("srch_cpu"), Expression: aws.String(searchBrokerExpr(clusterName, "CpuUser", "Average", period)), ReturnData: aws.Bool(false)},
		{Id: aws.String("cpu_user"), Label: aws.String("CPU User %"), Expression: aws.String("AVG(srch_cpu)"), ReturnData: aws.Bool(true)},
		// Disk used — average across all brokers
		{Id: aws.String("srch_disk"), Expression: aws.String(searchBrokerExpr(clusterName, "KafkaDataLogsDiskUsed", "Average", period)), ReturnData: aws.Bool(false)},
		{Id: aws.String("disk_used"), Label: aws.String("Disk Used %"), Expression: aws.String("AVG(srch_disk)"), ReturnData: aws.Bool(true)},
		// Bytes in — sum across all brokers
		{Id: aws.String("srch_bin"), Expression: aws.String(searchBrokerExpr(clusterName, "BytesInPerSec", "Sum", period)), ReturnData: aws.Bool(false)},
		{Id: aws.String("bytes_in"), Label: aws.String("Bytes In/sec"), Expression: aws.String("SUM(srch_bin)"), ReturnData: aws.Bool(true)},
		// Bytes out — sum across all brokers
		{Id: aws.String("srch_bout"), Expression: aws.String(searchBrokerExpr(clusterName, "BytesOutPerSec", "Sum", period)), ReturnData: aws.Bool(false)},
		{Id: aws.String("bytes_out"), Label: aws.String("Bytes Out/sec"), Expression: aws.String("SUM(srch_bout)"), ReturnData: aws.Bool(true)},
	}
	return queries, unitMap
}

// buildBrokerQueries returns direct MetricStat queries for a specific broker.
func buildBrokerQueries(clusterName, brokerID string, period int32) ([]cwtypes.MetricDataQuery, map[string]string) {
	dims := []cwtypes.Dimension{
		{Name: aws.String("Cluster Name"), Value: aws.String(clusterName)},
		{Name: aws.String("Broker ID"), Value: aws.String(brokerID)},
	}
	unitMap := map[string]string{
		"cpu_user":    "Percent",
		"disk_used":   "Percent",
		"bytes_in":    "Bytes/Second",
		"bytes_out":   "Bytes/Second",
		"memory_used": "Bytes",
	}
	stat := func(id, name, label, statStr string) cwtypes.MetricDataQuery {
		return cwtypes.MetricDataQuery{
			Id:    aws.String(id),
			Label: aws.String(label),
			MetricStat: &cwtypes.MetricStat{
				Metric: &cwtypes.Metric{
					Namespace:  aws.String("AWS/Kafka"),
					MetricName: aws.String(name),
					Dimensions: dims,
				},
				Period: aws.Int32(period),
				Stat:   aws.String(statStr),
			},
			ReturnData: aws.Bool(true),
		}
	}
	queries := []cwtypes.MetricDataQuery{
		stat("cpu_user", "CpuUser", "CPU User %", "Average"),
		stat("disk_used", "KafkaDataLogsDiskUsed", "Disk Used %", "Average"),
		stat("bytes_in", "BytesInPerSec", "Bytes In/sec", "Sum"),
		stat("bytes_out", "BytesOutPerSec", "Bytes Out/sec", "Sum"),
		stat("memory_used", "MemoryUsed", "Memory Used", "Average"),
	}
	return queries, unitMap
}

// buildTopicQueries returns SEARCH+SUM queries for a topic across all brokers.
func buildTopicQueries(clusterName, topicName string, period int32) ([]cwtypes.MetricDataQuery, map[string]string) {
	unitMap := map[string]string{
		"bytes_in":  "Bytes/Second",
		"bytes_out": "Bytes/Second",
	}
	expr := func(metricName, stat string) string {
		return fmt.Sprintf(
			`SEARCH('{AWS/Kafka,"Broker ID","Cluster Name",Topic} MetricName="%s" "Cluster Name"="%s" Topic="%s"', '%s', %d)`,
			metricName, clusterName, topicName, stat, period,
		)
	}
	queries := []cwtypes.MetricDataQuery{
		{Id: aws.String("srch_bin"), Expression: aws.String(expr("BytesInPerSec", "Sum")), ReturnData: aws.Bool(false)},
		{Id: aws.String("bytes_in"), Label: aws.String("Bytes In/sec"), Expression: aws.String("SUM(srch_bin)"), ReturnData: aws.Bool(true)},
		{Id: aws.String("srch_bout"), Expression: aws.String(expr("BytesOutPerSec", "Sum")), ReturnData: aws.Bool(false)},
		{Id: aws.String("bytes_out"), Label: aws.String("Bytes Out/sec"), Expression: aws.String("SUM(srch_bout)"), ReturnData: aws.Bool(true)},
	}
	return queries, unitMap
}

// buildConsumerQueries returns SEARCH queries for consumer group lag per topic.
// SEARCH returns one MetricDataResult per matching topic, so multiple series are returned.
func buildConsumerQueries(clusterName, groupID string, period int32) ([]cwtypes.MetricDataQuery, map[string]string) {
	unitMap := map[string]string{
		"sum_lag":  "Count",
		"time_lag": "Seconds",
	}
	expr := func(metricName, stat string) string {
		return fmt.Sprintf(
			`SEARCH('{AWS/Kafka,"Consumer Group","Cluster Name",Topic} MetricName="%s" "Cluster Name"="%s" "Consumer Group"="%s"', '%s', %d)`,
			metricName, clusterName, groupID, stat, period,
		)
	}
	queries := []cwtypes.MetricDataQuery{
		{Id: aws.String("sum_lag"), Expression: aws.String(expr("SumOffsetLag", "Maximum")), ReturnData: aws.Bool(true)},
		{Id: aws.String("time_lag"), Expression: aws.String(expr("EstimatedMaxTimeLag", "Maximum")), ReturnData: aws.Bool(true)},
	}
	return queries, unitMap
}
