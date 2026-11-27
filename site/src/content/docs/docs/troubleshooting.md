---
title: "Troubleshooting"
seoTitle: "Troubleshooting kpanel: Kafka, TLS and MSK IAM errors"
description: "Fix common kpanel problems: command not found, port in use, broker connection failures, TLS errors, expired AWS SSO, MSK IAM denied, no metrics."
---

## `kpanel: command not found` after install

The install directory is not in your `PATH`. The install script printed the command to add it. For the default directory:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add that line to your shell profile to keep it.

## Port 8080 is already in use

kpanel picks a free port by itself and prints it as `Note  port 8080 was in use, using …`. To choose the port, set `KPANEL_PORT`:

```bash
KPANEL_PORT=9000 kpanel
```

## The browser did not open

Open the URL that kpanel printed, for example `http://localhost:8080`.

## Cannot connect to the brokers

- Check that the broker addresses are `host:port` pairs that your machine can reach. Brokers in a private VPC need a VPN, a bastion or similar.
- Brokers advertise their own addresses after the first connection. Those addresses must also be reachable from your machine.
- Check that the auth mechanism and TLS setting match the broker's listener. A TLS listener needs **Enable TLS**. A SASL listener needs the matching SASL mechanism.
- For MSK, check that you imported or entered the bootstrap brokers for the auth type you use. IAM uses its own broker port.

## TLS errors

If the error mentions an unknown authority or certificate verification, the broker certificate is signed by a CA your system does not trust. Upload the CA certificate in the connection's TLS settings. If you see `no valid PEM blocks found`, the file you uploaded is not a PEM certificate.

## AWS credentials inactive or expired

The AWS MSK panel and MSK connections show the error from AWS. For expired SSO credentials kpanel shows the command to fix it, for example:

```bash
aws sso login --profile my-profile
```

Run it, then click recheck in kpanel. You do not need to restart kpanel.

## No AWS profiles or no MSK clusters listed

- kpanel lists profiles from `~/.aws/config`, or from the file in `AWS_CONFIG_FILE`.
- Discovery lists clusters in one region. Check the region in the AWS MSK panel.
- Discovery needs `kafka:ListClustersV2` and `kafka:GetBootstrapBrokers`. See [IAM permissions](/docs/aws-msk/#iam-permissions).

## MSK connection fails with access denied

Your IAM identity needs `kafka-cluster:Connect` and the describe and read permissions on the cluster, topics and groups. The cluster must have IAM access control turned on. See [IAM permissions](/docs/aws-msk/#iam-permissions).

## Metrics are missing

- **"CloudWatch cluster name is required"**: set the cluster name in the connection settings. Use the plain cluster name from the AWS console.
- **"CloudWatch access denied"**: add `cloudwatch:GetMetricData` to your IAM policy.
- **Empty charts**: MSK publishes some metrics only at higher monitoring levels. If your cluster does not publish a metric, its chart is empty.

Metrics are only available for AWS MSK connections.

## A write button is missing

Write actions are hidden in read-only mode. Turn on [write mode](/docs/write-mode/).

## An offset reset did not hold

The group had running consumers, which committed their own offsets after the reset. Stop all consumers in the group, then reset again.

## Keychain errors on Linux

kpanel stores SASL passwords through the Secret Service API. You need a running Secret Service provider, such as GNOME Keyring or KeePassXC, in your session.
