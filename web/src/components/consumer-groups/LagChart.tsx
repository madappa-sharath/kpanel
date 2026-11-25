// Screen-8c: Consumer Group Lag history chart

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatNumber } from '../../lib/utils'
import type { ChartRow } from './lagStats'
import { fmtCount } from './lagStats'
import {
  SESSION_CHART_HEIGHT,
  SESSION_CHART_MARGIN,
  SESSION_SYNC_ID,
  SESSION_TIME_AXIS,
  SESSION_Y_AXIS_WIDTH,
  fmtTime,
  gapAreas,
} from './sessionChart'

interface LagChartProps {
  rows: ChartRow[]
  topics: string[]
  gaps: { from: number; to: number }[]
}

// Palette for per-topic lines (cycles if more topics than colours).
const TOPIC_COLOURS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

export function LagChart({ rows, topics, gaps }: LagChartProps) {
  const showTopics = topics.length > 1 && topics.length <= 8

  return (
    <ResponsiveContainer width="100%" height={SESSION_CHART_HEIGHT}>
      <LineChart data={rows} margin={SESSION_CHART_MARGIN} syncId={SESSION_SYNC_ID}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        {gapAreas(gaps)}
        <XAxis
          {...SESSION_TIME_AXIS}
          tickFormatter={fmtTime}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={(v) => fmtCount(v as number)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          width={SESSION_Y_AXIS_WIDTH}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((v: any) => [v == null ? '—' : formatNumber(v as number)]) as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={((ts: any) => fmtTime(ts as number)) as any}
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        <Line type="monotone" dataKey="total_lag" name="Total lag" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
        {showTopics &&
          topics.map((topic, i) => (
            <Line
              key={topic}
              type="monotone"
              dataKey={(row: ChartRow) => row.topics[topic]}
              name={topic}
              stroke={TOPIC_COLOURS[i % TOPIC_COLOURS.length]}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              isAnimationActive={false}
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
