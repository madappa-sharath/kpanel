import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, OctagonAlert, PauseCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn, formatNumber } from '../../lib/utils'
import { useLagHistory } from '../../hooks/useConsumerGroups'
import type { LagSnapshot } from '../../types/consumer'
import { LagChart } from './LagChart'
import { ThroughputChart } from './ThroughputChart'
import {
  chartRows,
  computeStats,
  diagnose,
  fmtCount,
  fmtDuration,
  fmtRate,
  type Diagnosis,
  type RateStats,
  type WindowStats,
} from './lagStats'
import { fmtTime } from './sessionChart'

const WINDOWS = { '15m': 15 * 60_000, '1h': 60 * 60_000, '6h': 6 * 60 * 60_000 } as const
type WindowKey = keyof typeof WINDOWS

interface SessionHistoryProps {
  clusterId: string
  groupId: string
}

export function SessionHistory({ clusterId, groupId }: SessionHistoryProps) {
  const { data, isLoading, error, dataUpdatedAt } = useLagHistory(clusterId, groupId)
  const [windowKey, setWindowKey] = useState<WindowKey>('1h')
  const windowMs = WINDOWS[windowKey]
  const snapshots = data?.snapshots

  const stats = useMemo(() => (snapshots ? computeStats(snapshots, windowMs) : null), [snapshots, windowMs])

  const lastTs = snapshots?.length ? snapshots[snapshots.length - 1].ts : null
  const staleMs = data && lastTs !== null ? dataUpdatedAt - lastTs : 0
  const stale = !!data && staleMs > 3 * data.interval_ms

  let body: ReactNode
  if (isLoading) {
    body = <Placeholder>Loading lag history…</Placeholder>
  } else if (error) {
    body = <Placeholder className="text-destructive">{(error as Error).message}</Placeholder>
  } else if (!snapshots?.length) {
    body = <Placeholder>{data?.last_error ? `Sampling failed: ${data.last_error}` : 'Taking the first sample…'}</Placeholder>
  } else {
    body = (
      <div className="flex min-w-0 flex-col gap-4">
        {stale ? (
          <DiagnosisBanner
            diagnosis={{
              tone: 'bad',
              title: `No sample for ${fmtDuration(staleMs / 1000)} — showing history up to ${fmtTime(lastTs!)}`,
              detail: data?.last_error ? `Last error: ${data.last_error}` : undefined,
            }}
          />
        ) : stats ? (
          <>
            <DiagnosisBanner diagnosis={diagnose(stats)} />
            <StatTiles stats={stats} windowKey={windowKey} intervalMs={data!.interval_ms} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {snapshots.length < 3
              ? 'Taking a baseline — rates appear after the next sample.'
              : 'No rates — the group has no committed or assigned partitions to compare.'}
          </p>
        )}
        <SessionCharts snapshots={snapshots} windowMs={windowMs} intervalMs={data!.interval_ms} />
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Live Session</span>
          {data && (
            <span>
              {' '}· sampled every {data.interval_ms / 1000} s by the server since {fmtTime(data.sampling_since)} · keeps
              going for {fmtDuration(data.watch_ttl_ms / 1000)} after you leave
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={k === windowKey ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setWindowKey(k)}
            >
              {k}
            </Button>
          ))}
        </div>
      </div>
      {data?.last_error && !!snapshots?.length && !stale && (
        <p className="mb-2 text-xs text-destructive">Last sample failed: {data.last_error}</p>
      )}
      <div className="min-w-0 rounded-md border bg-card p-4">{body}</div>
    </div>
  )
}

const TONES: Record<Diagnosis['tone'], { className: string; icon: ReactNode }> = {
  ok: {
    className: 'border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
    icon: <CheckCircle2 className="size-4 shrink-0" />,
  },
  warn: {
    className: 'border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    icon: <AlertTriangle className="size-4 shrink-0" />,
  },
  bad: {
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: <OctagonAlert className="size-4 shrink-0" />,
  },
  idle: {
    className: 'border-border bg-muted/50 text-muted-foreground',
    icon: <PauseCircle className="size-4 shrink-0" />,
  },
}

function DiagnosisBanner({ diagnosis }: { diagnosis: Diagnosis }) {
  const tone = TONES[diagnosis.tone]
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2', tone.className)}>
      <span className="mt-0.5">{tone.icon}</span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{diagnosis.title}</p>
        {diagnosis.detail && <p className="text-xs opacity-90">{diagnosis.detail}</p>}
      </div>
    </div>
  )
}

function StatTiles({ stats, windowKey, intervalMs }: { stats: WindowStats; windowKey: WindowKey; intervalMs: number }) {
  const net = stats.processing.now - stats.incoming.now
  const { lag, commits } = stats
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RateTile label="Incoming" dotClassName="bg-amber-500" rate={stats.incoming} windowKey={windowKey} />
      <RateTile label="Processed" dotClassName="bg-emerald-500" rate={stats.processing} windowKey={windowKey} />
      <Tile
        label="Lag"
        dotClassName="bg-red-500"
        value={formatNumber(lag.now)}
        suffix={lag.now > 0 && net > 0 ? `clears in ~${fmtDuration(lag.now / net)}` : undefined}
      >
        <Cell label={`Δ ${windowKey}`} value={`${lag.delta > 0 ? '+' : lag.delta < 0 ? '−' : ''}${fmtCount(Math.abs(lag.delta))}`} />
        <Cell label={`peak ${windowKey}`} value={fmtCount(lag.peak)} />
        <Cell label="net" value={`${net >= 0 ? '+' : '−'}${fmtRate(Math.abs(net))}`} />
      </Tile>
      <Tile
        label="Commits"
        value={commits?.msgsPerCommit != null ? fmtCount(commits.msgsPerCommit, 1) : '—'}
        suffix="msgs / commit"
        hint={`Partition commits seen per ${intervalMs / 1000} s sample. Commits more frequent than that are counted once, so msgs/commit is an upper bound.`}
      >
        <Cell label="commits/min" value={commits ? fmtCount(commits.perMinute, 1) : '—'} />
        <Cell label="capacity p95" value={stats.capacity ? fmtRate(stats.capacity) : '—'} />
      </Tile>
    </div>
  )
}

function RateTile({ label, dotClassName, rate, windowKey }: { label: string; dotClassName: string; rate: RateStats; windowKey: WindowKey }) {
  return (
    <Tile label={label} dotClassName={dotClassName} value={fmtRate(rate.now)} suffix="last 30 s">
      <Cell label={`avg ${windowKey}`} value={fmtRate(rate.avg)} />
      <Cell label="p95" value={fmtRate(rate.p95)} />
      <Cell label="peak" value={fmtRate(rate.peak)} />
    </Tile>
  )
}

interface TileProps {
  label: string
  value: string
  suffix?: string
  dotClassName?: string
  hint?: string
  children: ReactNode
}

function Tile({ label, value, suffix, dotClassName, hint, children }: TileProps) {
  return (
    <div className="min-w-0 rounded-md border px-3 py-2.5" title={hint}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dotClassName && <span className={cn('size-2 rounded-full', dotClassName)} />}
        {label}
      </p>
      <p className="mt-0.5 truncate">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {suffix && <span className="ml-1.5 text-xs text-muted-foreground">{suffix}</span>}
      </p>
      <div className="mt-1.5 flex gap-4">{children}</div>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-xs tabular-nums">{value}</p>
    </div>
  )
}

function SessionCharts({ snapshots, windowMs, intervalMs }: { snapshots: LagSnapshot[]; windowMs: number; intervalMs: number }) {
  const { rows, gaps, topics } = useMemo(() => {
    const last = snapshots[snapshots.length - 1]
    let visible = snapshots.filter((s) => s.ts > last.ts - windowMs)
    // Start where rates start, so both charts begin together.
    const firstRated = visible.findIndex((s) => s.produce_rate !== null)
    if (firstRated > 0) visible = visible.slice(firstRated)
    const topicSet = new Set<string>()
    for (const s of visible) for (const t of Object.keys(s.by_topic)) topicSet.add(t)
    const topics = Array.from(topicSet).sort()
    return { ...chartRows(visible, topics, intervalMs), topics }
  }, [snapshots, windowMs, intervalMs])

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-1 text-xs text-muted-foreground">Lag — messages</p>
        <LagChart rows={rows} topics={topics} gaps={gaps} />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs text-muted-foreground">Throughput — messages/s, 15 s average</p>
        <ThroughputChart rows={rows} gaps={gaps} />
      </div>
    </div>
  )
}

function Placeholder({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-48 items-center justify-center text-sm text-muted-foreground', className)}>{children}</div>
}
