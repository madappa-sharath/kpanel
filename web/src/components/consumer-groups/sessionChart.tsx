import { ReferenceArea } from 'recharts'

export const SESSION_SYNC_ID = 'lag-session'
export const SESSION_CHART_HEIGHT = 180
export const SESSION_CHART_MARGIN = { top: 4, right: 16, left: 0, bottom: 0 }
export const SESSION_Y_AXIS_WIDTH = 56
export const SESSION_TIME_AXIS = {
  dataKey: 'ts',
  type: 'number',
  scale: 'time',
  domain: ['dataMin', 'dataMax'],
} as const

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function gapAreas(gaps: { from: number; to: number }[]) {
  return gaps.map((g) => (
    <ReferenceArea
      key={g.from}
      x1={g.from}
      x2={g.to}
      fill="var(--muted)"
      fillOpacity={0.6}
      ifOverflow="hidden"
      label={{ value: 'no samples', position: 'insideTop', fill: 'var(--muted-foreground)', fontSize: 11 }}
    />
  ))
}
