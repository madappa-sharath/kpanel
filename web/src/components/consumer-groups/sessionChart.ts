export const SESSION_SYNC_ID = 'lag-session'
export const SESSION_CHART_MARGIN = { top: 4, right: 16, left: 0, bottom: 0 }
export const SESSION_Y_AXIS_WIDTH = 64
export const SESSION_TIME_AXIS = {
  dataKey: 'ts',
  type: 'number',
  scale: 'time',
  domain: ['dataMin', 'dataMax'],
} as const

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
