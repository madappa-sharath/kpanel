// Screen-4c: Topic Configuration
// Key-value config viewer. Editable fields TBD when alter-config endpoint added.

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'

export function TopicConfigPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  const entries = Object.entries(topic.config).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="k-page">
      <div style={{ border: '1px solid var(--k-border)', borderRadius: 6, overflow: 'hidden' }}>
        {entries.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--k-muted)', fontSize: 14, textAlign: 'center' }}>
            No configuration returned
          </p>
        ) : (
          entries.map(([key, value]) => (
            <div
              key={key}
              className="k-hover-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '9px 16px',
                borderBottom: '1px solid var(--k-border)',
                gap: 24,
              }}
            >
              <code style={{ fontSize: 12, color: 'var(--k-muted)', width: 280, flexShrink: 0, fontFamily: 'var(--k-font)' }}>
                {key}
              </code>
              <code style={{ fontSize: 13, color: 'var(--k-text)', fontFamily: 'var(--k-font)' }}>
                {value}
              </code>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
