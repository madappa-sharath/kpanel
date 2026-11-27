---
title: "Topics"
seoTitle: "Browse Kafka topics, partitions and configs in kpanel"
description: "List Kafka topics with partitions, message counts, size and ISR health. View partitions and offsets, edit configs, create and delete topics."
---

## Topic list

The **Topics** page lists the cluster's topics with:

- **Partitions**
- **Messages**: the number of messages currently in the topic, from start and end offsets
- **Size**: data on disk
- **RF**: replication factor
- **ISR Health**: *Healthy*, or *Degraded* with the number of under-replicated partitions

You can filter by name, sort by any column, and show or hide internal topics such as `__consumer_offsets`. kpanel remembers the filter, sort and page for each cluster.

## Topic detail

A topic has five tabs.

**Overview** shows partitions, replication factor, `min.insync.replicas`, retention, cleanup policy, total messages and end offset. It also shows disk usage split into primary data and replica overhead, how partition leaders are spread across brokers, and the consumer groups reading the topic with their lag. MSK connections also get bytes in/out charts from CloudWatch.

**Partitions** lists each partition with:

- Leader, replicas and ISR
- Start offset, high watermark and message count
- Skew: *Hot* when a partition has more than twice the average message count, *Cold* when it has less than half
- Status: *In Sync*, *Under-replicated* or *Offline*

**Configuration** lists every topic config and where its value comes from. You can hide the configs that use the default value. In [write mode](/docs/write-mode/), you can edit a value.

**Messages** and **Search** are described in [Messages](/docs/messages/) and [Search](/docs/search/).

## Write actions

These need [write mode](/docs/write-mode/).

- **Create topic**: name, partition count and replication factor.
- **Increase partitions**: set a new total partition count. Kafka cannot reduce the partition count of a topic.
- **Delete topic**: type the topic name to confirm.
- **Edit config**: change one topic config value.
- **Produce message**: see [Messages](/docs/messages/#produce-a-message).
