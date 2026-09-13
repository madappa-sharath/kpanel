// Searching a whole topic on the broker. Its own tab, not a mode of the message
// browser: a search has its own inputs (query, scan budget, max results) and the
// browser's Fetch / Live / page-size controls mean nothing here.
//
// Results are sticky. Editing the query leaves the last results on screen and
// marks them stale, so refining a query never throws you back to another view.

import { useState } from 'react'
import { CircleHelp, Search } from 'lucide-react'
import type { SearchRequest, SearchResponse } from '../../types/topic'
import { formatNumber } from '../../lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { MessageFilterInput, MessageList, filterMessages } from './MessageList'

// How many messages one search may read. The server clamps to the same ceiling;
// bigger scans reach further back but take longer.
const SCAN_LIMITS = [500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000]

const RESULT_LIMITS = [20, 50, 100, 200, 500]

type Strategy = 'tail' | 'offset' | 'timestamp'

/** Every input that changes the request a search sends. */
interface SearchParams {
  query: string
  partition: string
  strategy: Strategy
  startOffset: string
  startTimestamp: string
  scanLimit: number
  limit: number
}

function sameParams(a: SearchParams, b: SearchParams): boolean {
  return a.query === b.query
    && a.partition === b.partition
    && a.strategy === b.strategy
    && a.scanLimit === b.scanLimit
    && a.limit === b.limit
    // A start value only matters to the strategy that reads it
    && (a.strategy !== 'offset' || a.startOffset === b.startOffset)
    && (a.strategy !== 'timestamp' || a.startTimestamp === b.startTimestamp)
}

interface MessageSearchProps {
  partitions: number[]
  onSearch: (opts: SearchRequest) => Promise<SearchResponse>
}

export function MessageSearch({ partitions, onSearch }: MessageSearchProps) {
  const [query, setQuery] = useState('')
  const [partition, setPartition] = useState('')
  const [strategy, setStrategy] = useState<Strategy>('tail')
  const [startOffset, setStartOffset] = useState('')
  const [startTimestamp, setStartTimestamp] = useState('')
  const [scanLimit, setScanLimit] = useState(1000)
  const [limit, setLimit] = useState(20)

  const [result, setResult] = useState<SearchResponse | null>(null)
  // Everything the displayed results were produced with. Reporting live state
  // against old results would relabel them with parameters never sent.
  const [ran, setRan] = useState<SearchParams | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [filterText, setFilterText] = useState('')

  const trimmedQuery = query.trim()
  const current: SearchParams = {
    query: trimmedQuery, partition, strategy, startOffset, startTimestamp, scanLimit, limit,
  }
  // Results stay put while any input is edited; they are just labelled stale.
  const isStale = ran !== null && !sameParams(ran, current)

  async function handleSearch() {
    if (!trimmedQuery || isSearching) return
    setIsSearching(true)
    setError(null)
    try {
      const opts: SearchRequest = { query: trimmedQuery, limit, scan_limit: scanLimit }
      if (partition !== '') opts.partition = Number(partition)
      if (strategy === 'offset' && startOffset !== '') opts.start_offset = Number(startOffset)
      if (strategy === 'timestamp' && startTimestamp !== '') opts.start_timestamp = new Date(startTimestamp).toISOString()
      const next = await onSearch(opts)
      setResult(next)
      setRan(current)
      setFilterText('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSearching(false)
    }
  }

  const resultMessages = result?.messages ?? []
  const displayMessages = filterMessages(resultMessages, filterText)

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Query — the primary input, on its own line so it reads as the subject
          of this page rather than one control among many. */}
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Find text anywhere in a message, or user.id == &quot;abc&quot;"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            className="h-10 pl-10 font-mono text-sm"
          />
        </div>
        <Button onClick={handleSearch} disabled={isSearching || trimmedQuery === ''} className="h-10 min-w-28">
          {isSearching ? 'Searching…' : 'Search'}
        </Button>
        <SearchSyntaxHelp />
      </div>

      {/* Scope — what this search covers. Every control here changes the request. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wide mr-1">Scope</span>

        <Select value={partition || 'all'} onValueChange={(v) => setPartition(v === 'all' ? '' : v)} disabled={partitions.length === 0}>
          <SelectTrigger className="h-8 w-36 text-xs" title="Restrict the search to one partition">
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
          <SelectTrigger className="h-8 w-40 text-xs" title="Where the scan starts reading">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tail">From newest</SelectItem>
            <SelectItem value="offset">From offset</SelectItem>
            <SelectItem value="timestamp">From timestamp</SelectItem>
          </SelectContent>
        </Select>

        {strategy === 'offset' && (
          <Input type="number" min={0} placeholder="Offset" value={startOffset} onChange={(e) => setStartOffset(e.target.value)} className="h-8 w-28 text-xs" />
        )}
        {strategy === 'timestamp' && (
          <Input type="datetime-local" value={startTimestamp} onChange={(e) => setStartTimestamp(e.target.value)} className="h-8 w-48 text-xs" />
        )}

        <Select value={String(scanLimit)} onValueChange={(v) => setScanLimit(Number(v))}>
          <SelectTrigger className="h-8 w-36 text-xs" title="How many messages this search may read">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCAN_LIMITS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">Scan {formatNumber(n)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="h-8 w-36 text-xs" title="Most matches to return">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESULT_LIMITS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">Max {formatNumber(n)} results</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      {/* Result summary */}
      {result !== null && ran !== null && (
        <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap rounded-md border border-border bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{formatNumber(result.matched)}</span>
            {' '}match{result.matched !== 1 ? 'es' : ''} for{' '}
            <span className="text-foreground font-mono">{ran.query}</span> · scanned{' '}
            <span className="text-foreground font-medium">{formatNumber(result.scanned)}</span>
            {result.searchable > result.scanned && <> of {formatNumber(result.searchable)}</>}
            {' '}·{' '}
            {result.duration_ms < 1000
              ? `${result.duration_ms}ms`
              : `${(result.duration_ms / 1000).toFixed(1)}s`}
          </span>

          {/* Name the ceiling that stopped the scan, so the fix is obvious */}
          {result.timed_out ? (
            <span className="text-amber-600 dark:text-amber-400">
              · timed out — partial results, try a smaller scan or a narrower scope
            </span>
          ) : result.limit_reached ? (
            <span className="text-amber-600 dark:text-amber-400">
              · stopped at {formatNumber(ran.limit)} results — raise Max results to see more
            </span>
          ) : result.truncated ? (
            <span className="text-amber-600 dark:text-amber-400">
              · older messages not searched — widen Scan to reach further back
            </span>
          ) : null}

          <div className="flex-1" />

          {isStale && (
            <span className="text-amber-600 dark:text-amber-400">
              Search options changed — press ⏎ to run again
            </span>
          )}
        </div>
      )}

      {resultMessages.length > 0 && (
        <MessageFilterInput
          value={filterText}
          onChange={setFilterText}
          total={resultMessages.length}
          shown={displayMessages.length}
        />
      )}

      <MessageList
        messages={displayMessages}
        emptyMessage={
          filterText !== '' && resultMessages.length > 0
            ? 'No result matches the filter'
            : result === null
            ? 'Enter a query and press ⏎ to search this topic'
            : result.truncated
            ? `Nothing matched in the ${formatNumber(result.scanned)} messages scanned — widen Scan, or start from an earlier offset or timestamp`
            : 'No message in this topic matched the query'
        }
      />
    </div>
  )
}

/** Query syntax reference. Mirrors parseQuery in
 *  server/internal/api/filter.go — keep the two in step. */
const SYNTAX_SECTIONS: { title: string; note?: string; rows: { query: string; desc: string }[] }[] = [
  {
    title: 'Text',
    note: 'Matched anywhere in the key or value, case-insensitively. No field name needed.',
    rows: [
      { query: 'payment declined', desc: 'messages containing this text' },
      { query: 'order-4821', desc: 'an id, in the key or anywhere in the body' },
      { query: '"10.0.4.17"', desc: 'quote text containing . > < = so it is read literally' },
      { query: '$100 refund', desc: 'a leading $ is text too — only $. marks a field path' },
    ],
  },
  {
    title: 'JSON fields',
    note: 'For messages whose value is JSON. Dotted paths index into nested objects.',
    rows: [
      { query: 'user.id == "abc"', desc: 'equals — text, number or true / false' },
      { query: 'status != "done"', desc: 'not equals' },
      { query: 'latency > 100', desc: 'compare numbers — also >= < <=' },
      { query: 'name ~= "kafka"', desc: 'field contains text' },
      { query: '$.user.premium', desc: 'field is present — the $. prefix is required' },
    ],
  },
]

function SearchSyntaxHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          title="Query syntax"
          aria-label="Query syntax"
          className="h-10 w-10 p-0 text-muted-foreground shrink-0"
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] p-0">
        <div className="max-h-[70vh] overflow-y-auto">
          {SYNTAX_SECTIONS.map((section) => (
            <div key={section.title} className="px-4 py-3 border-b border-border last:border-b-0">
              <p className="text-xs font-medium">{section.title}</p>
              {section.note && <p className="text-xs text-muted-foreground mt-0.5">{section.note}</p>}
              <div className="mt-2 flex flex-col gap-1.5">
                {section.rows.map((row) => (
                  <div key={row.query} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 items-baseline">
                    <code className="justify-self-start font-mono text-xs bg-muted rounded px-1.5 py-0.5 break-all">{row.query}</code>
                    <span className="text-xs text-muted-foreground">{row.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
            A search reads back from the newest message up to the scan budget. Widen Scan, or set a
            starting offset or timestamp, to reach further back.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
