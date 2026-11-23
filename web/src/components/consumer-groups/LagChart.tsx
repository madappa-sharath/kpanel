// Screen-8c: Consumer Group Lag history chart

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
import { formatNumber } from '../../lib/utils'
import type { LagSnapshot } from '../../types/consumer'
import { SESSION_CHART_MARGIN, SESSION_SYNC_ID, SESSION_TIME_AXIS, SESSION_Y_AXIS_WIDTH, fmtTime } from './sessionChart'

interface LagChartProps {
  snapshots: LagSnapshot[]
}

// Palette for per-topic lines (cycles if more topics than colours).
const TOPIC_COLOURS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

export function LagChart({ snapshots }: LagChartProps) {
  // Derive the unique topic names present across all snapshots.
  const topics = useMemo(() => {
    const s = new Set<string>()
    for (const snap of snapshots) {
      for (const t of Object.keys(snap.by_topic)) s.add(t)
    }
    return Array.from(s).sort()
  }, [snapshots])

  // Flatten snapshots into recharts-compatible rows.
  const rows = useMemo(
    () =>
      snapshots.map((snap) => ({
        ts: snap.ts,
        total_lag: snap.total_lag,
        ...Object.fromEntries(topics.map((t) => [t, snap.by_topic[t] ?? 0])),
      })),
    [snapshots, topics],
  )

  const showTopics = topics.length > 1 && topics.length <= 8

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={SESSION_CHART_MARGIN} syncId={SESSION_SYNC_ID}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          {...SESSION_TIME_AXIS}
          tickFormatter={fmtTime}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={(v) => formatNumber(v)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          width={SESSION_Y_AXIS_WIDTH}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: any) => [formatNumber(v as number)]) as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={((ts: any) => fmtTime(ts as number)) as any}
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        <Line
          type="monotone"
          dataKey="total_lag"
          name="Total Lag"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
        />
        {showTopics &&
          topics.map((topic, i) => (
            <Line
              key={topic}
              type="monotone"
              dataKey={topic}
              name={topic}
              stroke={TOPIC_COLOURS[i % TOPIC_COLOURS.length]}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
