package msk

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kafka"
)

// ClusterName resolves the human-readable MSK cluster name for the given ARN
// by calling DescribeClusterV2. This works for both provisioned and serverless clusters.
func ClusterName(ctx context.Context, region, profile, arn string) (string, error) {
	loadOpts := []func(*config.LoadOptions) error{
		config.WithRegion(region),
	}
	if profile != "" {
		loadOpts = append(loadOpts, config.WithSharedConfigProfile(profile))
	}
	awsCfg, err := config.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return "", fmt.Errorf("load aws config: %w", err)
	}
	out, err := kafka.NewFromConfig(awsCfg).DescribeClusterV2(ctx, &kafka.DescribeClusterV2Input{
		ClusterArn: aws.String(arn),
	})
	if err != nil {
		return "", fmt.Errorf("describe cluster: %w", err)
	}
	if out.ClusterInfo == nil || out.ClusterInfo.ClusterName == nil {
		return "", fmt.Errorf("cluster info missing from response")
	}
	return aws.ToString(out.ClusterInfo.ClusterName), nil
}

// ClusterInfo holds the discovered details of an MSK cluster.
type ClusterInfo struct {
	ARN     string   `json:"arn"`
	Name    string   `json:"name"`
	Brokers []string `json:"brokers"`
	State   string   `json:"state"`
	Region  string   `json:"region"`
}

// DiscoverClusters lists MSK clusters in the given region using the caller's AWS credentials.
// Returns an empty slice (not an error) if credentials are unavailable — the caller treats
// this as "no MSK clusters found" rather than a failure.
func DiscoverClusters(ctx context.Context, region string) ([]ClusterInfo, error) {
	awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Printf("msk discovery: failed to load AWS config: %v", err)
		return nil, nil
	}

	// Check credentials availability before making API calls.
	if _, err = awsCfg.Credentials.Retrieve(ctx); err != nil {
		log.Printf("msk discovery: AWS credentials unavailable: %v", err)
		return nil, nil
	}

	client := kafka.NewFromConfig(awsCfg)

	var clusters []ClusterInfo
	var nextToken *string
	for {
		out, err := client.ListClustersV2(ctx, &kafka.ListClustersV2Input{NextToken: nextToken})
		if err != nil {
			return nil, fmt.Errorf("list MSK clusters: %w", err)
		}

		for _, c := range out.ClusterInfoList {
			if c.ClusterArn == nil {
				continue
			}

			brokersOut, err := client.GetBootstrapBrokers(ctx, &kafka.GetBootstrapBrokersInput{
				ClusterArn: c.ClusterArn,
			})
			if err != nil {
				log.Printf("msk discovery: failed to get brokers for %s: %v", aws.ToString(c.ClusterArn), err)
				continue
			}

			var brokers []string
			switch {
			case brokersOut.BootstrapBrokerStringSaslIam != nil:
				brokers = splitBrokers(aws.ToString(brokersOut.BootstrapBrokerStringSaslIam))
			case brokersOut.BootstrapBrokerStringTls != nil:
				brokers = splitBrokers(aws.ToString(brokersOut.BootstrapBrokerStringTls))
			case brokersOut.BootstrapBrokerString != nil:
				brokers = splitBrokers(aws.ToString(brokersOut.BootstrapBrokerString))
			}

			clusters = append(clusters, ClusterInfo{
				ARN:     aws.ToString(c.ClusterArn),
				Name:    aws.ToString(c.ClusterName),
				Brokers: brokers,
				State:   string(c.State),
				Region:  region,
			})
		}

		if out.NextToken == nil {
			break
		}
		nextToken = out.NextToken
	}

	return clusters, nil
}

func splitBrokers(s string) []string {
	var result []string
	for _, b := range strings.Split(s, ",") {
		if b = strings.TrimSpace(b); b != "" {
			result = append(result, b)
		}
	}
	return result
}
