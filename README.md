# kpanel

A Kafka GUI built for AWS MSK. It runs on your workstation and authenticates via IAM using your own AWS credentials — `aws sso login` and you're in. Works with any Kafka cluster too, but MSK with IAM auth is what it was designed for.

![Status](https://img.shields.io/badge/status-under%20development-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

Most Kafka GUIs run as a shared service: one deployment, one set of Kafka credentials, everyone logs into the same web UI. That model breaks down with MSK and IAM — you can't hand a central service your personal IAM credentials, and vending a shared service account means everyone gets the same access level.

kpanel runs locally instead. It reads your AWS credentials directly from the standard SDK chain (SSO, environment variables, `~/.aws/credentials`, instance profile) and authenticates to MSK as you. Each person on the team runs their own instance with their own IAM identity. Auto-discovery, IAM auth, and CloudWatch metrics all work out of the box.

The binary embeds the React frontend, so there's nothing to install separately. Run it, open a browser, add a connection.

**What you can do:**

- Browse topics — partition layout, replication state, ISR status, configs
- Inspect messages — peek the last N messages from any topic with offset display
- Consumer group lag — per-partition lag across every group
- Broker metadata — partition assignments, leader/follower status
- Cluster overview — active controller, under-replicated partitions, key configs
- MSK auto-discovery — list clusters from your AWS account without copy-pasting broker URLs
- CloudWatch metrics — throughput, lag, and broker resource charts for MSK connections

## How it works

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

The server listens on localhost. It reads your existing credentials directly — no credential sharing between teammates, no token vending machines, no IAM gymnastics to give a central service access to your clusters.

## AWS MSK

If you have AWS credentials configured, kpanel will automatically surface MSK features.

**Discovery.** The UI has a "Discover MSK Clusters" button that calls the AWS Kafka API, lists your clusters, and imports their broker endpoints. No broker URLs to look up manually.

**IAM auth.** MSK connections authenticate via `AWS_MSK_IAM` SASL, implemented natively in franz-go. Credentials — SSO, instance profile, environment variables — are resolved by the standard AWS SDK chain and refreshed automatically.

**Metrics.** MSK connections get a Metrics tab with CloudWatch charts: bytes in/out, messages per second, consumer lag, CPU, disk, memory. Same credentials, no extra config.

If no AWS credentials are present, these features are simply hidden. The core Kafka functionality works without them.

## Quick Start

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/madappa-sharath/kpanel/main/scripts/install.sh | sh
```

Installs to `~/.local/bin/kpanel`. No sudo required.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/madappa-sharath/kpanel/main/scripts/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\kpanel\kpanel.exe` and adds it to your user PATH. No admin rights required.

**Or download directly:**

```bash
# macOS (Apple Silicon)
curl -fLO https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_darwin_arm64.tar.gz
tar xzf kpanel_darwin_arm64.tar.gz && ./kpanel

# macOS (Intel)
curl -fLO https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_darwin_amd64.tar.gz
tar xzf kpanel_darwin_amd64.tar.gz && ./kpanel

# Linux (amd64)
curl -fLO https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_linux_amd64.tar.gz
tar xzf kpanel_linux_amd64.tar.gz && ./kpanel
```

```powershell
# Windows (PowerShell)
Invoke-WebRequest -Uri https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_windows_amd64.zip -OutFile kpanel.zip
Expand-Archive kpanel.zip -DestinationPath .; .\kpanel.exe
```

For MSK, log in first:

```bash
aws sso login   # or aws configure, or set AWS_PROFILE / AWS_ACCESS_KEY_ID
./kpanel
```

Then open `http://localhost:8080`. Add a manual connection (enter broker addresses) or click "Discover MSK Clusters" to import from your AWS account.

## Security

The install script writes only to `~/.local/bin` (or `$KPANEL_INSTALL_DIR`) and never uses sudo. Both scripts are in this repo — [`scripts/install.sh`](./scripts/install.sh) and [`scripts/install.ps1`](./scripts/install.ps1) — if you want to read them before running.

Every release includes a `checksums.txt` with SHA-256 hashes. The install script verifies the checksum before extracting. To verify manually:

```bash
VERSION=v0.1.0
curl -fLO https://github.com/madappa-sharath/kpanel/releases/download/$VERSION/checksums.txt
grep kpanel_darwin_arm64.tar.gz checksums.txt | sha256sum --check
```

kpanel makes no outbound connections except the ones you configure: directly to your Kafka brokers and optionally to AWS APIs. Connection configs are written to `~/.kpanel/connections.json`. Passwords and secret keys are stored in your OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager) via `go-keyring`, not in the JSON file.

## Build from Source

Requires [Go 1.22+](https://go.dev/dl/) and [Bun](https://bun.sh).

```bash
git clone https://github.com/madappa-sharath/kpanel.git
cd kpanel
make setup        # go mod tidy + bun install
make dev          # Go on :8080, React dev server on :3000 with HMR
make build        # production build → ./dist/kpanel
make build-linux  # cross-compile for Linux amd64
make build-darwin # cross-compile for macOS arm64
```

In development, open `http://localhost:3000`. The Bun dev server proxies `/api` to the Go server at `:8080`.

## Configuration

Connections are stored in `~/.kpanel/connections.json` and can be added via the UI or edited directly.

| Variable | Default | Description |
|---|---|---|
| `KPANEL_PORT` | `8080` | HTTP port |
| `KPANEL_CONFIG_DIR` | `~/.kpanel` | Config directory |
| `AWS_REGION` | — | Default region for MSK discovery |
| `AWS_PROFILE` | — | AWS profile to use |

Standard AWS environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) work as expected.

## Dependencies

**Server (Go):**

| Package | Role |
|---|---|
| `twmb/franz-go` | Kafka client — built-in `AWS_MSK_IAM` SASL, actively maintained |
| `twmb/franz-go/pkg/kadm` | Admin API — topic/group management, offset operations |
| `go-chi/chi/v5` | HTTP router |
| `aws/aws-sdk-go-v2` | MSK cluster discovery and CloudWatch metrics |
| `zalando/go-keyring` | OS keychain integration for credential storage |
| `testcontainers-go/modules/kafka` | Integration tests against a real Kafka container |

**Frontend (JS):**

| Package | Role |
|---|---|
| `react` + `react-dom` | UI framework |
| `@tanstack/react-router` | Type-safe SPA routing |
| `@tanstack/react-query` | Server state and caching |
| `zustand` | Client state (active cluster, sidebar, theme) |
| `@radix-ui/*` | Accessible UI primitives (via shadcn/ui) |
| `recharts` | CloudWatch metrics charts |
| `lucide-react` | Icons |
| `tailwindcss` | Styling |

Bun handles the dev server, bundler, and package management — no Vite, no webpack, no PostCSS config.

## License

MIT — see [LICENSE](./LICENSE).
