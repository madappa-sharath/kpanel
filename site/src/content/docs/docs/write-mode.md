---
title: "Write mode"
seoTitle: "Write mode \u2014 read-only by default in the kpanel Kafka GUI"
description: "kpanel opens read-only. Turn on write mode in a browser tab to create, delete or change topics, produce messages and reset consumer group offsets."
---

kpanel opens read-only. Buttons that change the cluster are hidden until you turn on write mode.

## What write mode unlocks

- Create a topic
- Delete a topic
- Increase a topic's partitions
- Edit a topic config value
- Produce a message
- Reset consumer group offsets

Destructive actions also ask for confirmation. Deleting a topic needs you to type its name. Resetting offsets shows a preview of every partition that will change before you apply it.

## Turn it on

Click **Read-only** in the header and choose **Enable write mode**, or click **Enable** on the read-only notice on a page. The header then shows **Write mode**.

Write mode applies to the current browser tab only. It survives a page refresh in that tab. A new tab, or a new browser session, starts read-only again. To turn it off, click **Write mode** in the header and choose **Disable write mode**.
