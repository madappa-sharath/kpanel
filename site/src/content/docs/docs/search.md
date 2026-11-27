---
title: "Search"
seoTitle: "Search Kafka messages by text or JSON field in kpanel"
description: "Search Kafka messages in kpanel. Match plain text in keys and values, or query JSON fields with ==, !=, >, <, ~= and field-exists checks."
---

The **Search** tab reads messages from the topic and returns the ones that match a query. kpanel reads the messages from Kafka and does the matching itself, up to 50,000 messages per search. It finds messages you have not fetched. Browsing, paging and live tail are on the [Messages](/docs/messages/) tab.

## Controls

- **Query**: see [Query language](#query-language).
- **Partition**: all partitions, or one.
- **Start**:
  - **From newest**: scan back from the end of each partition.
  - **From offset**: scan forward from an offset.
  - **From timestamp**: scan forward from the first offset at or after a date and time.
- **Scan budget**: how many messages to read, from 500 to 50,000. The default is 1,000. With several partitions, the budget is split evenly across them.
- **Max results**: 20, 50, 100, 200 or 500 matches.

To reach older messages, raise the scan budget or set a start offset or timestamp.

A scan has a deadline of 60 seconds, or 180 seconds for budgets above 10,000.

## Results

The summary shows how many messages were scanned out of how many were in range. It also says when the scan stopped early because it hit the result limit, the scan budget or the deadline. Results are partial in those cases.

The **Filter** box above the results narrows the rows on screen in your browser. It takes plain text only. The query language below is for the Search query.

## Query language

### Plain text

A plain query matches as a substring, without case, anywhere in the message key or value. You do not need to know the field name.

```
payment declined
order-4821
user@example.com
```

Only a leading `$.` marks a JSON path, so `$100 refund` is searched as text.

To search for text that contains an operator (`==`, `!=`, `>`, `>=`, `<`, `<=`, `~=`), put the whole query in double quotes:

```
"a > b"
"status==done"
```

### JSON fields

For JSON values you can query a field directly. Dotted paths index into nested objects, and numbers index into arrays (`items.0.sku`).

| Query | Matches |
|---|---|
| `user.id == "abc"` | The field equals a string, number, or `true` / `false` |
| `status != "done"` | The field does not equal the value |
| `latency > 100` | Numeric comparison. Also `>=`, `<`, `<=` |
| `name ~= "kafka"` | The field contains the text. This match is case-sensitive |
| `$.user.premium` | The field is present. The `$.` prefix marks it as a path |

A leading `$.` or `$` on a path in a comparison is optional: `$.user.id == "abc"` is the same as `user.id == "abc"`.

Field queries only match values that are valid JSON, and only look at the value, not the key. A comparison does not match messages where the field is missing.
