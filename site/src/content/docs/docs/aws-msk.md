---
title: "Connect to AWS MSK with IAM"
seoTitle: "AWS MSK GUI: IAM auth, discovery and CloudWatch | kpanel"
description: "Use kpanel as an AWS MSK GUI. Find MSK clusters, connect with AWS_MSK_IAM using your own credentials, view CloudWatch metrics, and set IAM permissions."
---

Use kpanel as an AWS MSK GUI with your own AWS profile. kpanel signs in to MSK as you. It reads AWS credentials from the standard AWS SDK chain on your machine: SSO, `~/.aws/config` and `~/.aws/credentials` profiles, environment variables, or an instance profile. No shared service account is involved. Each person runs their own kpanel and gets the access their own IAM identity has.

If kpanel finds no AWS credentials, the AWS panel on the start page says so. Everything that is not MSK-specific still works.

## Discover clusters

The start page has an **AWS MSK** panel.

1. Pick a **Profile**. The list comes from your AWS config file (`~/.aws/config`, or `AWS_CONFIG_FILE`). The panel shows the AWS account for that profile, or "credentials inactive" if the credentials do not work.
2. Check the **Region**. It defaults to the profile's region, or to `AWS_REGION` / `AWS_DEFAULT_REGION`. You can type another one.
3. Click **Discover**. kpanel lists the MSK clusters in that account and region.
4. Click **Import** next to a cluster. If the cluster has public endpoints, choose to connect through the private or public brokers.

Import saves a connection with the cluster's bootstrap brokers, AWS IAM auth, the profile, the region, and the cluster name for CloudWatch.

Import always sets up IAM auth over TLS, so the cluster needs IAM access control turned on, and your machine must be able to reach its brokers. For a cluster that uses SASL/SCRAM or no auth, [add the connection by hand](/docs/connecting/) instead.

You can also add an MSK cluster by hand. See [Connecting](/docs/connecting/#aws-iam).

## IAM auth

MSK connections use the `AWS_MSK_IAM` SASL mechanism over TLS, through the [franz-go](https://github.com/twmb/franz-go) Kafka client. kpanel gets credentials from the AWS SDK for the connection's profile and region each time it signs in, so refreshed SSO or role credentials are picked up.

When SSO credentials have expired, kpanel shows the command to fix it, for example `aws sso login --profile my-profile`. Run it, then click recheck.

## CloudWatch metrics

MSK connections get a **Metrics** page, and extra charts on other pages. kpanel reads them from the `AWS/Kafka` CloudWatch namespace with the connection's credentials.

| Page | Metrics |
|---|---|
| Metrics (cluster) | `CpuUser`, `KafkaDataLogsDiskUsed`, `BytesInPerSec`, `BytesOutPerSec`, across brokers |
| Broker detail | `CpuUser`, `KafkaDataLogsDiskUsed`, `BytesInPerSec`, `BytesOutPerSec`, `MemoryUsed` |
| Topic overview | `BytesInPerSec`, `BytesOutPerSec` for the topic |
| Consumer group, Lag tab | `SumOffsetLag` and `EstimatedMaxTimeLag` per topic, with topic bytes in and out |

Time ranges are 1h, 3h, 6h, 12h, 1d, 3d and 7d.

Metrics need the **CloudWatch cluster name**, which import sets for you. For a connection you added by hand, set it in the connection settings. MSK publishes some metrics only at higher monitoring levels. If your cluster does not publish a metric, its chart is empty.

## IAM permissions

The permissions depend on what you use. Scope `Resource` to your clusters, topics and groups as needed.

**Discovery** (start page):

- `kafka:ListClustersV2`
- `kafka:GetBootstrapBrokers`

**Metrics**:

- `cloudwatch:GetMetricData`

**Reading the cluster** (IAM access control for MSK):

- `kafka-cluster:Connect`
- `kafka-cluster:DescribeCluster`
- `kafka-cluster:DescribeClusterDynamicConfiguration`
- `kafka-cluster:DescribeTopic`
- `kafka-cluster:DescribeTopicDynamicConfiguration`
- `kafka-cluster:ReadData`
- `kafka-cluster:DescribeGroup`

**Write actions** (only if you use [write mode](/docs/write-mode/)):

- `kafka-cluster:WriteData` to produce messages
- `kafka-cluster:CreateTopic`
- `kafka-cluster:DeleteTopic`
- `kafka-cluster:AlterTopic` to add partitions
- `kafka-cluster:AlterTopicDynamicConfiguration` to edit topic configs
- `kafka-cluster:AlterGroup` to reset consumer group offsets

A read-only example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["kafka:ListClustersV2", "kafka:GetBootstrapBrokers", "cloudwatch:GetMetricData"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kafka-cluster:Connect",
        "kafka-cluster:DescribeCluster",
        "kafka-cluster:DescribeClusterDynamicConfiguration",
        "kafka-cluster:DescribeTopic",
        "kafka-cluster:DescribeTopicDynamicConfiguration",
        "kafka-cluster:ReadData",
        "kafka-cluster:DescribeGroup"
      ],
      "Resource": [
        "arn:aws:kafka:REGION:ACCOUNT:cluster/CLUSTER_NAME/*",
        "arn:aws:kafka:REGION:ACCOUNT:topic/CLUSTER_NAME/*",
        "arn:aws:kafka:REGION:ACCOUNT:group/CLUSTER_NAME/*"
      ]
    }
  ]
}
```

kpanel also calls `sts:GetCallerIdentity` to show which AWS account and principal you are signed in as. That call needs no permission.
