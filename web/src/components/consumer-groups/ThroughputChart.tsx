import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { ChartRow } from './lagStats'
import { fmtRate } from './lagStats'
import {
  SESSION_CHART_HEIGHT,
  SESSION_CHART_MARGIN,
  SESSION_SYNC_ID,
  SESSION_TIME_AXIS,
  SESSION_Y_AXIS_WIDTH,
  fmtTime,
  gapAreas,
} from './sessionChart'

export const INCOMING_COLOUR = '#f59e0b'
export const PROCESSING_COLOUR = '#10b981'

export function ThroughputChart({ rows, gaps }: { rows: ChartRow[]; gaps: { from: number; to: number }[] }) {
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
        <Line type="monotone" dataKey="produce_rate" name="Incoming" stroke={INCOMING_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="consume_rate" name="Processed (committed)" stroke={PROCESSING_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
