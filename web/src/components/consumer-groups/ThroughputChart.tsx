import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { LagSnapshot } from '../../types/consumer'
import { SESSION_CHART_MARGIN, SESSION_SYNC_ID, SESSION_TIME_AXIS, SESSION_Y_AXIS_WIDTH, fmtTime } from './sessionChart'

const SUMMARY_WINDOW_MS = 60 * 1000
const PACE_TOLERANCE = 0.05

const PRODUCE_COLOUR = '#f59e0b'
const CONSUME_COLOUR = '#10b981'

function fmtRate(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M/s`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K/s`
  return `${v.toFixed(v < 10 ? 1 : 0)}/s`
}

function fmtDuration(seconds: number) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

interface Summary {
  produce: number
  consume: number
  lag: number
}

function summarise(snapshots: LagSnapshot[]): Summary | null {
  const last = snapshots[snapshots.length - 1]
  if (!last || last.produce_rate === null || last.consume_rate === null) return null
  let produced = 0
  let consumed = 0
  let ms = 0
  for (let i = snapshots.length - 1; i > 0; i--) {
    const s = snapshots[i]
    if (s.ts < last.ts - SUMMARY_WINDOW_MS) break
    if (s.produce_rate === null || s.consume_rate === null) break
    const dt = s.ts - snapshots[i - 1].ts
    produced += s.produce_rate * dt
    consumed += s.consume_rate * dt
    ms += dt
  }
  if (ms === 0) return null
  return { produce: produced / ms, consume: consumed / ms, lag: last.total_lag }
}

function Verdict({ produce, consume, lag }: Summary) {
  const net = consume - produce
  const scale = Math.max(produce, consume)
  if (scale === 0) {
    return <span className="text-muted-foreground">Idle — nothing produced or consumed</span>
  }
  if (Math.abs(net) <= scale * PACE_TOLERANCE) {
    return (
      <span className="text-muted-foreground">
        Keeping pace (net {net >= 0 ? '+' : '−'}{fmtRate(Math.abs(net))})
      </span>
    )
  }
  if (net > 0) {
    return (
      <span className="text-green-600 dark:text-green-400">
        Catching up by {fmtRate(net)}
        {lag > 0 && <> · lag clears in ~{fmtDuration(lag / net)} at this rate</>}
      </span>
    )
  }
  return (
    <span className="text-amber-600 dark:text-amber-400">
      Falling behind by {fmtRate(-net)}
    </span>
  )
}

export function ThroughputSummary({ snapshots }: { snapshots: LagSnapshot[] }) {
  const summary = useMemo(() => summarise(snapshots), [snapshots])
  if (!summary) return null
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Last minute: </span>
      <span className="font-mono text-xs">in {fmtRate(summary.produce)} · out {fmtRate(summary.consume)}</span>
      <span className="text-muted-foreground"> · </span>
      <Verdict {...summary} />
    </p>
  )
}

export function ThroughputChart({ snapshots }: { snapshots: LagSnapshot[] }) {
  const hasRates = snapshots.some((s) => s.produce_rate !== null || s.consume_rate !== null)

  if (!hasRates) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        {snapshots.length < 2
          ? 'Rates appear after the second sample (about 15 s).'
          : 'No rates yet — the group has no comparable committed offsets.'}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={snapshots} margin={SESSION_CHART_MARGIN} syncId={SESSION_SYNC_ID}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          {...SESSION_TIME_AXIS}
          tickFormatter={fmtTime}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={(v) => fmtRate(v as number)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          width={SESSION_Y_AXIS_WIDTH}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: any) => [v == null ? '—' : fmtRate(v as number)]) as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={((ts: any) => fmtTime(ts as number)) as any}
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        <Line
          type="monotone"
          dataKey="produce_rate"
          name="Produced"
          stroke={PRODUCE_COLOUR}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="consume_rate"
          name="Consumed (committed)"
          stroke={CONSUME_COLOUR}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
