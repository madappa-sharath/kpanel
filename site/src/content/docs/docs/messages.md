---
title: "Messages"
seoTitle: "Browse, tail and produce Kafka messages in kpanel"
description: "Read Kafka messages by offset or timestamp, tail a topic live, inspect keys, values and headers, and produce messages with headers and a partition."
---

The **Messages** tab of a topic browses its messages. To find messages anywhere in the topic, use [Search](/docs/search/).

## Fetch messages

Pick:

- **Partition**: all partitions, or one.
- **Start**:
  - **Last N**: the newest messages.
  - **From Offset**: messages starting at an offset.
  - **From Timestamp**: messages starting at the first offset at or after a date and time.
- **Count**: 10, 20, 50, 100, 200 or 500 messages.

Each row shows the partition, offset, timestamp (relative or absolute), key and value. Click a row to open its detail: the key, headers and value, with JSON values pretty-printed. There are copy buttons for the key, the headers and the value.

Keys and values that are not valid UTF-8 are sent as base64 and shown as binary.

kpanel decodes values as text. It does not decode Avro or Protobuf.

## Live tail

Click **Live** to fetch again on an interval: 1s, 2s, 5s, 10s, 30s or 1m. Live tail pauses while you are on another tab of the topic, such as Search, and resumes when you come back. Click **Live** again to stop.

## Filter

The **Filter** box above the list narrows the rows on screen. It runs in your browser, matches plain text in the key and value without case, and skips binary values. It takes no operators. For the query language, use [Search](/docs/search/).

## Produce a message

In [write mode](/docs/write-mode/), the topic has a **Produce** action. It takes:

- **Key**: optional.
- **Partition**: automatic, or a specific partition.
- **Value**: as text, or as JSON. In JSON mode kpanel checks that the value is valid JSON before it sends it.
- **Headers**: optional key/value pairs. Each header needs a key.

After the message is written, kpanel shows the partition and offset it was written to.
