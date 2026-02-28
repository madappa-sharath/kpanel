// Screen-4c: Topic Configuration
// Key-value config viewer with non-defaults toggle and highlighted keys

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'

const HIGHLIGHTED_KEYS = new Set([
  'cleanup.policy',
  'retention.ms',
  'retention.bytes',
  'min.insync.replicas',
  'compression.type',
  'max.message.bytes',
])

export function TopicConfigPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)
  const [hideDefaults, setHideDefaults] = useState(true)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  const allEntries = Object.entries(topic.config).sort(([a], [b]) => a.localeCompare(b))
  const entries = hideDefaults ? allEntries.filter(([, v]) => v.source !== 'default') : allEntries

  const defaultCount = allEntries.filter(([, v]) => v.source === 'default').length

  return (
    <div className="k-page">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--k-muted)' }}>
          {entries.length} key{entries.length !== 1 ? 's' : ''}
          {hideDefaults && defaultCount > 0 && ` · ${defaultCount} default${defaultCount > 1 ? 's' : ''} hidden`}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={hideDefaults}
            onChange={(e) => setHideDefaults(e.target.checked)}
          />
          Hide defaults
        </label>
      </div>

      <div style={{ border: '1px solid var(--k-border)', borderRadius: 6, overflow: 'hidden' }}>
        {entries.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--k-muted)', fontSize: 14, textAlign: 'center' }}>
            {hideDefaults ? 'No overridden keys — all values are broker defaults' : 'No configuration returned'}
          </p>
        ) : (
          entries.map(([key, entry]) => {
            const highlighted = HIGHLIGHTED_KEYS.has(key)
            return (
              <div
                key={key}
                className="k-hover-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 16px',
                  borderBottom: '1px solid var(--k-border)',
                  gap: 24,
                  background: highlighted ? 'color-mix(in srgb, var(--k-amber) 5%, transparent)' : undefined,
                }}
              >
                <code style={{
                  fontSize: 12,
                  color: highlighted ? 'var(--k-text)' : 'var(--k-muted)',
                  fontWeight: highlighted ? 500 : undefined,
                  width: 280,
                  flexShrink: 0,
                  fontFamily: 'var(--k-font)',
                }}>
                  {key}
                </code>
                <code style={{ fontSize: 13, color: 'var(--k-text)', fontFamily: 'var(--k-font)', flex: 1 }}>
                  {entry.value}
                </code>
                {entry.source !== 'default' && (
                  <span style={{ fontSize: 11, color: 'var(--k-amber)', background: 'color-mix(in srgb, var(--k-amber) 15%, transparent)', padding: '2px 6px', borderRadius: 3 }}>
                    {entry.source}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
