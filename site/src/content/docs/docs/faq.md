---
title: "FAQ"
seoTitle: "kpanel FAQ \u2014 local Kafka GUI and AWS MSK client"
description: "Common questions about kpanel, a free and open source Kafka GUI that runs locally, supports any Kafka cluster and connects to AWS MSK with IAM auth."
---

## What is kpanel?

A Kafka GUI that runs on your machine as a single binary. You use it in your browser to look at topics, messages, consumer groups and brokers, and to make changes when you turn on write mode.

## Does it work with clusters other than AWS MSK?

Yes. It works with any Kafka-compatible cluster: self-hosted Apache Kafka, Redpanda, Aiven, Confluent Cloud and others. Auth options are none, SASL PLAIN, SASL SCRAM-SHA-256/512 and AWS IAM, with or without TLS. See [Connecting](/docs/connecting/).

## How does it connect to MSK with IAM?

It uses the `AWS_MSK_IAM` SASL mechanism with credentials from your own AWS SDK chain, for example after `aws sso login`. No shared service account is needed. See [AWS MSK](/docs/aws-msk/).

## Do I need Docker, a JVM or a database?

No. Download the binary and run it. Docker is only needed to run the development environment from source.

## Is it free?

Yes. kpanel is open source under the MIT license. There is no license key, account, or limit on clusters or users.

## Is kpanel a Kafka desktop client?

Yes. It runs on your machine and opens the Kafka UI in your default browser. The binary runs a small HTTP server locally. There is no separate app window.

## Can my team share one kpanel?

kpanel is made for each person to run their own copy with their own credentials. It has no login or user management. See [Security model](/docs/security/).

## Can it decode Avro or Protobuf?

No. Message keys and values are shown as text, JSON is pretty-printed, and other binary data is shown as base64.

## Does it support mutual TLS (client certificates)?

No. TLS with a custom CA certificate is supported. Client certificates are not.

## Does it send data anywhere?

Only to your Kafka brokers, to AWS for MSK features, and to the GitHub API to check for new releases. There is no telemetry. See [Network connections](/docs/security/#network-connections).

## Where are my connections stored?

In `~/.kpanel/config.json`, with passwords in the OS keychain. See [Configuration](/docs/configuration/).

## Which platforms are supported?

macOS (Apple Silicon and Intel), Linux (x86-64 and ARM64) and Windows (x86-64 and ARM64).
