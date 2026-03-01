import { useState, useEffect, useRef } from 'react'
import type { Message, PeekRequest } from '../../types/topic'
import { formatBytes, relativeTime } from '../../lib/utils'

type Strategy = 'tail' | 'offset' | 'timestamp'

interface MessageBrowserProps {
  messages: Message[]
  isLoading: boolean
  partitions: number[] // available partition IDs (empty = topic not loaded yet)
  initialPartition?: number
  onFetch: (opts: PeekRequest) => void
}

export function MessageBrowser({
  messages,
  isLoading,
  partitions,
  initialPartition,
  onFetch,
}: MessageBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)
  const [partition, setPartition] = useState<string>(
    initialPartition != null ? String(initialPartition) : '',
  )
  const [strategy, setStrategy] = useState<Strategy>('tail')
  const [startOffset, setStartOffset] = useState('')
  const [startTimestamp, setStartTimestamp] = useState('')
  const [isLive, setIsLive] = useState(false)
  const [showAbsolute, setShowAbsolute] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Keep a ref to the latest fetch callback and options so the interval never
  // closes over stale values without needing to restart on every param change.
  const liveCallbackRef = useRef<() => void>(() => {})

  const key = (m: Message) => `${m.partition}-${m.offset}`

  function buildOpts(): PeekRequest {
    const opts: PeekRequest = {
      limit,
      partition: partition === '' ? undefined : Number(partition),
    }
    if (strategy === 'offset' && startOffset !== '') {
      opts.start_offset = Number(startOffset)
    }
    if (strategy === 'timestamp' && startTimestamp !== '') {
      opts.start_timestamp = new Date(startTimestamp).toISOString()
    }
    return opts
  }

  function handleFetch() {
    onFetch(buildOpts())
  }

  // Keep the ref in sync with latest opts + callback every render.
  liveCallbackRef.current = () => onFetch(buildOpts())

  // Live tail: start/stop the interval only when isLive toggles.
  // The interval always calls through liveCallbackRef so it uses current values.
  useEffect(() => {
    if (isLive) {
      liveIntervalRef.current = setInterval(() => liveCallbackRef.current(), 5000)
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
    }
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
    }
  }, [isLive])

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  // Client-side filter
  const filteredMessages = filterText
    ? messages.filter((m) => {
        const q = filterText.toLowerCase()
        return (
          (m.key?.toLowerCase().includes(q) ?? false) ||
          m.value.toLowerCase().includes(q)
        )
      })
    : messages

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select
          className="k-input"
          value={partition}
          onChange={(e) => setPartition(e.target.value)}
          disabled={partitions.length === 0}
          style={{ width: 150 }}
        >
          <option value="">All partitions</option>
          {partitions.map((p) => (
            <option key={p} value={String(p)}>Partition {p}</option>
          ))}
        </select>

        <select
          className="k-input"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as Strategy)}
          style={{ width: 140 }}
        >
          <option value="tail">Last N</option>
          <option value="offset">From Offset</option>
          <option value="timestamp">From Timestamp</option>
        </select>

        {strategy === 'offset' && (
          <input
            className="k-input"
            type="number"
            min={0}
            placeholder="Offset"
            value={startOffset}
            onChange={(e) => setStartOffset(e.target.value)}
            style={{ width: 110 }}
          />
        )}

        {strategy === 'timestamp' && (
          <input
            className="k-input"
            type="datetime-local"
            value={startTimestamp}
            onChange={(e) => setStartTimestamp(e.target.value)}
            style={{ width: 190 }}
          />
        )}

        <select
          className="k-input"
          value={String(limit)}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ width: 100 }}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
        </select>

        <button
          onClick={handleFetch}
          disabled={isLoading}
          className="k-btn"
          style={{ opacity: isLoading ? 0.4 : 1 }}
        >
          {isLoading ? 'Loading…' : 'Fetch'}
        </button>

        <button
          onClick={() => setIsLive((v) => !v)}
          className="k-btn"
          style={{
            background: isLive ? 'color-mix(in srgb, var(--k-green) 20%, transparent)' : undefined,
            color: isLive ? 'var(--k-green)' : undefined,
            border: isLive ? '1px solid color-mix(in srgb, var(--k-green) 40%, transparent)' : undefined,
          }}
          title={isLive ? 'Stop live tail' : 'Start live tail (refresh every 5s)'}
        >
          ⟳ Live{isLive ? ' (on)' : ''}
        </button>

        <div style={{ flex: 1 }} />

        <input
          className="k-input"
          type="text"
          placeholder="Filter key / value…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ width: 180 }}
        />

        {messages.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--k-muted)', flexShrink: 0 }}>
            {filterText ? `${filteredMessages.length} / ` : ''}{messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Timestamp toggle + column header */}
      {filteredMessages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px' }}>
          <span style={{ width: 16, flexShrink: 0, fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>P</span>
          <span style={{ width: 80, flexShrink: 0, fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Offset</span>
          <button
            onClick={() => setShowAbsolute((v) => !v)}
            style={{ width: 120, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--k-accent)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.07em' }}
            title="Toggle absolute / relative time"
          >
            Time {showAbsolute ? '(abs)' : '(rel)'}
          </button>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Key</span>
          <span style={{ fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Size</span>
          <span style={{ width: 16 }} />
        </div>
      )}

      {/* Message list */}
      {filteredMessages.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--k-muted)', padding: '32px 0', textAlign: 'center' }}>
          {messages.length > 0
            ? 'No messages match the filter'
            : 'No messages fetched yet — click Fetch to load'}
        </p>
      ) : (
        <div style={{ border: '1px solid var(--k-border)', borderRadius: 6, overflow: 'hidden' }}>
          {filteredMessages.map((m) => (
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
                <span style={{ color: 'var(--k-muted)', width: 120, flexShrink: 0 }}>
                  {showAbsolute
                    ? new Date(m.timestamp).toLocaleString()
                    : relativeTime(m.timestamp)}
                </span>
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

                  {/* Value with copy button */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--k-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Value</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => copyToClipboard(m.value, `value-${key(m)}`)}
                        style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: copied === `value-${key(m)}` ? 'var(--k-green)' : 'var(--k-muted)' }}
                        title="Copy value"
                      >
                        {copied === `value-${key(m)}` ? 'Copied!' : 'Copy Value'}
                      </button>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(m, null, 2), `msg-${key(m)}`)}
                        style={{ background: 'none', border: '1px solid var(--k-border)', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: copied === `msg-${key(m)}` ? 'var(--k-green)' : 'var(--k-muted)' }}
                        title="Copy full message as JSON"
                      >
                        {copied === `msg-${key(m)}` ? 'Copied!' : 'Copy Message'}
                      </button>
                    </div>
                  </div>
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
