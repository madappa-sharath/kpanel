---
title: Building from source
seoTitle: Build kpanel from source
description: Build the kpanel Kafka GUI from source with Go, Bun and Socket Firewall, run the development environment with a local Kafka broker, and cross-compile for Linux and macOS.
---

## Requirements

- [Go](https://go.dev/dl/) 1.22 or later
- [Bun](https://bun.sh)
- [Socket Firewall](https://docs.socket.dev/docs/socket-firewall-free) (`sfw`)
- Docker, for the local Kafka broker used by `make dev`

## Build

```bash
npm i -g sfw      # or install the sfw binary another way
git clone https://github.com/madappa-sharath/kpanel.git
cd kpanel
make setup        # go mod tidy + sfw bun install
make build        # production build → ./dist/kpanel
```

`make build` builds the React frontend with Bun, copies it into `server/cmd/kpanel/public/`, and builds the Go binary with the frontend embedded. The result is one file, `dist/kpanel`.

Cross-compile:

```bash
make build-linux  # Linux amd64 → dist/kpanel-linux-amd64
make build-darwin # macOS arm64 → dist/kpanel-darwin-arm64
```

## Development

```bash
make dev          # local Kafka + seed data, Go on :8080, web dev server on :3000
make dev-server   # local Kafka + seed data + Go API only
make dev-web      # web dev server only; proxies /api to :8080
```

In development, open `http://localhost:3000`. The Bun dev server proxies `/api` to the Go server on `:8080`.

`make dev` and `make dev-server` start a local Kafka broker in Docker and seed it with topics, messages and consumer groups if it is empty. The broker has two listeners:

- `localhost:9092`: no authentication
- `localhost:9094`: SASL, with users `admin` / `admin-secret` and `alice` / `alice-secret`

## Tests

```bash
make test                # Go unit tests
make test-integration    # integration tests against Kafka in testcontainers
```

## Socket Firewall

The Makefile runs Bun installs through `sfw`. Socket Firewall Free officially supports npm, yarn, pnpm, pip, uv and cargo. For Bun it runs as an install-time proxy, as an extra layer. `web/bunfig.toml` also blocks packages published in the last 3 days and skips install scripts.

To bypass the firewall in an emergency, set `SFW` to empty: `make SFW= setup`.
