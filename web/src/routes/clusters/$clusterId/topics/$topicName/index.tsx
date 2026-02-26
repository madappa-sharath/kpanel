// Screen-4: Topic Overview
// Shows partition count, replication, leader distribution chart

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'

export function TopicOverviewPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  // Compute leader distribution
  const leaderCount: Record<number, number> = {}
  for (const p of topic.partitions) {
    leaderCount[p.leader] = (leaderCount[p.leader] ?? 0) + 1
  }

  const retention = topic.config['retention.ms']
  const retentionHuman = retention
    ? retention === '-1'
      ? 'unlimited'
      : `${Math.round(Number(retention) / 3_600_000)}h`
    : '—'

  return (
    <div className="k-page">
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Partitions', value: topic.partitions.length },
          { label: 'Replication', value: topic.partitions[0]?.replicas.length ?? '—' },
          { label: 'ISR', value: topic.partitions[0]?.isr.length ?? '—' },
          { label: 'Retention', value: retentionHuman },
        ].map(({ label, value }) => (
          <div key={label} style={{ border: '1px solid var(--k-border)', borderRadius: 6, padding: '12px 16px', background: 'var(--k-surface)' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--k-text)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Leader distribution */}
      <div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Partition Leader Distribution
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(leaderCount).map(([brokerId, count]) => (
            <div key={brokerId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--k-muted)', width: 72, flexShrink: 0 }}>Broker {brokerId}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--k-surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{ height: '100%', background: 'var(--k-amber)', borderRadius: 3, width: `${(count / topic.partitions.length) * 100}%` }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--k-muted)', width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
