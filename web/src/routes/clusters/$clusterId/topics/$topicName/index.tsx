// Screen-4: Topic Overview
// Stats cards, ISR health callout, leader distribution chart

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'
import { formatRetention } from '../../../../../lib/utils'

export function TopicOverviewPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  const underReplicated = topic.partitions.filter((p) => p.isr.length < p.replicas.length).length
  const offline = topic.partitions.filter((p) => p.leader < 0).length

  const leaderCount: Record<number, number> = {}
  for (const p of topic.partitions) {
    if (p.leader >= 0) {
      leaderCount[p.leader] = (leaderCount[p.leader] ?? 0) + 1
    }
  }

  const retentionMs = topic.config['retention.ms']?.value
  const minISR = topic.config['min.insync.replicas']?.value ?? '—'
  const cleanupPolicy = topic.config['cleanup.policy']?.value ?? 'delete'
  const replicationFactor = topic.partitions[0]?.replicas.length ?? '—'

  return (
    <div className="k-page">
      {/* Health callout */}
      {(underReplicated > 0 || offline > 0) ? (
        <div style={{
          padding: '10px 16px',
          borderRadius: 6,
          background: 'color-mix(in srgb, var(--k-amber) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--k-amber) 35%, transparent)',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--k-text)',
          display: 'flex',
          gap: 16,
        }}>
          {underReplicated > 0 && (
            <span>⚠ <strong>{underReplicated}</strong> under-replicated partition{underReplicated > 1 ? 's' : ''}</span>
          )}
          {offline > 0 && (
            <span style={{ color: 'var(--k-red)' }}>✕ <strong>{offline}</strong> offline partition{offline > 1 ? 's' : ''}</span>
          )}
        </div>
      ) : (
        <div style={{
          padding: '10px 16px',
          borderRadius: 6,
          background: 'color-mix(in srgb, var(--k-green) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--k-green) 30%, transparent)',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--k-text)',
        }}>
          ✓ All replicas in sync
        </div>
      )}

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Partitions', value: topic.partitions.length },
          { label: 'Replication', value: replicationFactor },
          { label: 'Min ISR', value: minISR },
          { label: 'Retention', value: formatRetention(retentionMs) },
          { label: 'Cleanup', value: cleanupPolicy },
        ].map(({ label, value }) => (
          <div key={label} style={{ border: '1px solid var(--k-border)', borderRadius: 6, padding: '12px 16px', background: 'var(--k-surface)' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--k-text)', fontFamily: 'var(--k-font)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Leader distribution */}
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Partition Leader Distribution
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(leaderCount)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([brokerId, count]) => (
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
  )
}
