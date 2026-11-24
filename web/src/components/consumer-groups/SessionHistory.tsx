import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, OctagonAlert, PauseCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn, formatNumber } from '../../lib/utils'
import { useLagHistory } from '../../hooks/useConsumerGroups'
import type { LagSnapshot } from '../../types/consumer'
import { LagChart } from './LagChart'
import { ThroughputChart } from './ThroughputChart'
import {
  ARROWS,
  chartRows,
  computeStats,
  diagnose,
  evidence,
  fmtCount,
  fmtDuration,
  fmtEta,
  fmtRate,
  fmtWait,
  topicVerdicts,
  type TopicVerdict,
  type Diagnosis,
  type Fact,
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
  const verdicts = useMemo(() => (snapshots ? topicVerdicts(snapshots, windowMs) : []), [snapshots, windowMs])

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
          <StatusStrip
            diagnosis={{ tone: 'idle', state: 'No data', headline: `last sample ${fmtDuration(staleMs / 1000)} ago` }}
            facts={[
              { label: 'showing up to', value: fmtTime(lastTs!) },
              ...(data?.last_error ? [{ label: 'error', value: data.last_error, tone: 'warn' as const }] : []),
            ]}
          />
        ) : stats ? (
          <>
            <GroupStatus stats={stats} verdicts={verdicts} />
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
    className: 'text-green-700 dark:text-green-400',
    icon: <CheckCircle2 className="size-4 shrink-0" />,
  },
  warn: {
    className: 'text-amber-700 dark:text-amber-400',
    icon: <AlertTriangle className="size-4 shrink-0" />,
  },
  bad: {
    className: 'text-destructive',
    icon: <OctagonAlert className="size-4 shrink-0" />,
  },
  idle: {
    className: 'text-muted-foreground',
    icon: <PauseCircle className="size-4 shrink-0" />,
  },
}

const STRIP_TONES: Record<Diagnosis['tone'], string> = {
  ok: 'border-green-600/30 bg-green-50 dark:bg-green-950/60',
  warn: 'border-amber-600/30 bg-amber-50 dark:bg-amber-950/60',
  bad: 'border-destructive/30 bg-destructive/10',
  idle: 'border-border bg-muted/50',
}

type StatusStripProps = { diagnosis: Diagnosis } & ({ stats: WindowStats; facts?: never } | { facts: Fact[]; stats?: never })

function StatusStrip({ diagnosis, stats, facts }: StatusStripProps) {
  const tone = TONES[diagnosis.tone]
  const shown = facts ?? evidence(stats!, diagnosis)
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-3 py-2',
        STRIP_TONES[diagnosis.tone],
      )}
    >
      <div className={cn('flex items-baseline gap-2.5', tone.className)}>
        <span className="flex items-center gap-1.5 self-center text-xs font-semibold uppercase tracking-wider">
          {tone.icon}
          {diagnosis.state}
        </span>
        <span className="text-lg font-semibold tabular-nums">{diagnosis.headline}</span>
      </div>
      {shown.length > 0 && (
        <dl className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          {shown.map((f) => (
            <div key={f.label} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
              <dd className={cn('truncate font-mono text-xs tabular-nums', f.tone && TONES[f.tone].className)}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

// With several topics the strip leads with the worst one, unless they're all
// fine, and a table shows each topic's own verdict.
function GroupStatus({ stats, verdicts }: { stats: WindowStats; verdicts: TopicVerdict[] }) {
  const worst = verdicts[0]
  if (verdicts.length < 2 || !worst) return <StatusStrip diagnosis={diagnose(stats)} stats={stats} />
  const allFine = ['Caught up', 'Keeping up', 'Idle'].includes(worst.diagnosis.state)
  const flagged = verdicts.filter((v) => v.diagnosis.tone === 'bad' || v.diagnosis.tone === 'warn').length
  return (
    <>
      {allFine ? (
        <StatusStrip diagnosis={diagnose(stats)} stats={stats} />
      ) : (
        <StatusStrip
          diagnosis={worst.diagnosis}
          facts={[
            { label: 'topic', value: worst.topic },
            ...(flagged > 1 ? [{ label: 'also', value: `${flagged - 1} more topic${flagged > 2 ? 's' : ''}` }] : []),
            ...evidence(worst.stats, worst.diagnosis),
          ]}
        />
      )}
      <TopicTable verdicts={verdicts} />
    </>
  )
}

function TopicTable({ verdicts }: { verdicts: TopicVerdict[] }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr className="border-b">
            {['Topic', 'State', '', 'Backlog', 'Oldest', 'p95 wait', 'In', 'Out', 'Cause'].map((h, i) => (
              <th key={i} className={cn('py-1.5 pr-4 font-normal', i >= 3 && i <= 7 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {verdicts.map(({ topic, stats, diagnosis: d }) => {
            return (
              <tr key={topic} className="border-b last:border-0">
                <td className="max-w-64 truncate py-1.5 pr-4" title={topic}>
                  {topic}
                </td>
                <td className={cn('py-1.5 pr-4 font-sans text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap', TONES[d.tone].className)}>
                  {d.state}
                </td>
                <td className={cn('py-1.5 pr-4 whitespace-nowrap', TONES[d.tone].className)}>{d.headline}</td>
                <td className="py-1.5 pr-4 text-right whitespace-nowrap">
                  {stats.lag.now > 0 ? `${fmtCount(stats.lag.now)}${d.trend ? ` ${ARROWS[d.trend]}` : ''}` : '0'}
                </td>
                <td className="py-1.5 pr-4 text-right">{stats.lag.now > 0 && stats.waitNow ? fmtWait(stats.waitNow) : '—'}</td>
                <td className="py-1.5 pr-4 text-right">{stats.waitP95 ? fmtWait(stats.waitP95) : '—'}</td>
                <td className="py-1.5 pr-4 text-right">{fmtRate(stats.incoming.now)}</td>
                <td className="py-1.5 pr-4 text-right">{fmtRate(stats.processing.now)}</td>
                <td className={cn('py-1.5 pr-4', d.cause && TONES.warn.className)}>{d.cause ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatTiles({ stats, windowKey, intervalMs }: { stats: WindowStats; windowKey: WindowKey; intervalMs: number }) {
  const net = stats.processing.now - stats.incoming.now
  const { lag, commits } = stats
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RateTile label="Incoming" dotClassName="bg-amber-500" rate={stats.incoming} windowKey={windowKey} nowMs={stats.nowWindowMs} />
      <RateTile label="Processed" dotClassName="bg-emerald-500" rate={stats.processing} windowKey={windowKey} nowMs={stats.nowWindowMs} />
      <Tile
        label="Lag"
        dotClassName="bg-red-500"
        value={formatNumber(lag.now)}
        suffix={lag.now > 0 && stats.waitNow ? `oldest ${fmtWait(stats.waitNow)}` : undefined}
      >
        <Cell label={`p95 wait ${windowKey}`} value={stats.waitP95 ? fmtWait(stats.waitP95) : '—'} />
        <Cell label={`Δ ${windowKey}`} value={`${lag.delta > 0 ? '+' : lag.delta < 0 ? '−' : ''}${fmtCount(Math.abs(lag.delta))}`} />
        <Cell label={`peak ${windowKey}`} value={fmtCount(lag.peak)} />
        {lag.now > 0 && net > 0 && <Cell label="clears in" value={`~${fmtEta(lag.now / net)}`} />}
      </Tile>
      <Tile
        label="Commits"
        value={commits?.msgsPerCommit != null ? fmtCount(commits.msgsPerCommit, 1) : '—'}
        suffix="msgs / commit"
        hint={`Partition commits seen per ${intervalMs / 1000} s sample. Commits more frequent than that are counted once, so msgs/commit is an upper bound.`}
      >
        <Cell label="commits/min" value={commits ? fmtCount(commits.perMinute, 1) : '—'} />
        <Cell label="best out" value={stats.capacity ? fmtRate(stats.capacity) : '—'} />
      </Tile>
    </div>
  )
}

interface RateTileProps {
  label: string
  dotClassName: string
  rate: RateStats
  windowKey: WindowKey
  nowMs: number
}

function RateTile({ label, dotClassName, rate, windowKey, nowMs }: RateTileProps) {
  return (
    <Tile label={label} dotClassName={dotClassName} value={fmtRate(rate.now)} suffix={`last ${fmtDuration(nowMs / 1000)}`}>
      <Cell label={`avg ${windowKey}`} value={fmtRate(rate.avg)} />
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
