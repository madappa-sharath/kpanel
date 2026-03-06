// Screen-4: Topic Overview

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'
import { useConsumerGroups } from '../../../../../hooks/useConsumerGroups'
import { useClusters } from '../../../../../hooks/useCluster'
import { useTopicMetrics } from '../../../../../hooks/useMetrics'
import { MetricsChart } from '../../../../../components/metrics/MetricsChart'
import { MetricsErrorBanner } from '../../../../../components/metrics/MetricsErrorBanner'
import { formatRetention } from '../../../../../lib/utils'
import { StatusBadge } from '../../../../../components/shared/StatusBadge'
import { cn } from '@/lib/utils'

export function TopicOverviewPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)
  const { data: allGroups } = useConsumerGroups(clusterId)
  const { data: clusters } = useClusters()
  const isAWS = clusters?.find((c) => c.id === clusterId)?.platform === 'aws'
  const { data: metricsData, isLoading: metricsLoading, error: metricsError } = useTopicMetrics(
    clusterId,
    topicName,
    isAWS,
  )

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!topic) return null

  const underReplicated = topic.partitions.filter((p) => p.isr.length < p.replicas.length).length
  const offline = topic.partitions.filter((p) => p.leader < 0).length

  const leaderCount: Record<number, number> = {}
  for (const p of topic.partitions) {
    if (p.leader >= 0) {
      leaderCount[p.leader] = (leaderCount[p.leader] ?? 0) + 1
    }
  }

  const totalMessages = topic.partitions.reduce(
    (sum, p) => sum + Math.max(0, p.high_watermark - p.log_start_offset),
    0,
  )

  const retentionMs = topic.config['retention.ms']?.value
  const minISR = topic.config['min.insync.replicas']?.value ?? '—'
  const cleanupPolicy = topic.config['cleanup.policy']?.value ?? 'delete'
  const replicationFactor = topic.partitions[0]?.replicas.length ?? '—'

  const leaderCounts = Object.values(leaderCount)
  const avgLeaders = leaderCounts.length > 0
    ? leaderCounts.reduce((a, b) => a + b, 0) / leaderCounts.length
    : 0
  const maxLeaders = leaderCounts.length > 0 ? Math.max(...leaderCounts) : 0
  const isBalanced = avgLeaders === 0 || maxLeaders <= avgLeaders * 1.5

  const activeGroups = (allGroups ?? []).filter((g) => g.topics.includes(topicName))

  return (
    <div className="p-6">
      {/* Health callout */}
      {(underReplicated > 0 || offline > 0) ? (
        <div className="px-4 py-2.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800 mb-5 text-sm flex gap-4">
          {underReplicated > 0 && (
            <span className="text-amber-700 dark:text-amber-300">⚠ <strong>{underReplicated}</strong> under-replicated partition{underReplicated > 1 ? 's' : ''}</span>
          )}
          {offline > 0 && (
            <span className="text-destructive">✕ <strong>{offline}</strong> offline partition{offline > 1 ? 's' : ''}</span>
          )}
        </div>
      ) : (
        <div className="px-4 py-2.5 rounded-md bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800 mb-5 text-sm text-green-700 dark:text-green-300">
          ✓ All replicas in sync
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-6 gap-3 mb-7">
        {[
          { label: 'Partitions', value: topic.partitions.length },
          { label: 'Total Messages', value: totalMessages.toLocaleString() },
          { label: 'Replication', value: replicationFactor },
          { label: 'Min ISR', value: minISR },
          { label: 'Retention', value: formatRetention(retentionMs) },
          { label: 'Cleanup', value: cleanupPolicy },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-md p-3 bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xl font-semibold font-mono">{value}</p>
          </div>
        ))}
      </div>

      {/* Leader distribution */}
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Partition Leader Distribution</p>
      <div className="flex flex-col gap-2 mb-7">
        {Object.entries(leaderCount)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([brokerId, count]) => (
            <div key={brokerId} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-18 flex-shrink-0">Broker {brokerId}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', isBalanced ? 'bg-green-500' : 'bg-amber-500')}
                  style={{ width: `${(count / topic.partitions.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
            </div>
          ))}
      </div>

      {/* Consumer groups */}
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Active Consumer Groups</p>
      {activeGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No active consumers for this topic</p>
      ) : (
        <div className="rounded-md border">
          <div className="grid gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/50" style={{ gridTemplateColumns: '1fr 120px 100px' }}>
            <span>Group ID</span>
            <span>State</span>
            <span className="text-right">Lag</span>
          </div>
          {activeGroups.map((g) => (
            <div key={g.id} className="grid gap-3 px-4 py-2.5 border-t items-center" style={{ gridTemplateColumns: '1fr 120px 100px' }}>
              <span className="text-sm font-mono">{g.id}</span>
              <span><StatusBadge variant={g.state === 'Stable' ? 'ok' : 'warn'} label={g.state} /></span>
              <span className="text-sm font-mono text-right">{g.total_lag.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* CloudWatch Metrics (AWS MSK only) */}
      {isAWS && (
        <div className="mt-7">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            CloudWatch Metrics · last 3 hours
          </p>
          <MetricsErrorBanner error={metricsError as Error | null} />
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'bytes_in', title: 'Bytes In/sec' },
              { id: 'bytes_out', title: 'Bytes Out/sec' },
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
      )}
    </div>
  )
}
