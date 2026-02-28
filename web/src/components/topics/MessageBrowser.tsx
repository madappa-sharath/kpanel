import { useState } from 'react'
import type { Message } from '../../types/topic'
import { formatBytes, relativeTime } from '../../lib/utils'

interface MessageBrowserProps {
  messages: Message[]
  isLoading: boolean
  partitions: number[] // available partition IDs (empty = topic not loaded yet)
  onFetch: (opts: { partition?: number; limit: number }) => void
}

export function MessageBrowser({ messages, isLoading, partitions, onFetch }: MessageBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)
  const [partition, setPartition] = useState<string>('') // '' = all

  const key = (m: Message) => `${m.partition}-${m.offset}`

  function handleFetch() {
    onFetch({
      limit,
      partition: partition === '' ? undefined : Number(partition),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <select
          className="k-input"
          value={partition}
          onChange={(e) => setPartition(e.target.value)}
          disabled={partitions.length === 0}
          style={{ width: 160 }}
        >
          <option value="">All partitions</option>
          {partitions.map((p) => (
            <option key={p} value={String(p)}>Partition {p}</option>
          ))}
        </select>
        <select
          className="k-input"
          value={String(limit)}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          <option value="10">Last 10</option>
          <option value="20">Last 20</option>
          <option value="50">Last 50</option>
          <option value="100">Last 100</option>
        </select>
        <button
          onClick={handleFetch}
          disabled={isLoading}
          className="k-btn"
          style={{ opacity: isLoading ? 0.4 : 1 }}
        >
          {isLoading ? 'Loading…' : 'Fetch'}
        </button>
        {messages.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--k-muted)' }}>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Column header */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          <span style={{ width: 16, flexShrink: 0 }}>P</span>
          <span style={{ width: 80, flexShrink: 0 }}>Offset</span>
          <span style={{ width: 120, flexShrink: 0 }}>Time</span>
          <span style={{ flex: 1 }}>Key</span>
          <span>Size</span>
          <span style={{ width: 16 }} />
        </div>
      )}

      {/* Message list */}
      {messages.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--k-muted)', padding: '32px 0', textAlign: 'center' }}>
          No messages fetched yet — click Fetch to load
        </p>
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
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <span style={{ color: 'var(--k-muted)', width: 16, flexShrink: 0 }}>{m.partition}</span>
                <span style={{ color: 'var(--k-muted)', width: 80, flexShrink: 0, fontFamily: 'var(--k-font)' }}>{m.offset}</span>
                <span style={{ color: 'var(--k-muted)', width: 120, flexShrink: 0 }}>{relativeTime(m.timestamp)}</span>
                <span style={{ color: 'var(--k-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--k-font)' }}>
                  {m.key ?? <span style={{ color: 'var(--k-muted)' }}>(null)</span>}
                </span>
                <span style={{ color: 'var(--k-muted)', flexShrink: 0 }}>{formatBytes(m.size)}</span>
                <span style={{ color: 'var(--k-faint)', width: 16, textAlign: 'right', flexShrink: 0 }}>
                  {expanded === key(m) ? '▲' : '▼'}
                </span>
              </button>
              {expanded === key(m) && (
                <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--k-border)' }}>
                  {m.key && (
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ margin: '8px 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Key</p>
                      <pre style={{ fontSize: 12, color: 'var(--k-text)', background: 'var(--k-surface-2)', borderRadius: 4, padding: '8px 12px', margin: 0, fontFamily: 'var(--k-font)', overflowX: 'auto' }}>
                        {m.key}
                      </pre>
                    </div>
                  )}
                  <p style={{ margin: '8px 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Value</p>
                  <pre style={{ fontSize: 12, color: 'var(--k-text)', background: 'var(--k-surface-2)', borderRadius: 4, padding: '8px 12px', overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'var(--k-font)' }}>
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(m.value), null, 2)
                      } catch {
                        return m.value
                      }
                    })()}
                  </pre>
                  {Object.keys(m.headers).length > 0 && (
                    <>
                      <p style={{ margin: '8px 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Headers</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(m.headers).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 12, fontSize: 12, fontFamily: 'var(--k-font)' }}>
                            <span style={{ color: 'var(--k-muted)', minWidth: 120 }}>{k}</span>
                            <span style={{ color: 'var(--k-text)' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
