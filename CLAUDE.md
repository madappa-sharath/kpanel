# kpanel — Claude Code Context

## Project Overview

kpanel is a lightweight, local web-based Kafka GUI. It works with **any Kafka cluster** — including local development, Confluent, self-managed, and AWS MSK. MSK gets first-class bonus features (cluster auto-discovery via AWS SDK, CloudWatch metrics) but core functionality (topics, consumer groups, message peek, lag) works with any Kafka host configured manually.

Users install kpanel on their local machine and launch a webapp on localhost. Auth to Kafka is managed via the user's existing credentials (AWS IAM for MSK, or no auth / SASL for other clusters). No separate auth layer, not centrally hosted.

**Philosophy:** Simple, focused, no over-engineering. Primary emphasis on helping users view topics, consumers, and cluster health at a glance.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Server | Hono (lightweight, Bun-native) |
| Kafka client | confluent-kafka-javascript + `aws-msk-iam-sasl-signer-js` (for MSK IAM) |
| AWS SDK | `@aws-sdk/client-kafka` (MSK discovery), `@aws-sdk/client-cloudwatch` (metrics) |
| Frontend | React + Vite + shadcn/ui + Tailwind CSS |
| Charts | recharts (shadcn-compatible) |

## Architecture

Monorepo layout:

```
apps/
  server/   — Bun + Hono REST API
  web/      — React + Vite frontend
packages/
  shared/   — Shared TypeScript types
```

- Server uses confluent-kafka-javascript admin API directly — **NO CLI wrapping, no Java, no JVM**
- Cluster config is stored locally (e.g. in a config file or in-memory during the session)
- MSK clusters can be auto-discovered via AWS SDK; all other clusters are manually configured
- MSK IAM auth via `aws-msk-iam-sasl-signer-js` generating OAUTHBEARER tokens
- Non-MSK clusters: plain, SASL/PLAIN, SASL/SCRAM, or no auth — whatever confluent-kafka-javascript supports

## Cluster Connection Model

Two ways to add a cluster:

1. **Manual** — user provides broker addresses + optional auth config. Works with any Kafka (local, Confluent, self-managed, MSK with non-IAM auth).
2. **MSK auto-discover** — user provides AWS region/profile, kpanel calls `@aws-sdk/client-kafka` to list MSK clusters and fetch bootstrap brokers automatically. Then connects with IAM auth.

MSK-specific features (only available when a cluster is identified as MSK):
- CloudWatch metrics (throughput, lag, broker resources)
- Cluster metadata from the MSK API (version, broker count, etc.)

## Key Design Decisions

### Why confluent-kafka-javascript (not kcat)?
`kcat` cannot do MSK IAM auth without rebuilding `librdkafka` from a custom fork. confluent-kafka-javascript has first-class MSK IAM support via AWS's official `aws-msk-iam-sasl-signer-js` library. It also provides structured data via the admin API rather than text parsing.

### Why a library (not CLI)?
No text parsing, no JVM, no shelling out. Structured data directly from the confluent-kafka-javascript admin API.

### Why Hono (not Express/Fastify)?
Lightweight, Bun-native, minimal boilerplate.

### Why Bun (not Node)?
Fast startup, native TypeScript support, built-in tooling (test runner, bundler, package manager).

## IAM Auth Pattern (MSK only)

```typescript
import { Kafka } from '@confluentinc/kafka-javascript';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';

function createMSKClient(brokers: string[], region: string) {
  return new Kafka({
    clientId: 'kpanel',
    brokers,
    ssl: true,
    sasl: {
      mechanism: 'oauthbearer',
      oauthBearerProvider: async () => {
        const token = await generateAuthToken({ region });
        return { value: token.token };
      }
    }
  });
}
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/clusters` | List all configured clusters (manual + MSK auto-discovered) |
| POST | `/api/clusters` | Add a manually configured cluster |
| DELETE | `/api/clusters/:id` | Remove a cluster |
| GET | `/api/clusters/msk/discover` | Auto-discover MSK clusters via AWS SDK |
| GET | `/api/clusters/:id/topics` | List topics via confluent-kafka-javascript admin |
| GET | `/api/clusters/:id/topics/:name` | Topic detail (partitions, replicas, ISR, configs) |
| GET | `/api/clusters/:id/groups` | List consumer groups |
| GET | `/api/clusters/:id/groups/:groupId` | Group detail with per-partition lag |
| POST | `/api/clusters/:id/topics/:name/peek` | Peek last N messages |
| GET | `/api/clusters/:id/metrics` | CloudWatch metrics (MSK only) |

Note: `:id` is an ARN for MSK clusters, or a user-defined identifier for manual clusters.

## CloudWatch Metrics (MSK only)

Namespace: `AWS/Kafka`

| Category | Metrics |
|---|---|
| Cluster health | `ActiveControllerCount`, `OfflinePartitionsCount`, `UnderReplicatedPartitions` |
| Throughput | `BytesInPerSec`, `BytesOutPerSec`, `MessagesInPerSec` |
| Consumer lag | `EstimatedMaxTimeLag`, `SumOffsetLag` |
| Broker resources | `CpuUser`, `KafkaDataLogsDiskUsed`, `MemoryUsed` |

## shadcn/ui Components Plan

- **DataTable** — topics, consumer groups, partitions
- **Card** — metric summaries
- **Tabs** — Topics / Groups / Brokers / Metrics
- **Command (⌘K)** — quick topic/group search
- **Sheet** — slide-out for topic detail, message peek
- **Badge** — ISR status, lag severity
- **Charts (recharts)** — CloudWatch time series

## Conventions

- TypeScript everywhere, strict mode
- Bun workspaces for monorepo
- Server code in `apps/server/src/`
- Frontend code in `apps/web/src/`
- Shared types in `packages/shared/`

## Commands

```bash
bun install          # install all dependencies
bun run dev          # start both server and frontend in dev mode
bun run dev:server   # server only
bun run dev:web      # frontend only
bun run build        # production build
bun run lint         # lint all packages
bun run typecheck    # type check all packages
```
