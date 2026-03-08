import { useState, useEffect, useRef } from 'react'
import type { Message, PeekRequest } from '../../types/topic'
import { formatBytes, relativeTime } from '../../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Strategy = 'tail' | 'offset' | 'timestamp'

interface MessageBrowserProps {
  messages: Message[]
  isLoading: boolean
  partitions: number[]
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
  const liveCallbackRef = useRef<() => void>(() => {})

  const key = (m: Message) => `${m.partition}-${m.offset}`

  function buildOpts(): PeekRequest {
    const opts: PeekRequest = {
      limit,
      partition: partition === '' ? undefined : Number(partition),
    }
    if (strategy === 'offset' && startOffset !== '') opts.start_offset = Number(startOffset)
    if (strategy === 'timestamp' && startTimestamp !== '') opts.start_timestamp = new Date(startTimestamp).toISOString()
    return opts
  }

  function handleFetch() { onFetch(buildOpts()) }

  liveCallbackRef.current = () => onFetch(buildOpts())

  useEffect(() => {
    if (isLive) {
      liveIntervalRef.current = setInterval(() => liveCallbackRef.current(), 5000)
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
    }
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current) }
  }, [isLive])

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const filteredMessages = filterText
    ? messages.filter((m) => {
        const q = filterText.toLowerCase()
        return (m.key_encoding !== 'base64' && (m.key?.toLowerCase().includes(q) ?? false))
            || (m.value_encoding !== 'base64' && m.value.toLowerCase().includes(q))
      })
    : messages

  return (
    <div className="flex flex-col gap-3">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={partition || 'all'} onValueChange={(v) => setPartition(v === 'all' ? '' : v)} disabled={partitions.length === 0}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All partitions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partitions</SelectItem>
            {partitions.map((p) => (
              <SelectItem key={p} value={String(p)}>Partition {p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tail">Last N</SelectItem>
            <SelectItem value="offset">From Offset</SelectItem>
            <SelectItem value="timestamp">From Timestamp</SelectItem>
          </SelectContent>
        </Select>

        {strategy === 'offset' && (
          <Input type="number" min={0} placeholder="Offset" value={startOffset} onChange={(e) => setStartOffset(e.target.value)} className="w-28" />
        )}
        {strategy === 'timestamp' && (
          <Input type="datetime-local" value={startTimestamp} onChange={(e) => setStartTimestamp(e.target.value)} className="w-48" />
        )}

        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100, 200, 500].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleFetch} disabled={isLoading} size="sm">
          {isLoading ? 'Loading…' : 'Fetch'}
        </Button>

        <Button
          onClick={() => setIsLive((v) => !v)}
          size="sm"
          variant={isLive ? 'default' : 'outline'}
          className={cn(isLive && 'bg-green-600 hover:bg-green-700 text-white border-green-600')}
          title={isLive ? 'Stop live tail' : 'Start live tail (refresh every 5s)'}
        >
          ⟳ Live{isLive ? ' (on)' : ''}
        </Button>

        <div className="flex-1" />

        <Input
          type="text"
          placeholder="Filter key / value…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="w-44"
        />

        {messages.length > 0 && (
          <span className="text-sm text-muted-foreground flex-shrink-0">
            {filterText ? `${filteredMessages.length} / ` : ''}{messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Column headers */}
      {filteredMessages.length > 0 && (
        <div className="flex items-center gap-4 px-4">
          <span className="w-4 flex-shrink-0 text-xs text-muted-foreground uppercase tracking-wide">P</span>
          <span className="w-20 flex-shrink-0 text-xs text-muted-foreground uppercase tracking-wide">Offset</span>
          <button
            onClick={() => setShowAbsolute((v) => !v)}
            className="w-28 flex-shrink-0 bg-transparent border-none p-0 cursor-pointer text-xs text-muted-foreground uppercase tracking-wide text-left hover:text-foreground transition-colors"
            title="Toggle absolute / relative time"
          >
            Time {showAbsolute ? '(abs)' : '(rel)'}
          </button>
          <span className="flex-1 text-xs text-muted-foreground uppercase tracking-wide">Key</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Size</span>
          <span className="w-4" />
        </div>
      )}

      {/* Message list */}
      {filteredMessages.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {messages.length > 0
            ? 'No messages match the filter'
            : 'No messages fetched yet — click Fetch to load'}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          {filteredMessages.map((m) => (
            <div key={key(m)} className="border-b last:border-b-0">
              <button
                onClick={() => setExpanded(expanded === key(m) ? null : key(m))}
                className="flex items-center gap-4 px-4 py-2 text-xs w-full text-left bg-transparent border-none cursor-pointer text-foreground hover:bg-muted/40 transition-colors"
              >
                <span className="text-muted-foreground w-4 flex-shrink-0">{m.partition}</span>
                <span className="text-muted-foreground w-20 flex-shrink-0 font-mono">{m.offset}</span>
                <span className="text-muted-foreground w-28 flex-shrink-0">
                  {showAbsolute ? new Date(m.timestamp).toLocaleString() : relativeTime(m.timestamp)}
                </span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                  {m.key == null
                    ? <span className="text-muted-foreground">(null)</span>
                    : m.key_encoding === 'base64'
                      ? <span className="text-muted-foreground italic">[binary key]</span>
                      : m.key}
                </span>
                <span className="text-muted-foreground flex-shrink-0">{formatBytes(m.size)}</span>
                <span className="text-muted-foreground/40 w-4 text-right flex-shrink-0">
                  {expanded === key(m) ? '▲' : '▼'}
                </span>
              </button>

              {expanded === key(m) && (
                <div className="px-4 pb-3 border-t bg-muted/20">
                  {m.key && (
                    <div className="mb-2">
                      <p className="mt-2 mb-1 text-xs text-muted-foreground uppercase tracking-wide">Key</p>
                      <pre className="text-xs bg-muted rounded px-3 py-2 m-0 font-mono overflow-x-auto">
                        {m.key_encoding === 'base64'
                          ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
                          : m.key}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2 mt-2">
                    <p className="mb-1 text-xs text-muted-foreground uppercase tracking-wide">Value</p>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('h-6 px-2 text-xs', copied === `value-${key(m)}` && 'text-green-600')}
                        onClick={() => copyToClipboard(m.value, `value-${key(m)}`)}
                      >
                        {copied === `value-${key(m)}` ? 'Copied!' : 'Copy Value'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('h-6 px-2 text-xs', copied === `msg-${key(m)}` && 'text-green-600')}
                        onClick={() => copyToClipboard(JSON.stringify(m, null, 2), `msg-${key(m)}`)}
                      >
                        {copied === `msg-${key(m)}` ? 'Copied!' : 'Copy Message'}
                      </Button>
                    </div>
                  </div>
                  <pre className="text-xs bg-muted rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap m-0 font-mono">
                    {m.value_encoding === 'base64'
                      ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
                      : (() => { try { return JSON.stringify(JSON.parse(m.value), null, 2) } catch { return m.value } })()
                    }
                  </pre>

                  {Object.keys(m.headers).length > 0 && (
                    <>
                      <p className="mt-2 mb-1 text-xs text-muted-foreground uppercase tracking-wide">Headers</p>
                      <div className="flex flex-col gap-1">
                        {Object.entries(m.headers).map(([k, v]) => (
                          <div key={k} className="flex gap-3 text-xs font-mono">
                            <span className="text-muted-foreground min-w-28">{k}</span>
                            <span>{v}</span>
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
