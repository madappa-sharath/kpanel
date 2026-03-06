import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { MetricSeries } from '../../types/metrics'

interface MetricsChartProps {
  series: MetricSeries | null | undefined
  isLoading?: boolean
  height?: number
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtValue(v: number, unit: string): string {
  if (unit === 'Bytes/Second') {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}MB/s`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}KB/s`
    return `${v.toFixed(0)}B/s`
  }
  if (unit === 'Bytes') {
    if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(1)}GB`
    if (v >= 1_048_576) return `${(v / 1_048_576).toFixed(1)}MB`
    if (v >= 1_024) return `${(v / 1_024).toFixed(1)}KB`
    return `${v.toFixed(0)}B`
  }
  if (unit === 'Percent') return `${v.toFixed(1)}%`
  if (unit === 'Seconds') return `${v.toFixed(1)}s`
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

export function MetricsChart({ series, isLoading = false, height = 160 }: MetricsChartProps) {
  if (isLoading) {
    return <Skeleton style={{ height }} className="w-full rounded-md" />
  }

  if (!series || series.datapoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No data in this window
      </div>
    )
  }

  const unit = series.unit

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{series.label}</p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={series.datapoints} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="ts"
            tickFormatter={fmtTime}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            minTickGap={50}
          />
          <YAxis
            tickFormatter={(v) => fmtValue(v as number, unit)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            width={56}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((v: any) => [fmtValue(v as number, unit), series.label]) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={((ts: any) => fmtTime(ts as number)) as any}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="#6366f1"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
