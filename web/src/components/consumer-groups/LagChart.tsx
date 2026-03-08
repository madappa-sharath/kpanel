// Screen-8c: Consumer Group Lag history chart
// Polls the /lag-history endpoint every 15s; ring-buffer data is kept on the server.

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
import { useLagHistory } from '../../hooks/useConsumerGroups'
import { formatNumber } from '../../lib/utils'

interface LagChartProps {
  clusterId: string
  groupId: string
}

// Palette for per-topic lines (cycles if more topics than colours).
const TOPIC_COLOURS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function LagChart({ clusterId, groupId }: LagChartProps) {
  const { data: snapshots, isLoading, error } = useLagHistory(clusterId, groupId)

  // Derive the unique topic names present across all snapshots.
  const topics = useMemo(() => {
    const s = new Set<string>()
    for (const snap of snapshots ?? []) {
      for (const t of Object.keys(snap.by_topic)) s.add(t)
    }
    return Array.from(s).sort()
  }, [snapshots])

  // Flatten snapshots into recharts-compatible rows.
  const rows = useMemo(
    () =>
      (snapshots ?? []).map((snap) => ({
        ts: snap.ts,
        total_lag: snap.total_lag,
        ...Object.fromEntries(topics.map((t) => [t, snap.by_topic[t] ?? 0])),
      })),
    [snapshots, topics],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Loading lag history…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-destructive">
        {(error as Error).message}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No lag history yet. Snapshots are collected every 15 s while this group is active.
      </div>
    )
  }

  // Show per-topic breakdown only when there are ≤ 8 topics; otherwise total only.
  const showTopics = topics.length > 0 && topics.length <= 8

  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground mb-3">
        Live session history — sampled every 15 s · {rows.length} sample{rows.length !== 1 ? 's' : ''} · cleared on server restart
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="ts"
            tickFormatter={fmtTime}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            minTickGap={60}
          />
          <YAxis
            tickFormatter={(v) => formatNumber(v)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            width={60}
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
    </div>
  )
}
