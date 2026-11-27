---
title: Connecting to Kafka
seoTitle: Connect kpanel to Kafka — SASL PLAIN, SCRAM, TLS and AWS MSK IAM
description: Add a Kafka connection in kpanel. Supported auth is none, SASL PLAIN, SASL SCRAM-SHA-256, SASL SCRAM-SHA-512, TLS with an optional CA certificate, and AWS MSK IAM.
---

A connection is a name, a list of bootstrap brokers and the auth settings for one cluster. kpanel saves connections in `~/.kpanel/config.json` and saves passwords in your OS keychain. See [Configuration](/docs/configuration/).

## Add a connection

On the start page, add a cluster. The form has three steps.

1. **Platform.** Pick one:
   - **Generic Kafka**: self-hosted Kafka, Redpanda, Aiven, or any Kafka-compatible broker.
   - **AWS MSK**: IAM auth and CloudWatch metrics. See [AWS MSK](/docs/aws-msk/).
   - **Confluent Cloud**: uses the same auth options as Generic Kafka.
2. **Connection.**
   - **Name**: a display name. kpanel makes the connection ID from it, for example `production-msk`. The ID does not change later.
   - **Color**: optional. It marks the cluster in the UI.
   - **Broker addresses**: comma-separated `host:port` pairs, for example `broker-1:9092, broker-2:9092`.
   - **Enable TLS**: optional, with a CA certificate.
3. **Auth.** The auth mechanism and credentials, described below.

You can edit or delete a connection later from the start page or from the cluster's connection settings.

## Auth mechanisms

| Mechanism | Use it for |
|---|---|
| None | Brokers with no authentication, such as a local `PLAINTEXT` listener. |
| SASL PLAIN | Username and password over SASL/PLAIN. For Confluent Cloud, use your API key as the username and the API secret as the password, and turn on TLS. |
| SASL SCRAM-SHA-256 | SCRAM with SHA-256. |
| SASL SCRAM-SHA-512 | SCRAM with SHA-512. |
| AWS IAM | AWS MSK clusters with IAM access control. Set on the AWS MSK platform. |

For the SASL mechanisms, enter a username and password. kpanel stores both in the OS keychain, not in the config file. When you edit a connection, leave the password blank to keep the stored one.

## TLS

Turn on **Enable TLS** for brokers with a TLS listener. With no CA certificate, kpanel checks the broker certificate against your system's trusted CAs.

If your brokers use a private CA, upload its certificate (`.pem`, `.crt` or `.cer`). kpanel saves the file as `~/.kpanel/certs/<connection-id>.pem` and trusts only the CAs in that file for this connection.

Client certificates (mutual TLS) are not supported.

AWS IAM connections always use TLS. You do not need to turn it on.

## AWS IAM

For an AWS MSK connection, the auth step asks for:

- **AWS Profile**: the name of a profile in your AWS config. The default is `default`.
- **AWS Region**: the cluster's region.
- **CloudWatch cluster name**: optional. Enter the plain MSK cluster name from the AWS console. kpanel needs it to show CloudWatch metrics.

kpanel loads credentials for that profile with the standard AWS SDK chain and signs in with the `AWS_MSK_IAM` SASL mechanism. See [AWS MSK](/docs/aws-msk/) for discovery and the IAM permissions.

## Connection status

When you open a cluster, the header shows whether kpanel is connected to it. For an AWS MSK connection, hover over the status to see the IAM principal ARN that kpanel signed in as. If the connection fails, see [Troubleshooting](/docs/troubleshooting/).
