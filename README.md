# kpanel

Local Kafka GUI for any cluster. Runs on your workstation, uses your credentials. Native AWS MSK and IAM auth support.

![Status](https://img.shields.io/badge/status-under%20development-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What it does

- **Browse topics** — partition layout, replication state, ISR status, configuration
- **Peek messages** — inspect the last N messages from any topic with offset display
- **Consumer group lag** — per-partition lag for every consumer group
- **Broker health** — broker metadata, partition assignments, leader/follower status
- **Cluster overview** — active controller, under-replicated partitions, key cluster configs
- **MSK auto-discovery** — enumerate MSK clusters in your AWS account without copy-pasting broker URLs
- **CloudWatch metrics** — throughput, lag, and broker resource charts pulled from CloudWatch (MSK connections only)
- **Any Kafka** — works with self-hosted Kafka, Confluent Cloud, Aiven, Redpanda, or any Kafka-compatible broker
- **Single binary** — self-contained binary with embedded frontend; no runtime dependencies

## How it works

Most Kafka GUIs — AKHQ, Kafka UI, Redpanda Console — are deployed as a central service. They run on a server, authenticate to Kafka with a shared service account, and expose their own web auth layer. Every team member accesses the same instance.

kpanel is different: each user runs it locally on their workstation.

```
Your workstation
┌────────────────────────────────────────────────────────┐
│                                                        │
│   kpanel binary                                        │
│   ┌─────────────────────────────────────────────────┐ │
│   │  React UI  ←──→  Go HTTP server                 │ │
│   │                  │                              │ │
│   │                  ├─ franz-go (Kafka client)     │ │
│   │                  ├─ AWS SDK (MSK + CloudWatch)  │ │
│   │                  └─ your local AWS credentials  │ │
│   └─────────────────────────────────────────────────┘ │
│                  │                                     │
└──────────────────┼─────────────────────────────────────┘
                   │  direct connection
                   ▼
            AWS MSK cluster
```

The binary listens on localhost. It reads your existing AWS credentials directly — `~/.aws/credentials`, environment variables, EC2 instance metadata, whatever the AWS SDK finds. No credential sharing between teammates, no token vending machine, no IAM role gymnastics to give a central service access to your clusters.

## AWS MSK

kpanel is specifically designed so `aws sso login` + `./kpanel` just works.

**Auto-discovery.** Click "Discover MSK Clusters" in the UI. kpanel calls the AWS Kafka API, lists your clusters, and imports their broker endpoints automatically. No broker URLs to look up.

**IAM authentication.** MSK connections authenticate via `AWS_MSK_IAM` SASL, implemented natively in franz-go. Your credentials (SSO, instance profile, environment variables — anything the AWS SDK resolves) are used directly. Credentials are refreshed automatically; no manual token rotation.

**CloudWatch metrics.** MSK connections surface a Metrics tab with CloudWatch charts: bytes in/out, messages per second, consumer lag, CPU, disk, memory. Pulled via the CloudWatch API using the same credentials.

AWS features activate automatically when AWS credentials are present. The core Kafka functionality works without any AWS credentials.

## Quick Start

**Download the binary:**

```bash
# macOS — Apple Silicon (M1/M2/M3)
curl -L https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_darwin_arm64.tar.gz | tar xz
./kpanel

# macOS — Intel
curl -L https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_darwin_amd64.tar.gz | tar xz
./kpanel

# Linux (amd64)
curl -L https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_linux_amd64.tar.gz | tar xz
./kpanel
```

**Run it:**

```bash
# For AWS MSK: make sure AWS credentials are configured first
aws sso login   # or aws configure, or set AWS_PROFILE / AWS_ACCESS_KEY_ID

./kpanel
```

**Open your browser:**

```
http://localhost:8080
```

From there: add a manual connection (enter broker addresses) or click "Discover MSK Clusters" to auto-import from your AWS account.

## Build from Source

**Prerequisites:** [Go 1.22+](https://go.dev/dl/) and [Bun](https://bun.sh)

```bash
git clone https://github.com/madappa-sharath/kpanel.git
cd kpanel

# Install dependencies
make setup

# Development (Go on :8080, React dev server on :3000 with HMR)
make dev

# Production build → ./dist/kpanel
make build

# Cross-compile
make build-linux    # Linux amd64
make build-darwin   # macOS arm64
```

In development, open [http://localhost:3000](http://localhost:3000). The Bun dev server proxies `/api` requests to the Go server at `:8080`.

## Configuration

Connections are stored in `~/.kpanel/connections.json`. They can be added via the UI or pre-populated manually.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `KPANEL_PORT` | `8080` | HTTP port |
| `KPANEL_CONFIG_DIR` | `~/.kpanel` | Config directory |
| `AWS_REGION` | — | Default region for MSK discovery |
| `AWS_PROFILE` | — | AWS profile to use |

Standard AWS environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) work as expected.

## Dependencies

Direct dependencies:

**Server (Go):**

| Package | Role | Why |
|---|---|---|
| `twmb/franz-go` | Kafka client | Most complete Go Kafka client; actively maintained; built-in `AWS_MSK_IAM` SASL; production-proven at scale |
| `twmb/franz-go/pkg/kadm` | Admin operations | Structured admin API on top of franz-go (topic/group management, offset operations) |
| `twmb/franz-go/pkg/kmsg` | Kafka protocol types | Low-level protocol message types used alongside kadm |
| `go-chi/chi/v5` | HTTP router | Lightweight, stdlib-compatible; no framework lock-in |
| `aws/aws-sdk-go-v2` | AWS integration | Official AWS SDK; MSK cluster discovery, CloudWatch metrics |
| `zalando/go-keyring` | Credential storage | OS keychain integration — macOS Keychain, Linux Secret Service, Windows Credential Manager |
| `testcontainers-go/modules/kafka` | Integration tests | Spins up a real Kafka container for tests |

**Frontend (JS — runtime deps only):**

| Package | Role |
|---|---|
| `react` + `react-dom` | UI framework |
| `@tanstack/react-router` | Type-safe SPA routing |
| `@tanstack/react-query` | Server state management and caching |
| `zustand` | Lightweight client state (active cluster, sidebar, theme) |
| `@radix-ui/*` | Accessible UI primitives (via shadcn/ui) |
| `recharts` | Charts for CloudWatch metrics |
| `lucide-react` | Icons |
| `tailwindcss` | Styling |

**Frontend tooling (not bundled):** Bun handles dev server, bundling, and package management. No Vite, no webpack, no PostCSS pipeline.

## License

MIT — see [LICENSE](./LICENSE).
