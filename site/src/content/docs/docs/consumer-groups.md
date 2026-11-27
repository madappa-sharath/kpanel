---
title: "Consumer groups"
seoTitle: "Kafka consumer lag history and offset reset | kpanel"
description: "Kafka consumer group members, offsets and per-partition lag in kpanel, with a sampled lag and throughput history and offset reset with a preview."
---

## Group list

The **Consumer Groups** page lists every group with its state, member count, topics, total lag and coordinator broker. You can search by group ID, filter by state, and sort by lag (highest or lowest first) or by group ID.

## Group detail

A group has three tabs.

**Members** lists each member's client ID, host, assigned partitions and the lag on those partitions.

**Offsets** lists each topic partition the group has committed offsets for: the committed offset, the log end offset, the lag, and the member that owns the partition. It also shows the total lag.

**Lag** shows the lag history described below. For AWS MSK connections it also shows CloudWatch charts: `SumOffsetLag` (offset lag) and `EstimatedMaxTimeLag` (time lag) per topic, with the topic's bytes in and out.

## Lag history and throughput

When you open the Lag tab, the kpanel server starts sampling the group every 5 seconds. Each sample records:

- Total lag, and lag per topic
- **Incoming**: messages per second produced to the group's partitions
- **Processed**: messages per second the group committed past
- The number of partitions whose committed offset moved

The tab charts lag in messages, and incoming and processed throughput in messages per second as a 15-second average. Rates appear after the second sample.

Sampling continues for 4 hours after you last viewed the tab, so you can leave and come back to a continuous history. kpanel keeps the last 4 hours of samples. The history is kept in memory only. It is lost when kpanel stops.

From the samples, kpanel shows a status for the group, and for each topic when the group reads more than one:

| Status | Meaning |
|---|---|
| Caught up | Lag is 0 |
| Keeping up | The group trails only by what arrived since its last commit |
| Draining | Lag is going down. kpanel shows an estimate of when it clears |
| Not shrinking | The group is consuming but lag is not going down |
| Falling behind | Lag is growing |
| No progress / Stalled | Messages are arriving but the group is not committing |
| Idle | No lag and no traffic |
| Measuring | Waiting for the first commit to measure against |

## Reset offsets

Resetting offsets needs [write mode](/docs/write-mode/). Click **Reset offsets** on the group.

1. **Topic**: pick one of the topics the group has offsets for. The reset applies to every partition of that topic.
2. **Strategy**:
   - **Earliest**: the start of each partition.
   - **Latest**: the end of each partition.
   - **Timestamp**: the first offset at or after a date and time, on each partition.
   - **Offset**: one offset applied to every partition. Offset 200 on partition 0 is a different message from offset 200 on partition 1. To move all partitions to the same point in time, use Timestamp.
3. **Preview**: kpanel shows each partition that will change, with its current and new offset. Nothing is written yet.
4. **Apply**: kpanel commits the new offsets.

Stop the consumers before you reset. If the group has active members, kpanel blocks the reset. Running consumers commit their own offsets within seconds and undo the reset. You can override the block with a checkbox, but the reset will probably not hold.
