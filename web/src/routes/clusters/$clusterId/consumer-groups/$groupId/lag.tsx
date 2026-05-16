// Screen-8c: Consumer Group Lag chart

import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { LagChart } from '../../../../../components/consumer-groups/LagChart'
import { useClusters } from '../../../../../hooks/useCluster'
import { useConsumerMetrics } from '../../../../../hooks/useMetrics'
import { MetricsChart } from '../../../../../components/metrics/MetricsChart'
import { MetricsErrorBanner } from '../../../../../components/metrics/MetricsErrorBanner'
import { TimeRangePicker, type TimeRange } from '../../../../../components/metrics/TimeRangePicker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

export function GroupLagPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)
  const isAWS = cluster?.platform === 'aws'
  const [range, setRange] = useState<TimeRange>('3h')
  const [topicOverride, setTopicOverride] = useState<string | null>(null)
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useConsumerMetrics(
    clusterId,
    groupId,
    isAWS,
    range,
  )

  const sumLagSeries = metricsData?.series.filter((s) => s.id.startsWith('sum_lag')) ?? []
  const timeLagSeries = metricsData?.series.filter((s) => s.id.startsWith('time_lag')) ?? []

  // Topics derived from labels (which are the Topic dim values from CloudWatch).
  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const s of sumLagSeries) if (s.label) set.add(s.label)
    for (const s of timeLagSeries) if (s.label) set.add(s.label)
    return Array.from(set).sort()
  }, [sumLagSeries, timeLagSeries])

  const effectiveTopic =
    topicOverride && topics.includes(topicOverride) ? topicOverride : topics[0]
  const selectedSumLag = sumLagSeries.find((s) => s.label === effectiveTopic)
  const selectedTimeLag = timeLagSeries.find((s) => s.label === effectiveTopic)

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Kafka offset-based lag history */}
      <LagChart clusterId={clusterId} groupId={groupId} />

      {/* CloudWatch lag (AWS MSK only) */}
      {isAWS && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              CloudWatch Lag
            </p>
            <div className="flex items-center gap-2">
              {topics.length > 1 && effectiveTopic && (
                <Select
                  value={effectiveTopic}
                  onValueChange={(v) => setTopicOverride(v)}
                >
                  <SelectTrigger className="h-7 w-[220px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs font-mono">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <TimeRangePicker value={range} onChange={setRange} />
            </div>
          </div>
          <MetricsErrorBanner error={metricsError as Error | null} />

          {metricsLoading ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">Offset Lag</p>
                <MetricsChart series={null} isLoading />
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">Time Lag</p>
                <MetricsChart series={null} isLoading />
              </div>
            </div>
          ) : effectiveTopic ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Offset Lag — <span className="font-mono">{effectiveTopic}</span>
                </p>
                <MetricsChart
                  series={
                    selectedSumLag
                      ? { ...selectedSumLag, label: 'SumOffsetLag' }
                      : null
                  }
                />
              </div>
              <div className="rounded-md border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Time Lag — <span className="font-mono">{effectiveTopic}</span>
                </p>
                <MetricsChart
                  series={
                    selectedTimeLag
                      ? { ...selectedTimeLag, label: 'EstimatedMaxTimeLag' }
                      : null
                  }
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No CloudWatch lag data in this window
            </div>
          )}
        </div>
      )}
    </div>
  )
}
