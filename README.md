# kpanel

> Lightweight Kafka GUI with first-class AWS MSK support

![Status](https://img.shields.io/badge/status-under%20development-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

**🚧 Under Development**

---

## Why?

Conduktor is expensive. Most teams just need to browse topics, check consumer lag, and peek at messages. kpanel is a local app that runs on your machine and connects directly to your Kafka cluster using your existing credentials — no SaaS, no subscription, no data leaving your machine.

Works with any Kafka cluster. AWS MSK clusters get bonus features: auto-discovery and CloudWatch metrics.

## Features

- **Any Kafka** — works with local, Confluent, self-managed, or AWS MSK
- **MSK auto-discovery** — list your MSK clusters from AWS without copy-pasting broker URLs
- **IAM auth** — MSK IAM authentication via your existing AWS credentials
- **Consumer group lag** — per-partition lag for every consumer group
- **Message peek** — inspect the last N messages from any topic
- **CloudWatch metrics** — throughput, lag, and broker health charts (MSK only)
- **⌘K search** — quickly jump to any topic or consumer group

## Tech Stack

- **Runtime:** Bun
- **Server:** Hono + confluent-kafka-javascript
- **Frontend:** React + Vite + shadcn/ui + Tailwind CSS
- **AWS:** `@aws-sdk/client-kafka` · `@aws-sdk/client-cloudwatch` · `aws-msk-iam-sasl-signer-js`

## Prerequisites

- [Bun](https://bun.sh) installed
- A Kafka cluster to connect to (local, Confluent, MSK, etc.)
- For MSK: AWS credentials configured (`aws configure` or environment variables) and IAM auth enabled on your cluster

## Quick Start

```bash
# Clone the repo
git clone https://github.com/your-org/kpanel.git
cd kpanel

# Install dependencies
bun install

# Start the app
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

The API server runs on [http://localhost:3000](http://localhost:3000).

## Screenshot

_Coming soon._

---

## License

MIT — see [LICENSE](./LICENSE).
