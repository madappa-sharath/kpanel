---
title: "Cluster overview and brokers"
seoTitle: "Kafka cluster overview and broker metadata | kpanel"
description: "The kpanel Kafka UI dashboard: controller, Kafka version, partition health and key broker configs, plus each broker's partitions, replicas and disk."
---

## Cluster overview

When you open a cluster, kpanel shows its dashboard:

- **Counts**: brokers, topics, partitions and consumer groups. The topic and group counts link to their lists.
- **Cluster identity**: cluster ID, controller broker, Kafka version, and for AWS MSK connections the IAM principal kpanel signed in as.
- **Partition health**: total, under-replicated and offline partitions. If any partition is under-replicated or offline, the dashboard shows a warning.
- **Configuration**: a set of broker configs that affect reliability, retention and performance, such as `default.replication.factor`, `min.insync.replicas`, `unclean.leader.election.enable`, `log.retention.hours`, `auto.create.topics.enable` and `message.max.bytes`. Some of them have a check that flags risky values and explains why.

MSK connections also get a **View Metrics** link to the [CloudWatch metrics page](/docs/aws-msk/#cloudwatch-metrics).

## Brokers

The **Brokers** page lists every broker:

| Column | Meaning |
|---|---|
| Broker | Node ID |
| Address | Host and port |
| Rack | Rack ID, if set |
| Role | Controller or broker |
| Leader Partitions | Partitions this broker leads |
| Total Replicas | Partition replicas on this broker |
| Disk Used | Size of the broker's log directories |

Click a broker to see its node ID, address, rack and role. For MSK connections, the broker page also shows CPU, disk, memory and bytes in/out charts from CloudWatch.
