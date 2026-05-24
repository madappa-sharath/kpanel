# kpanel — Claude Code Context

## Project Overview

kpanel is a lightweight Kafka GUI — a local alternative to Conduktor ($50-60K/yr). It works with **any Kafka cluster** — self-hosted, Confluent Cloud, Aiven, Redpanda, AWS MSK, or any Kafka-compatible broker. Just point it at brokers.

AWS MSK is a first-class integration: auto-discovery of clusters via the AWS SDK, IAM authentication, and CloudWatch metrics dashboards. These features activate automatically when AWS credentials are available. The core API is provider-agnostic.

Users run kpanel on their local machine. Auth to Kafka uses existing credentials (AWS IAM, SASL, or no auth). No SaaS, no subscription, no data leaving the machine.

**Philosophy:** Simple, focused, single-binary distribution. No over-engineering.

## Tech Stack

### Server (Go)
| Component | Technology |
|---|---|
| Runtime | Go 1.22+ |
| Kafka client | `github.com/twmb/franz-go` + `kadm` admin client |
| SASL auth | franz-go built-in: PLAIN, SCRAM, AWS IAM (`pkg/sasl/aws`) |
| MSK discovery | `aws-sdk-go-v2/service/kafka` |
| CloudWatch | `aws-sdk-go-v2/service/cloudwatch` |
| HTTP router | `go-chi/chi` (stdlib-compatible, lightweight) |
| Frontend embed | `go:embed` (single binary in production) |

### Frontend (Bun + React)
| Component | Technology |
|---|---|
| Runtime/tooling | Bun (package manager, dev server, bundler) |
| Framework | React 18 + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Charts | recharts (shadcn-compatible) |
| Dev server | `Bun.serve()` with HMR — proxies `/api` → Go server |
| Bundler | `Bun.build()` JS API + `bun-plugin-tailwind` |

No Vite, no webpack, no PostCSS config. Bun handles everything natively.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────────┐
│  React + shadcn/ui      │◄──API──►│  Go HTTP server (single binary)      │
│  Bun native bundler     │         │                                      │
│  HMR via Bun.serve()    │         │  ├─ franz-go + kadm (Kafka admin)    │
│  localhost:3000 (dev)   │         │  ├─ pkg/sasl/aws (MSK IAM auth)      │
│                         │         │  ├─ aws-sdk-go-v2 (MSK discovery+CW) │
│                         │         │  └─ net/http + chi router             │
└─────────────────────────┘         └──────────────────────────────────────┘
```

In production, the Go binary embeds the built React assets via `go:embed` and serves everything — single binary, zero runtime dependencies.

### Layout

```
kpanel/
├── Makefile
├── server/                      — Go API server
│   ├── go.mod
│   ├── cmd/kpanel/
│   │   ├── main.go              — entry point, go:embed public/
│   │   └── public/              — built frontend assets (copied by make build)
│   └── internal/
│       ├── api/                 — chi router + handlers
│       ├── connections/         — connection store (JSON file)
│       ├── kafka/               — franz-go client factory
│       └── msk/                 — MSK discovery via aws-sdk-go-v2
└── web/                         — React frontend
    ├── dev.ts                   — Bun.serve() dev server (HMR + /api proxy)
    ├── build.ts                 — Bun.build() production build script
    ├── bunfig.toml              — registers bun-plugin-tailwind for Bun.serve()
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── App.tsx
        ├── main.tsx
        └── index.css            — @import "tailwindcss"
```

## Key Design Decisions

### Provider-agnostic core, MSK-enhanced
- Core API uses **connection IDs** (user-defined slugs), not AWS ARNs
- A "connection" is a named set of brokers + auth config
- Connections can be manually configured (any Kafka) or auto-discovered (MSK)
- MSK features (discovery, CloudWatch, IAM auth) activate only when AWS credentials are present
- The UI shows an "MSK" badge on auto-discovered connections and surfaces an extra Metrics tab

### Why franz-go (not KafkaJS)?
- KafkaJS hangs on Bun's net/tls sockets (open bug: oven-sh/bun#6571) and is unmaintained since Feb 2023
- Confluent's kafka-javascript throws NODE_MODULE_VERSION mismatch on Bun (native addons)
- franz-go has built-in `AWS_MSK_IAM` SASL mechanism — no separate signer library needed
- franz-go's `kadm` package provides a complete admin API with structured types
- franz-go is actively maintained and production-proven at scale

### Why Go for the server?
- franz-go is the best Kafka client in any language outside Java
- `go build` produces a single static binary with embedded frontend (`go:embed`)
- Excellent AWS SDK support
- Cross-compilation to Linux/macOS is trivial

### Why Bun's native bundler (not Vite)?
- As of Bun 1.3, `Bun.serve()` has a full-stack dev server with native HMR and React Fast Refresh
- `bun-plugin-tailwind` provides first-class Tailwind v4 integration
- Zero config files — no `vite.config.ts`, no `postcss.config.js`, no `tailwind.config.ts`
- `bun build` CLI doesn't support plugins yet, so production builds use `Bun.build()` JS API in `build.ts`
- `bunfig.toml` wires `bun-plugin-tailwind` into `Bun.serve()` for the dev server

### Why Tailwind v4 (not v3)?
- CSS-first: single `@import "tailwindcss"` replaces three `@tailwind` directives
- No `tailwind.config.ts` or `postcss.config.js` needed for basic use
- `bun-plugin-tailwind` integrates natively — no PostCSS pipeline required
- Automatic content detection via Oxide (Rust-based scanner)

## Frontend Dev Server (`web/dev.ts`)

```typescript
import homepage from "./index.html";

Bun.serve({
  port: 3000,
  routes: { "/": homepage },           // Bun bundles + serves with HMR
  development: { hmr: true, console: true },
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api")) {
      return fetch("http://localhost:8080" + url.pathname + url.search, {
        method: req.method, headers: req.headers,
        body: req.method !== "GET" ? req.body : undefined,
      });
    }
    return new Response(Bun.file("./index.html")); // SPA fallback
  },
});
```

## Connection Model

```go
type Connection struct {
    ID      string       // user-defined or auto-generated slug
    Name    string       // display name
    Brokers []string     // bootstrap broker addresses
    Auth    AuthConfig   // SASL config
    Source  string       // "manual" | "msk-discovery"
    MSK     *MSKMetadata // nil for non-MSK connections
}

type MSKMetadata struct {
    ClusterArn string
    Region     string
    // enables CloudWatch metrics, IAM auth refresh
}

type AuthConfig struct {
    Type        string // "none" | "sasl-plain" | "sasl-scram-256" | "sasl-scram-512" | "sasl-ssl" | "aws-iam"
    Username    string
    Password    string
    TLSEnabled  bool
    TLSCaFile   string
    TLSCertFile string
    TLSKeyFile  string
    AWSRegion   string // for aws-iam
}
```

## API Endpoints

### Connections (provider-agnostic)
| Method | Path | Description |
|---|---|---|
| GET | `/api/connections` | List all configured connections |
| POST | `/api/connections` | Add a manual connection |
| DELETE | `/api/connections/:id` | Remove a connection |
| GET | `/api/connections/:id/status` | Connectivity check |

### Kafka operations (any connection)
| Method | Path | Description |
|---|---|---|
| GET | `/api/connections/:id/topics` | List topics |
| GET | `/api/connections/:id/topics/:name` | Topic detail (partitions, replicas, ISR, configs) |
| GET | `/api/connections/:id/groups` | List consumer groups |
| GET | `/api/connections/:id/groups/:name` | Group detail with per-partition lag |
| POST | `/api/connections/:id/topics/:name/peek` | Peek last N messages |
| GET | `/api/connections/:id/brokers` | List brokers with metadata |

### MSK-specific (AWS credentials required)
| Method | Path | Description |
|---|---|---|
| GET | `/api/msk/clusters` | Auto-discover MSK clusters |
| POST | `/api/msk/clusters/:arn/import` | Import MSK cluster as a connection |
| GET | `/api/connections/:id/metrics` | CloudWatch metrics (MSK connections only) |

## IAM Auth Pattern (franz-go)

```go
import (
    "github.com/twmb/franz-go/pkg/kgo"
    "github.com/twmb/franz-go/pkg/kadm"
    kaws "github.com/twmb/franz-go/pkg/sasl/aws"
    "github.com/aws/aws-sdk-go-v2/config"
)

func newMSKAdminClient(ctx context.Context, brokers []string, region string) (*kadm.Client, error) {
    awsCfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
    if err != nil {
        return nil, err
    }
    creds := awsCfg.Credentials

    client, err := kgo.NewClient(
        kgo.SeedBrokers(brokers...),
        kgo.SASL(kaws.ManagedStreamingIAM(func(ctx context.Context) (kaws.Auth, error) {
            v, err := creds.Retrieve(ctx)
            if err != nil {
                return kaws.Auth{}, err
            }
            return kaws.Auth{
                AccessKey:    v.AccessKeyID,
                SecretKey:    v.SecretAccessKey,
                SessionToken: v.SessionToken,
            }, nil
        })),
        kgo.DialTLS(),
    )
    if err != nil {
        return nil, err
    }
    return kadm.NewClient(client), nil
}
```

## CloudWatch Metrics (MSK connections only)

Namespace: `AWS/Kafka`

| Category | Metrics |
|---|---|
| Cluster health | `ActiveControllerCount`, `OfflinePartitionsCount`, `UnderReplicatedPartitions` |
| Throughput | `BytesInPerSec`, `BytesOutPerSec`, `MessagesInPerSec` |
| Consumer lag | `EstimatedMaxTimeLag`, `SumOffsetLag` |
| Broker resources | `CpuUser`, `KafkaDataLogsDiskUsed`, `MemoryUsed` |

## UI System

The frontend uses **stock shadcn/ui** with the zinc color palette and full light/dark theme support. There is no custom CSS design system — no `--k-*` variables, no hand-rolled utility classes.

### Theme
- Light/dark toggle persisted in zustand (`appStore.theme: 'light' | 'dark' | 'system'`)
- `main.tsx` applies/removes `.dark` on `<html>` and listens to `prefers-color-scheme` for system mode
- Tailwind v4 dark mode: `@custom-variant dark (&:is(.dark *))` in `index.css`

### Color conventions
```tsx
// Layout / surfaces
className="bg-background text-foreground"   // page
className="bg-card"                         // panels, cards
className="border-border"                   // all borders

// Typography
className="text-foreground"                 // primary text
className="text-muted-foreground"           // secondary / labels
className="font-mono text-xs"              // code, IDs, keys only

// Semantic colors (used directly, not via StatusBadge for one-off cases)
className="text-destructive"               // errors
className="text-amber-600 dark:text-amber-400"   // warnings
className="text-green-600 dark:text-green-400"   // ok / connected
```

### Installed shadcn/ui components (`web/src/components/ui/`)
`button` `badge` `table` `tabs` `card` `input` `separator` `skeleton` `alert` `dialog` `dropdown-menu` `select`

Add new ones with: `bunx shadcn@latest add <component>`

### Shared components (`web/src/components/shared/`)
| Component | Purpose |
|---|---|
| `DataTable` | Generic table wrapper using shadcn Table primitives |
| `StatusBadge` | `ok` / `warn` / `error` / `neutral` / `msk` variants using Badge |
| `PageHeader` | Page title + description |
| `EmptyState` | Icon + title + description placeholder |
| `ConfirmModal` | Destructive action confirmation using shadcn Dialog |
| `ErrorBoundary` | React class error boundary with Tailwind fallback UI |

### Tab navigation pattern
Layout routes use shadcn `Tabs` + `TabsTrigger asChild` + TanStack Router `Link`. Active tab is derived from `useRouterState({ select: s => s.location.pathname })` — **not** `useRouter()` (which is not reactive to navigation).

```tsx
const pathname = useRouterState({ select: (s) => s.location.pathname })
const activeTab = pathname.endsWith('/partitions') ? 'partitions' : 'overview'

<Tabs value={activeTab}>
  <TabsList>
    <TabsTrigger value="overview" asChild>
      <Link to="..." params={...}>Overview</Link>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

## Commands

Dependency installs are routed through Socket Firewall (`sfw`) from the root Makefile. Socket Firewall Free officially supports npm/yarn/pnpm, pip/uv, and cargo; Bun is wrapped as an install-time proxy for defense-in-depth and paired with Bun's `minimumReleaseAge`/`ignoreScripts` hardening in `web/bunfig.toml`. Use `make SFW= setup` or `make SFW= build` only when intentionally bypassing the firewall.

```bash
make setup        # first-time: go mod tidy + sfw bun install
make dev          # Kafka + seed data, Go server (:8080) + Bun dev server (:3000)
make dev-server   # Kafka + seed data + Go API only; does not start Bun
make dev-web      # Bun dev server only; proxies /api to Go
make kafka-up     # one local broker: PLAINTEXT :9092, SASL_PLAINTEXT :9094
make kafka-seed   # seed topics, messages, and consumer group offsets
make build        # production build → ./dist/kpanel
make build-linux  # cross-compile for Linux amd64
make build-darwin # cross-compile for macOS arm64
make clean        # remove build artifacts
```

## Commit Messages

Use Conventional Commit-style prefixes with a scope: `fix(scope): ...`, `feat(scope): ...`, or `chore(scope): ...`. Keep the summary short, imperative, and lowercase after the prefix unless it names a proper noun.

## Configuration

Connections stored in `~/.kpanel/connections.json` by default.

Environment variables:
- `KPANEL_PORT` — HTTP port (default: `8080`)
- `KPANEL_CONFIG_DIR` — config directory (default: `~/.kpanel`)
- `AWS_REGION` — default region for MSK discovery
- `AWS_PROFILE` — AWS profile for MSK/CloudWatch access
- Standard AWS env vars (`AWS_ACCESS_KEY_ID`, etc.) work as expected

## Conventions

- Go code: standard project layout, `internal/` for non-exported packages
- Go errors: wrap with `fmt.Errorf("context: %w", err)`
- API responses: JSON, errors use `{"error": "message"}` format
- Connection IDs: URL-safe slugs (lowercase alphanumeric + hyphens)
- Frontend: TypeScript strict mode, shadcn/ui conventions
- Frontend: avoid `useEffect` for derived state, state-to-state sync, or user interaction logic — see `web/CLAUDE.md` for detailed guidelines
- No over-engineering: build features incrementally
