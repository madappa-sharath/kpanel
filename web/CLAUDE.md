# kpanel web — Frontend Context

## Stack
- **Runtime/tooling:** Bun (package manager, dev server, bundler) — no Node, no npm
- **Framework:** React 18 + TypeScript (strict)
- **UI:** shadcn/ui (zinc palette) + Tailwind CSS v4
- **Routing:** TanStack Router v1 (code-based, no file codegen)
- **Data fetching:** TanStack Query v5
- **State:** Zustand v5 (persisted via localStorage)
- **Charts:** recharts

## Commands
```bash
bun install          # install deps
bun dev.ts           # dev server on :3000 (HMR + /api proxy → :8080)
bun build.ts         # production build → dist/
bun run typecheck    # tsc --noEmit
```

`make dev` from the repo root runs both Go server (:8080) and this dev server (:3000) in parallel.

## Bundler notes
- **No Vite, no PostCSS, no tailwind.config.ts** — Bun handles everything natively
- Dev: `Bun.serve()` with `bun-plugin-tailwind`, configured in `bunfig.toml`
- Prod: `Bun.build()` JS API in `build.ts` (CLI doesn't support plugins yet)
- Path alias `@/*` → `src/*` defined in `tsconfig.json` — Bun reads this automatically, do NOT add `alias` to `Bun.build()` (it's not a valid `BuildConfig` property)

## Tailwind v4
- Single `@import "tailwindcss"` in `src/index.css` — no `@tailwind` directives
- Dark mode via `@custom-variant dark (&:is(.dark *))` — toggled by `.dark` class on `<html>`
- `@theme inline` block maps CSS vars to Tailwind color tokens (e.g. `--color-background: var(--background)`)
- shadcn zinc light/dark vars defined on `:root` and `.dark` in `src/index.css`

## Directory layout
```
src/
├── main.tsx              — ReactDOM.render, theme init (applies .dark class)
├── App.tsx               — empty, router handles everything
├── index.css             — Tailwind import + shadcn CSS vars + @theme inline
├── router.ts             — full TanStack Router route tree
├── types/                — cluster.ts, topic.ts, consumer.ts
├── lib/
│   ├── api.ts            — typed fetch wrappers for all API endpoints
│   ├── queryKeys.ts      — TanStack Query key factory
│   └── utils.ts          — cn() (clsx + twMerge), formatNumber, slugify
├── stores/
│   └── appStore.ts       — zustand: activeClusterId, sidebarCollapsed, theme
├── hooks/                — useCluster, useTopics, useConsumerGroups, useClusterConnection
├── components/
│   ├── ui/               — shadcn/ui primitives (never edit directly)
│   ├── shell/            — AppShell, Sidebar, Header (theme toggle), ClusterSwitcher
│   ├── shared/           — DataTable, StatusBadge, PageHeader, EmptyState, ConfirmModal, ErrorBoundary
│   ├── clusters/         — ClusterForm (3-step wizard), AWSAuthAlert
│   ├── topics/           — TopicTable, CreateTopicModal, MessageBrowser
│   └── consumer-groups/  — GroupTable, LagChart, ResetOffsetsModal
└── routes/
    ├── welcome.tsx
    ├── settings/index.tsx
    └── clusters/$clusterId/
        ├── __layout.tsx           — injects AWSAuthAlert for AWS clusters
        ├── index.tsx              — Dashboard (stat cards, partition health, config table)
        ├── brokers/index.tsx, $brokerId.tsx
        ├── topics/index.tsx
        ├── topics/$topicName/__layout.tsx   — tab bar (Overview/Partitions/Configuration/Messages)
        ├── topics/$topicName/index.tsx, partitions.tsx, config.tsx, messages.tsx
        ├── consumer-groups/index.tsx
        ├── consumer-groups/$groupId/__layout.tsx  — tab bar (Members/Offsets/Lag)
        ├── consumer-groups/$groupId/members.tsx, offsets.tsx, lag.tsx
        ├── schemas/index.tsx, $schemaId/__layout.tsx, $schemaId/index.tsx
        └── acls/index.tsx
```

## TanStack Router conventions
- Code-based routing — route tree defined in `router.ts`, no file codegen
- Always use `to="/path/$param"` + `params={{ ... }}` — never template literals in `to`
- Pathless layout route `id: 'shell'` wraps all cluster routes (provides AppShell)
- **Reactive location:** use `useRouterState({ select: s => s.location.pathname })` to get the current pathname reactively. Do NOT use `useRouter().state.location.pathname` — `useRouter()` does not subscribe to navigation and will give stale values.

## UI conventions

### Never use
- Inline `style={{ ... }}` with arbitrary values — use Tailwind classes
- Custom CSS variables like `--k-*` — these no longer exist
- Raw `<button>` or `<a>` for interactive elements — use shadcn `Button` / `Link`

### Color tokens
```tsx
bg-background / text-foreground      // page chrome
bg-card                              // panels, bordered sections
text-muted-foreground                // labels, secondary text
border-border                        // all borders
text-destructive                     // errors
text-amber-600 dark:text-amber-400   // warnings
text-green-600 dark:text-green-400   // success / connected
font-mono text-xs                    // code, IDs, Kafka keys only
```

### Status badges
Use `StatusBadge` from `components/shared/StatusBadge` for ok/warn/error/neutral/msk.
For one-off badges use shadcn `Badge variant="outline"` with explicit color classes:
```tsx
// warning
<Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
// ok
<Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950 dark:text-green-400">
// error
<Badge variant="destructive">
```

### Tab bars (layout routes)
```tsx
import { useRouterState } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const pathname = useRouterState({ select: (s) => s.location.pathname })
const activeTab = pathname.endsWith('/config') ? 'config' : 'overview'

<Tabs value={activeTab}>
  <TabsList>
    <TabsTrigger value="overview" asChild>
      <Link to="..." params={...} activeOptions={{ exact: true }}>Overview</Link>
    </TabsTrigger>
  </TabsList>
</Tabs>
<Outlet />
```

### Adding shadcn components
```bash
bunx shadcn@latest add <component-name>
```
This adds to `src/components/ui/` and installs any required Radix UI packages automatically.

## Theme system
- `appStore.theme`: `'light' | 'dark' | 'system'` — persisted to localStorage
- `main.tsx` applies `.dark` to `document.documentElement` and subscribes to both store changes and `prefers-color-scheme` media query
- Header has a theme toggle button cycling light → dark → system
- Brand color: amber `k` logo square (`bg-amber-500`) — preserved across all themes
