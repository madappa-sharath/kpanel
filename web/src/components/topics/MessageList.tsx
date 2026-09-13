// Shared message-list plumbing: the row table, its keyboard navigation and
// selection, the detail panel, and the plain-text filter that narrows whatever
// rows are on screen. Used by both MessageBrowser (browsing) and MessageSearch
// (topic search) so the two stay visually identical below their own controls.

import { useRef, useState } from 'react'
import { ListFilter, X } from 'lucide-react'
import type { Message } from '../../types/topic'
import { formatBytes, formatNumber, relativeTime } from '../../lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'
import { useCopyToClipboard } from '#/hooks/useCopyToClipboard'

/** Plain-text narrowing of rows already on screen. Deliberately has no syntax
 *  help: it only does substrings, unlike the topic-search query language. */
export function MessageFilterInput({
  value,
  onChange,
  total,
  shown,
}: {
  value: string
  onChange: (next: string) => void
  total: number
  shown: number
}) {
  return (
    // px-0.5 keeps the focus ring clear of the parent column's overflow-hidden
    <div className="flex items-center gap-2 justify-end px-0.5">
      {value !== '' && (
        <span className="text-xs text-muted-foreground">
          {formatNumber(shown)} of {formatNumber(total)}
        </span>
      )}
      <div className="relative w-64">
        <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder={`Filter these ${formatNumber(total)} by text…`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onChange('') }}
          className="h-7 pl-8 pr-7 text-xs"
        />
        {value !== '' && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Case-insensitive substring match over key and value, skipping binary. */
export function filterMessages(messages: Message[], text: string): Message[] {
  if (text === '') return messages
  const q = text.toLowerCase()
  return messages.filter(
    (m) =>
      (m.key_encoding !== 'base64' && (m.key?.toLowerCase().includes(q) ?? false)) ||
      (m.value_encoding !== 'base64' && m.value.toLowerCase().includes(q)),
  )
}

export function MessageList({ messages, emptyMessage }: { messages: Message[]; emptyMessage: string }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showAbsolute, setShowAbsolute] = useState(false)
  const { copy, isCopied } = useCopyToClipboard()
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const cursorRef = useRef<string | null>(null)

  const key = (m: Message) => `${m.partition}-${m.offset}`

  // Derive the effective selection during render — no effect needed to clear a
  // selection whose row is no longer in the list.
  const effectiveSelectedKey = (selectedKey !== null && messages.some((m) => key(m) === selectedKey))
    ? selectedKey
    : null

  const selectedMessage = effectiveSelectedKey
    ? (messages.find((m) => key(m) === effectiveSelectedKey) ?? null)
    : null

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (effectiveSelectedKey !== null) { e.preventDefault(); setSelectedKey(null) }
      return
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (messages.length === 0) return
    e.preventDefault()
    const cursor = effectiveSelectedKey ?? cursorRef.current
    const idx = messages.findIndex((m) => key(m) === cursor)
    let next: number
    if (idx === -1) {
      next = e.key === 'ArrowDown' ? 0 : messages.length - 1
    } else {
      next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, messages.length - 1)
        : Math.max(idx - 1, 0)
    }
    const nextKey = key(messages[next])
    cursorRef.current = nextKey
    setSelectedKey(nextKey)
    const btn = rowRefs.current.get(nextKey)
    btn?.scrollIntoView({ block: 'nearest' })
    btn?.focus()
  }

  return (
    <div className="flex-1 flex gap-3 min-h-0">
      <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Column headers */}
        {messages.length > 0 && (
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
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
        ) : (
          <div
            role="listbox"
            aria-label="Messages"
            className="rounded-md border flex-1 overflow-y-auto"
            onKeyDown={handleListKeyDown}
          >
            {messages.map((m, i) => (
              <button
                key={key(m)}
                role="option"
                aria-selected={effectiveSelectedKey === key(m)}
                tabIndex={effectiveSelectedKey === key(m) || (effectiveSelectedKey === null && i === 0) ? 0 : -1}
                ref={(el) => { if (el) rowRefs.current.set(key(m), el); else rowRefs.current.delete(key(m)) }}
                onClick={() => {
                  const k = key(m)
                  cursorRef.current = k
                  setSelectedKey(effectiveSelectedKey === k ? null : k)
                  rowRefs.current.get(k)?.scrollIntoView({ block: 'nearest' })
                }}
                className={cn(
                  'flex items-center gap-4 px-4 py-2 text-xs w-full text-left bg-transparent border-none border-b last:border-b-0 cursor-pointer text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  effectiveSelectedKey === key(m) ? 'bg-muted/60 border-l-2 border-primary' : 'hover:bg-muted/40 border-l-2 border-transparent',
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
          isCopied={isCopied}
          onCopy={copy}
        />
      )}
    </div>
  )
}

interface MessageDetailPanelProps {
  message: Message
  onClose: () => void
  isCopied: (key?: string) => boolean
  onCopy: (text: string, key?: string) => Promise<void>
}

function MessageDetailPanel({ message, onClose, isCopied, onCopy }: MessageDetailPanelProps) {
  const msgKey = `${message.partition}-${message.offset}`
  const headerEntries = Object.entries(message.headers)
  const formattedValue = message.value_encoding === 'base64'
    ? null
    : (() => { try { return JSON.stringify(JSON.parse(message.value), null, 2) } catch { return message.value } })()

  return (
    <div className="w-full md:w-[420px] flex-shrink-0 rounded-md border border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-medium">
          Partition {message.partition} · Offset <span className="font-mono">{message.offset}</span>
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Key</p>
          {message.key == null ? (
            <p className="text-xs text-muted-foreground italic">(null)</p>
          ) : (
            <>
              <pre className="text-xs bg-muted rounded px-3 py-2 m-0 font-mono whitespace-pre-wrap break-all">
                {message.key_encoding === 'base64'
                  ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
                  : message.key}
              </pre>
              {message.key_encoding !== 'base64' && (
                <Button variant="outline" size="sm" className={cn('h-6 px-2 text-xs mt-1 self-start', isCopied(`key-${msgKey}`) && 'text-green-600')}
                  onClick={() => onCopy(message.key!, `key-${msgKey}`)}>
                  {isCopied(`key-${msgKey}`) ? 'Copied!' : 'Copy Key'}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Headers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Headers</p>
            {headerEntries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className={cn('h-6 px-2 text-xs', isCopied(`headers-${msgKey}`) && 'text-green-600')}
                onClick={() => onCopy(JSON.stringify(message.headers, null, 2), `headers-${msgKey}`)}
              >
                {isCopied(`headers-${msgKey}`) ? 'Copied!' : 'Copy Headers'}
              </Button>
            )}
          </div>
          {headerEntries.length > 0 ? (
            <div className="flex flex-col gap-1 rounded bg-muted px-3 py-2">
              {headerEntries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-xs font-mono">
                  <span className="text-muted-foreground break-all">{k}</span>
                  <span className="break-all">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">(none)</p>
          )}
        </div>

        {/* Value */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Value</p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={cn('h-6 px-2 text-xs', isCopied(`value-${msgKey}`) && 'text-green-600')}
                onClick={() => onCopy(message.value, `value-${msgKey}`)}
              >
                {isCopied(`value-${msgKey}`) ? 'Copied!' : 'Copy Value'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn('h-6 px-2 text-xs', isCopied(`msg-${msgKey}`) && 'text-green-600')}
                onClick={() => onCopy(JSON.stringify(message, null, 2), `msg-${msgKey}`)}
              >
                {isCopied(`msg-${msgKey}`) ? 'Copied!' : 'Copy Message'}
              </Button>
            </div>
          </div>
          <pre className="max-h-[45vh] overflow-auto text-xs bg-muted rounded px-3 py-2 m-0 font-mono whitespace-pre-wrap break-all">
            {message.value_encoding === 'base64'
              ? <span className="text-muted-foreground italic">[binary — base64 encoded]</span>
              : formattedValue}
          </pre>
        </div>
      </div>
    </div>
  )
}
