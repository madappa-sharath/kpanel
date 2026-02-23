# kpanel

> Lightweight Kafka GUI. Works with any cluster. First-class AWS MSK support.

![Status](https://img.shields.io/badge/status-under%20development-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

**🚧 Under Development**

---

## Why?

Conduktor costs $50-60K/year. Most teams just need to browse topics, check consumer lag, and peek at messages. kpanel is a local app that runs on your machine and connects directly to your Kafka cluster using your existing credentials — no SaaS, no subscription, no data leaving your machine.

Works with **any** Kafka cluster. AWS MSK clusters get bonus features: auto-discovery, IAM authentication, and CloudWatch metrics.

## Features

- **Any Kafka** — works with self-hosted Kafka, Confluent Cloud, Aiven, Redpanda, AWS MSK, or any Kafka-compatible broker
- **MSK auto-discovery** — list your MSK clusters from AWS without copy-pasting broker URLs
- **IAM auth** — MSK IAM authentication via your existing AWS credentials (no signer library required)
- **Consumer group lag** — per-partition lag for every consumer group
- **Message peek** — inspect the last N messages from any topic
- **Broker health** — partition status, ISR, replication
- **CloudWatch metrics** — throughput, lag, and broker health charts (MSK connections only)
- **⌘K search** — quickly jump to any topic or consumer group
- **Single binary** — ships as a self-contained binary with embedded frontend

## Architecture

```
React + shadcn/ui  ←──API──→  Go HTTP server
(Bun native bundler)          (franz-go + chi)
```

In production: single Go binary with embedded frontend via `go:embed`. No Node, no JVM, no runtime dependencies.

## Prerequisites

**To run the binary:**
- Nothing — it's a static binary

**For development:**
- [Go 1.22+](https://go.dev/dl/)
- [Bun](https://bun.sh)

**To connect to Kafka:**
- A Kafka cluster (local, Confluent, MSK, etc.)
- For MSK: AWS credentials configured (`aws configure` or environment variables)

## Quick Start — Development

```bash
# Clone the repo
git clone https://github.com/your-org/kpanel.git
cd kpanel

# First-time setup: download Go modules + install JS deps
make setup

# Start both servers
make dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The Go API server runs on [http://localhost:8080](http://localhost:8080). The Bun dev server proxies `/api` requests to it automatically.

## Quick Start — Production Binary

```bash
# Download from releases page
curl -L https://github.com/your-org/kpanel/releases/latest/download/kpanel-darwin-arm64 -o kpanel
chmod +x kpanel

# Run it
./kpanel

# Open browser
open http://localhost:8080
```

## Build from Source

```bash
# Full production build → ./dist/kpanel
make build

# Cross-compile
make build-linux   # Linux amd64
make build-darwin  # macOS arm64
```

## Configuration

Add connections via the UI:
1. Click **Add Connection** and enter broker addresses (e.g. `localhost:9092`)
2. Choose auth type: none, SASL/PLAIN, SASL/SCRAM, or AWS IAM
3. For MSK: click **Discover MSK Clusters** to auto-import from your AWS account

Connections are stored in `~/.kpanel/connections.json`.

**Environment variables:**
| Variable | Default | Description |
|---|---|---|
| `KPANEL_PORT` | `8080` | HTTP port |
| `KPANEL_CONFIG_DIR` | `~/.kpanel` | Config directory |
| `AWS_REGION` | — | Default region for MSK discovery |
| `AWS_PROFILE` | — | AWS profile to use |

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Go 1.22+ with `go-chi/chi` |
| Kafka client | `franz-go` + `kadm` (no JVM, no native addons) |
| MSK IAM auth | Built into franz-go (`pkg/sasl/aws`) |
| AWS SDK | `aws-sdk-go-v2` (MSK discovery + CloudWatch) |
| Frontend | React 18 + TypeScript + Tailwind CSS v4 |
| UI components | shadcn/ui |
| Charts | recharts |
| Bundler | Bun native (`Bun.build()` + `bun-plugin-tailwind`) |
| Dev server | Bun native (`Bun.serve()` with HMR) |

## Screenshot

_Coming soon._

---

## License

MIT — see [LICENSE](./LICENSE).
