import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useClusters, useClusterOverview } from '../../../../hooks/useCluster'
import { useBrokerMetrics } from '../../../../hooks/useMetrics'
import { MetricsChart } from '../../../../components/metrics/MetricsChart'
import { MetricsErrorBanner } from '../../../../components/metrics/MetricsErrorBanner'
import { TimeRangePicker, type TimeRange } from '../../../../components/metrics/TimeRangePicker'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function BrokerDetailPage() {
  const { clusterId, brokerId } = useParams({ strict: false }) as {
    clusterId: string
    brokerId: string
  }
  const { data: clusters } = useClusters()
  const { data: overview, isLoading: overviewLoading } = useClusterOverview(clusterId)
  const cluster = clusters?.find((c) => c.id === clusterId)
  const isAWS = cluster?.platform === 'aws'
  const [range, setRange] = useState<TimeRange>('3h')
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useBrokerMetrics(
    clusterId,
    brokerId,
    isAWS,
    range,
  )

  const broker = overview?.brokers.find((b) => String(b.nodeId) === brokerId)

  return (
    <div className="p-6">
      <PageHeader
        title={`Broker ${brokerId}`}
        description={broker ? `${broker.host}:${broker.port}` : 'Broker details'}
      />

      {/* Broker info */}
      <div className="rounded-md border bg-card p-5 mb-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Broker Info
        </div>
        {overviewLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-2 w-1/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : broker ? (
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Node ID</p>
              <p className="font-mono">{broker.nodeId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Address</p>
              <p className="font-mono">
                {broker.host}:{broker.port}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Role</p>
              {broker.isController ? (
                <Badge
                  variant="outline"
                  className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
                >
                  Controller
                </Badge>
              ) : (
                <span className="text-muted-foreground">Broker</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Rack</p>
              <p className="font-mono">{broker.rack ?? '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Broker {brokerId} not found in cluster</p>
        )}
      </div>

      {/* CloudWatch Metrics */}
      {isAWS ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              CloudWatch Metrics
            </div>
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <MetricsErrorBanner error={metricsError as Error | null} />
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'cpu_user', title: 'CPU User %' },
              { id: 'disk_used', title: 'Disk Used %' },
              { id: 'bytes_in', title: 'Bytes In/sec' },
              { id: 'bytes_out', title: 'Bytes Out/sec' },
              { id: 'memory_used', title: 'Memory Used' },
            ].map(({ id, title }) => (
              <div key={id} className="rounded-md border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {title}
                </p>
                <MetricsChart
                  series={metricsData?.series.find((s) => s.id === id)}
                  isLoading={metricsLoading}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            CloudWatch metrics are only available for AWS MSK clusters
          </p>
        </div>
      )}
    </div>
  )
}
