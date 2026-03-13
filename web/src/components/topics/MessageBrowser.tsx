import { useState, useEffect, useRef } from 'react'
import type { Message, PeekRequest, SearchRequest, SearchResponse } from '../../types/topic'
import { formatBytes, relativeTime } from '../../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const LIVE_INTERVALS = [
  { label: '1s',  ms: 1_000 },
  { label: '2s',  ms: 2_000 },
  { label: '5s',  ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m',  ms: 60_000 },
]

type Strategy = 'tail' | 'offset' | 'timestamp'

interface MessageBrowserProps {
  messages: Message[]
  isLoading: boolean
  partitions: number[]
  initialPartition?: number
  onFetch: (opts: PeekRequest) => void
  onSearch: (opts: SearchRequest) => Promise<SearchResponse>
}

export function MessageBrowser({
  messages,
  isLoading,
  partitions,
  initialPartition,
  onFetch,
  onSearch,
}: MessageBrowserProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)
  const [partition, setPartition] = useState<string>(
    initialPartition != null ? String(initialPartition) : '',
  )
  const [strategy, setStrategy] = useState<Strategy>('tail')
  const [startOffset, setStartOffset] = useState('')
  const [startTimestamp, setStartTimestamp] = useState('')
  const [isLive, setIsLive] = useState(false)
  const [liveIntervalMs, setLiveIntervalMs] = useState(5_000)
  const [showAbsolute, setShowAbsolute] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const liveCallbackRef = useRef<() => void>(() => {})
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const cursorRef = useRef<string | null>(null)

  // Search mode state
  const [mode, setMode] = useState<'filter' | 'search'>('filter')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScanLimit, setSearchScanLimit] = useState(1000)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

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

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchError(null)
    setSearchResult(null)
    try {
      const opts: SearchRequest = { query: searchQuery.trim(), limit, scan_limit: searchScanLimit }
      if (partition !== '') opts.partition = Number(partition)
      if (strategy === 'offset' && startOffset !== '') opts.start_offset = Number(startOffset)
      if (strategy === 'timestamp' && startTimestamp !== '') opts.start_timestamp = new Date(startTimestamp).toISOString()
      const result = await onSearch(opts)
      setSearchResult(result)
    } catch (err) {
      setSearchError((err as Error).message)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    liveCallbackRef.current = () => onFetch(buildOpts())
  })

  useEffect(() => {
    if (!isLive) return
    liveCallbackRef.current()
    const id = setInterval(() => liveCallbackRef.current(), liveIntervalMs)
    return () => clearInterval(id)
  }, [isLive, liveIntervalMs])

  // Stop live mode when switching to search
  useEffect(() => {
    if (mode === 'search' && isLive) {
      setIsLive(false)
    }
  }, [mode])

  useEffect(() => {
    if (selectedKey === null) return
    if (!messages.some((m) => key(m) === selectedKey)) setSelectedKey(null)
  }, [messages])

  const filteredMessages = filterText
    ? messages.filter((m) => {
        const q = filterText.toLowerCase()
        return (m.key_encoding !== 'base64' && (m.key?.toLowerCase().includes(q) ?? false))
            || (m.value_encoding !== 'base64' && m.value.toLowerCase().includes(q))
      })
    : messages

  const displayMessages = mode === 'search'
    ? (searchResult?.messages ?? [])
    : filteredMessages

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (selectedKey !== null) { e.preventDefault(); setSelectedKey(null) }
      return
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (displayMessages.length === 0) return
    e.preventDefault()
    const cursor = selectedKey ?? cursorRef.current
    const idx = displayMessages.findIndex((m) => key(m) === cursor)
    let next: number
    if (idx === -1) {
      next = e.key === 'ArrowDown' ? 0 : displayMessages.length - 1
    } else {
      next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, displayMessages.length - 1)
        : Math.max(idx - 1, 0)
    }
    const nextKey = key(displayMessages[next])
    cursorRef.current = nextKey
    setSelectedKey(nextKey)
    const btn = rowRefs.current.get(nextKey)
    btn?.scrollIntoView({ block: 'nearest' })
    btn?.focus()
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const selectedMessage = selectedKey
    ? (messages.find((m) => key(m) === selectedKey) ?? searchResult?.messages.find((m) => key(m) === selectedKey) ?? null)
    : null

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

        {mode === 'filter' && (
          <>
            <Button onClick={handleFetch} disabled={isLoading} size="sm">
              {isLoading ? 'Loading…' : 'Fetch'}
            </Button>

            <Button
              onClick={() => setIsLive((v) => !v)}
              size="sm"
              variant={isLive ? 'default' : 'outline'}
              className={cn(isLive && 'bg-green-600 hover:bg-green-700 text-white border-green-600')}
              title={isLive ? 'Stop live tail' : 'Start live tail'}
            >
              ⟳ Live{isLive ? ' (on)' : ''}
            </Button>

            {isLive && (
              <Select
                value={String(liveIntervalMs)}
                onValueChange={(v) => setLiveIntervalMs(Number(v))}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIVE_INTERVALS.map(({ label, ms }) => (
                    <SelectItem key={ms} value={String(ms)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center rounded-md border border-border text-xs overflow-hidden shrink-0">
          <button
            onClick={() => setMode('filter')}
            className={cn(
              'px-3 py-1.5 transition-colors',
              mode === 'filter' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Filter
          </button>
          <button
            onClick={() => setMode('search')}
            className={cn(
              'px-3 py-1.5 border-l border-border transition-colors',
              mode === 'search' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Search
          </button>
        </div>

        {/* Filter mode input */}
        {mode === 'filter' && (
          <>
            <Input
              type="text"
              placeholder="Filter key / value…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-44 h-8"
            />
            {messages.length > 0 && (
              <span className="text-sm text-muted-foreground flex-shrink-0">
                {filterText ? `${filteredMessages.length} / ` : ''}{messages.length} msg{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </>
        )}

        {/* Search mode inputs */}
        {mode === 'search' && (
          <>
            <Input
              placeholder='user.id == "abc"  ·  latency > 100  ·  user.premium (exists)  ·  plain text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 min-w-48 h-8 font-mono text-xs"
            />
            <Select value={String(searchScanLimit)} onValueChange={(v) => setSearchScanLimit(Number(v))}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[500, 1000, 2000, 5000].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">Scan {n.toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} size="sm" className="h-8">
              {isSearching ? 'Searching…' : 'Search'}
            </Button>
          </>
        )}
      </div>

      {/* Search results summary / error */}
      {mode === 'search' && searchResult && (
        <div className="text-xs text-muted-foreground">
          Found <span className="text-foreground font-medium">{searchResult.matched}</span> match
          {searchResult.matched !== 1 ? 'es' : ''} in{' '}
          <span className="text-foreground font-medium">{searchResult.scanned.toLocaleString()}</span> scanned
          {' '}·{' '}
          <span className="text-foreground font-medium">
            {searchResult.duration_ms < 1000
              ? `${searchResult.duration_ms}ms`
              : `${(searchResult.duration_ms / 1000).toFixed(1)}s`}
          </span>
          {searchResult.truncated && searchResult.scanned >= searchScanLimit && (
            <span className="text-amber-600 dark:text-amber-400"> · scan limit reached</span>
          )}
        </div>
      )}
      {mode === 'search' && searchError && (
        <p className="text-xs text-destructive">{searchError}</p>
      )}

      {/* Column headers + list + detail panel side-by-side */}
      <div className="flex gap-3 min-h-0">
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Column headers */}
          {displayMessages.length > 0 && (
            <div className="flex items-center gap-4 px-4">
              <span className="w-4 flex-shrink-0 text-xs text-muted-foreground uppercase tracking-wide">P</span>
              <span className="w-20 flex-shrink-0 text-xs text-muted-foreground uppercase tracking-wide">Offset</span>
              <div className={cn('flex-shrink-0', showAbsolute ? 'w-44' : 'w-28')}>
                <button
                  onClick={() => setShowAbsolute((v) => !v)}
                  className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none p-0"
                  title="Toggle relative / absolute time"
                >
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Time</span>
                  <span className="flex items-center rounded border border-border overflow-hidden">
                    <span className={cn('px-1.5 py-0.5 text-xs transition-colors', !showAbsolute ? 'bg-muted text-foreground' : 'text-muted-foreground')}>Rel</span>
                    <span className={cn('px-1.5 py-0.5 text-xs transition-colors', showAbsolute ? 'bg-muted text-foreground' : 'text-muted-foreground')}>Abs</span>
                  </span>
                </button>
              </div>
              <span className="flex-1 text-xs text-muted-foreground uppercase tracking-wide">Key</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Size</span>
            </div>
          )}

          {/* Message list */}
          {displayMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {mode === 'search' && !searchResult
                ? 'Enter a query and click Search'
                : mode === 'search' && searchResult
                ? 'No messages matched the query'
                : messages.length > 0
                ? 'No messages match the filter'
                : 'No messages fetched yet — click Fetch to load'}
            </p>
          ) : (
            <div
              role="listbox"
              aria-label="Messages"
              className="rounded-md border overflow-hidden"
              onKeyDown={handleListKeyDown}
            >
              {displayMessages.map((m, i) => (
                <button
                  key={key(m)}
                  role="option"
                  aria-selected={selectedKey === key(m)}
                  tabIndex={selectedKey === key(m) || (selectedKey === null && i === 0) ? 0 : -1}
                  ref={(el) => { if (el) rowRefs.current.set(key(m), el); else rowRefs.current.delete(key(m)) }}
                  onClick={() => {
                    const k = key(m)
                    cursorRef.current = k
                    setSelectedKey(selectedKey === k ? null : k)
                  }}
                  className={cn(
                    'flex items-center gap-4 px-4 py-2 text-xs w-full text-left bg-transparent border-none border-b last:border-b-0 cursor-pointer text-foreground transition-colors',
                    selectedKey === key(m) ? 'bg-muted/60' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="text-muted-foreground w-4 flex-shrink-0">{m.partition}</span>
                  <span className="text-muted-foreground w-20 flex-shrink-0 font-mono">{m.offset}</span>
                  <span className={cn('text-muted-foreground flex-shrink-0', showAbsolute ? 'w-44' : 'w-28')}>
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
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedMessage && (
          <MessageDetailPanel
            message={selectedMessage}
            onClose={() => setSelectedKey(null)}
            copied={copied}
            onCopy={copyToClipboard}
          />
        )}
      </div>
    </div>
  )
}

interface MessageDetailPanelProps {
  message: Message
  onClose: () => void
  copied: string | null
  onCopy: (text: string, label: string) => Promise<void>
}

function MessageDetailPanel({ message, onClose, copied, onCopy }: MessageDetailPanelProps) {
  const msgKey = `${message.partition}-${message.offset}`
  const formattedValue = message.value_encoding === 'base64'
    ? null
    : (() => { try { return JSON.stringify(JSON.parse(message.value), null, 2) } catch { return message.value } })()

  return (
    <div className="w-[420px] flex-shrink-0 rounded-md border border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-medium">
          Partition {message.partition} · Offset <span className="font-mono">{message.offset}</span>
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Time</p>
            <p className="text-xs">{new Date(message.timestamp).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Size</p>
            <p className="text-xs font-mono">{formatBytes(message.size)}</p>
          </div>
        </div>

        <Separator />

        {/* Key */}
        {message.key != null && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Key</p>
            <pre className="text-xs bg-muted rounded px-3 py-2 m-0 font-mono whitespace-pre-wrap break-all">
              {message.key_encoding === 'base64'
                ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
                : message.key}
            </pre>
          </div>
        )}

        {/* Value */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Value</p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={cn('h-6 px-2 text-xs', copied === `value-${msgKey}` && 'text-green-600')}
                onClick={() => onCopy(message.value, `value-${msgKey}`)}
              >
                {copied === `value-${msgKey}` ? 'Copied!' : 'Copy Value'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn('h-6 px-2 text-xs', copied === `msg-${msgKey}` && 'text-green-600')}
                onClick={() => onCopy(JSON.stringify(message, null, 2), `msg-${msgKey}`)}
              >
                {copied === `msg-${msgKey}` ? 'Copied!' : 'Copy Message'}
              </Button>
            </div>
          </div>
          <pre className="text-xs bg-muted rounded px-3 py-2 m-0 font-mono whitespace-pre-wrap break-all">
            {message.value_encoding === 'base64'
              ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
              : formattedValue}
          </pre>
        </div>

        {/* Headers */}
        {Object.keys(message.headers).length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Headers</p>
              <div className="flex flex-col gap-1">
                {Object.entries(message.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-xs font-mono">
                    <span className="text-muted-foreground min-w-28">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
