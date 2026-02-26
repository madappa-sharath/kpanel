// TODO: Screen-5 — implement as part of Topic Messages screen.
// Controlled component: partition picker, offset strategy, key filter, fetch/stream toggle.

import { useState } from 'react'
import type { Message } from '../../types/topic'
import { formatBytes, relativeTime } from '../../lib/utils'

interface MessageBrowserProps {
  clusterId: string
  topicName: string
  messages: Message[]
  isLoading: boolean
  onFetch: (opts: { partition?: number; limit: number }) => void
}

export function MessageBrowser({ messages, isLoading, onFetch }: MessageBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)

  const key = (m: Message) => `${m.partition}-${m.offset}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <select className="k-input" defaultValue="20" onChange={(e) => setLimit(Number(e.target.value))}>
          <option value="10">Last 10</option>
          <option value="20">Last 20</option>
          <option value="50">Last 50</option>
          <option value="100">Last 100</option>
        </select>
        <button
          onClick={() => onFetch({ limit })}
          disabled={isLoading}
          className="k-btn"
          style={{ opacity: isLoading ? 0.4 : 1 }}
        >
          {isLoading ? 'Loading…' : 'Fetch'}
        </button>
      </div>

      {/* Message list */}
      {messages.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--k-muted)', padding: '32px 0', textAlign: 'center' }}>No messages fetched yet</p>
      ) : (
        <div style={{ border: '1px solid var(--k-border)', borderRadius: 6, overflow: 'hidden' }}>
          {messages.map((m) => (
            <div key={key(m)} style={{ borderBottom: '1px solid var(--k-border)' }}>
              <button
                onClick={() => setExpanded(expanded === key(m) ? null : key(m))}
                className="k-msg-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '8px 16px',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--k-muted)', width: 16, flexShrink: 0 }}>{m.partition}</span>
                <span style={{ color: 'var(--k-muted)', width: 80, flexShrink: 0, fontFamily: 'var(--k-font)' }}>{m.offset}</span>
                <span style={{ color: 'var(--k-muted)', width: 120, flexShrink: 0 }}>{relativeTime(m.timestamp)}</span>
                <span style={{ color: 'var(--k-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--k-font)' }}>{m.key ?? '(null)'}</span>
                <span style={{ color: 'var(--k-muted)' }}>{formatBytes(m.size)}</span>
                <span style={{ color: 'var(--k-faint)' }}>{expanded === key(m) ? '▲' : '▼'}</span>
              </button>
              {expanded === key(m) && (
                <div style={{ padding: '0 16px 12px' }}>
                  <pre style={{ fontSize: 12, color: 'var(--k-text)', background: 'var(--k-surface-2)', borderRadius: 4, padding: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'var(--k-font)' }}>
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(m.value), null, 2)
                      } catch {
                        return m.value
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
