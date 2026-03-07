// Screen-8c: Consumer Group Lag chart

import { useParams } from '@tanstack/react-router'
import { LagChart } from '../../../../../components/consumer-groups/LagChart'
import { useClusters } from '../../../../../hooks/useCluster'
import { useConsumerMetrics } from '../../../../../hooks/useMetrics'
import { MetricsChart } from '../../../../../components/metrics/MetricsChart'
import { MetricsErrorBanner } from '../../../../../components/metrics/MetricsErrorBanner'

export function GroupLagPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: clusters } = useClusters()
  const isAWS = clusters?.find((c) => c.id === clusterId)?.platform === 'aws'
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useConsumerMetrics(
    clusterId,
    groupId,
    isAWS,
  )

  // Partition consumer metric series by metric type (sum_lag vs time_lag prefix)
  const sumLagSeries = metricsData?.series.filter((s) => s.id.startsWith('sum_lag')) ?? []
  const timeLagSeries = metricsData?.series.filter((s) => s.id.startsWith('time_lag')) ?? []

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Kafka offset-based lag history */}
      <LagChart clusterId={clusterId} groupId={groupId} />

      {/* CloudWatch lag (AWS MSK only) */}
      {isAWS && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            CloudWatch Lag · last 3 hours
          </p>
          <MetricsErrorBanner error={metricsError as Error | null} />

          <div className="grid grid-cols-2 gap-4">
            {/* SumOffsetLag per topic */}
            {(metricsLoading || sumLagSeries.length > 0) && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Offset Lag per Topic</p>
                <div className="rounded-md border bg-card p-4 flex flex-col gap-4">
                  {metricsLoading
                    ? [0].map((i) => <MetricsChart key={i} series={null} isLoading />)
                    : sumLagSeries.slice(0, 4).map((s, i) => (
                        <MetricsChart
                          key={s.id}
                          series={{ ...s, label: s.label || `Topic ${i + 1}` }}
                        />
                      ))}
                </div>
              </div>
            )}

            {/* EstimatedMaxTimeLag per topic */}
            {(metricsLoading || timeLagSeries.length > 0) && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Time Lag per Topic</p>
                <div className="rounded-md border bg-card p-4 flex flex-col gap-4">
                  {metricsLoading
                    ? [0].map((i) => <MetricsChart key={i} series={null} isLoading />)
                    : timeLagSeries.slice(0, 4).map((s, i) => (
                        <MetricsChart
                          key={s.id}
                          series={{ ...s, label: s.label || `Topic ${i + 1}` }}
                        />
                      ))}
                </div>
              </div>
            )}
          </div>

          {!metricsLoading && sumLagSeries.length === 0 && timeLagSeries.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No CloudWatch lag data in this window
            </div>
          )}
        </div>
      )}
    </div>
  )
}
