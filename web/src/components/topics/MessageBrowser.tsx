// Browsing a topic: pick a partition and a starting point, fetch a page of
// messages, optionally tail them live. Searching the whole topic is a different
// activity with different controls and lives on its own tab — see MessageSearch.

import { useState, useEffect, useRef } from 'react'
import type { Message, PeekRequest } from '../../types/topic'
import { formatNumber } from '../../lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { cn } from '#/lib/utils'
import { MessageFilterInput, MessageList, filterMessages } from './MessageList'

const LIVE_INTERVALS = [
  { label: '1s',  ms: 1_000 },
  { label: '2s',  ms: 2_000 },
  { label: '5s',  ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m',  ms: 60_000 },
]

const FETCH_LIMITS = [10, 20, 50, 100, 200, 500]

type Strategy = 'tail' | 'offset' | 'timestamp'

interface MessageBrowserProps {
  messages: Message[]
  isLoading: boolean
  partitions: number[]
  initialPartition?: number
  isVisible?: boolean
  onFetch: (opts: PeekRequest) => void
}

export function MessageBrowser({
  messages,
  isLoading,
  partitions,
  initialPartition,
  isVisible = true,
  onFetch,
}: MessageBrowserProps) {
  const [limit, setLimit] = useState(20)
  const [partition, setPartition] = useState<string>(
    initialPartition != null ? String(initialPartition) : '',
  )
  const [strategy, setStrategy] = useState<Strategy>('tail')
  const [startOffset, setStartOffset] = useState('')
  const [startTimestamp, setStartTimestamp] = useState('')
  const [isLive, setIsLive] = useState(false)
  const [liveIntervalMs, setLiveIntervalMs] = useState(5_000)
  const [filterText, setFilterText] = useState('')
  const liveCallbackRef = useRef<() => void>(() => {})

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

  // Keep ref in sync with latest closure — no effect needed, refs are safe to assign during render
  liveCallbackRef.current = () => onFetch(buildOpts())

  useEffect(() => {
    if (!isLive || !isVisible) return
    liveCallbackRef.current()
    const id = setInterval(() => liveCallbackRef.current(), liveIntervalMs)
    return () => clearInterval(id)
  }, [isLive, liveIntervalMs, isVisible])

  const displayMessages = filterMessages(messages, filterText)

  return (
    <div className="flex flex-col gap-3 h-full">
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
          <SelectTrigger className="w-40" title="Where reading starts">
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
          <SelectTrigger className="w-24" title="How many messages to fetch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FETCH_LIMITS.map((n) => (
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
          title={isLive ? 'Stop live tail' : 'Start live tail'}
        >
          ⟳ Live{isLive ? ' (on)' : ''}
        </Button>

        {isLive && (
          <Select value={String(liveIntervalMs)} onValueChange={(v) => setLiveIntervalMs(Number(v))}>
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

        <div className="flex-1" />

        {messages.length > 0 && (
          <span className="text-sm text-muted-foreground flex-shrink-0">
            {formatNumber(messages.length)} msg{messages.length !== 1 ? 's' : ''} loaded
          </span>
        )}
      </div>

      {messages.length > 0 && (
        <MessageFilterInput
          value={filterText}
          onChange={setFilterText}
          total={messages.length}
          shown={displayMessages.length}
        />
      )}

      <MessageList
        messages={displayMessages}
        emptyMessage={
          filterText !== '' && messages.length > 0
            ? 'No loaded message matches the filter'
            : 'No messages fetched yet — click Fetch to load'
        }
      />
    </div>
  )
}
