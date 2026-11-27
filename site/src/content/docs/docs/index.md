---
title: "kpanel documentation"
seoTitle: "kpanel docs: local Kafka GUI for Kafka and AWS MSK"
description: "Docs for kpanel, a local Kafka GUI and Kafka desktop client. Install it, connect to any Kafka cluster or AWS MSK with IAM, and browse your data."
---

kpanel is a Kafka GUI that runs on your own machine. It is a single binary: the Go server and the web UI are built into one file. You run it, it opens `http://localhost:8080` in your browser, and you add a connection to a Kafka cluster.

It works with any Kafka-compatible cluster: self-hosted Kafka, Redpanda, Aiven, Confluent Cloud or AWS MSK. AWS MSK gets extra features. kpanel can list the MSK clusters in your AWS account, sign in to them with `AWS_MSK_IAM` using your own AWS credentials, and show CloudWatch metrics for them.

## Start here

1. [Install kpanel](/docs/installation/).
2. [Add a connection](/docs/connecting/), or [import an MSK cluster](/docs/aws-msk/) with your AWS credentials.

## What you can do

- [Cluster overview and brokers](/docs/brokers/): controller, Kafka version, partition health, key broker configs, and per-broker partition and disk usage.
- [Topics](/docs/topics/): list topics, view partitions, replicas and ISR, read and edit topic configs, create and delete topics, and add partitions.
- [Messages](/docs/messages/): fetch messages by offset or timestamp, tail a topic live, and produce messages.
- [Search](/docs/search/): read up to 50,000 messages from a topic and match text or JSON fields.
- [Consumer groups](/docs/consumer-groups/): members, committed offsets, per-partition lag, a sampled lag and throughput history, and offset reset.
- [AWS MSK](/docs/aws-msk/): cluster discovery, IAM auth and CloudWatch metrics.

Changes to the cluster are locked until you turn on [write mode](/docs/write-mode/).
