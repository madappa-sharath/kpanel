// TODO: Screen-8 — implement as part of Consumer Group Lag screen.
// Shows per-partition lag over time (CloudWatch or polling).
// Install recharts: bun add recharts

interface LagChartProps {
  clusterId: string
  groupId: string
}

export function LagChart({ groupId }: LagChartProps) {
  // TODO: wire up CloudWatch metrics or polling-based lag history
  // Use recharts LineChart with one line per partition

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--k-border)', background: 'var(--k-surface)', height: 192 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--k-muted)' }}>Lag chart for {groupId}</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--k-faint)' }}>
          TODO: install recharts and wire up lag history data
        </p>
      </div>
    </div>
  )
}
