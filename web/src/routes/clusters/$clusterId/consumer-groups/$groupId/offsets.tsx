// Screen-8b: Consumer Group Offsets

import { useState, useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupOffset } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

function makeColumns(memberMap: Map<string, string>): Column<GroupOffset>[] {
  return [
    { key: 'topic', header: 'Topic' },
    { key: 'partition', header: 'P#', render: (o) => String(o.partition) },
    { key: 'committed_offset', header: 'Committed', render: (o) => formatNumber(o.committed_offset) },
    { key: 'log_end_offset', header: 'Log End', render: (o) => formatNumber(o.log_end_offset) },
    {
      key: 'lag',
      header: 'Lag',
      render: (o) => (
        <span className={cn(o.lag > 10_000 ? 'text-destructive' : o.lag > 1_000 ? 'text-amber-600' : '')}>
          {formatNumber(o.lag)}
          {o.lag > 10_000 && ' ⚠'}
        </span>
      ),
    },
    {
      key: 'member_id',
      header: 'Assigned Member',
      render: (o) => {
        const label = o.member_id ? (memberMap.get(o.member_id) ?? o.member_id) : '—'
        return <span className={cn('font-mono text-xs', !o.member_id && 'text-muted-foreground/40')}>{label}</span>
      },
    },
  ]
}

export function GroupOffsetsPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: group, isLoading, error } = useConsumerGroup(clusterId, groupId)
  const [topicFilter, setTopicFilter] = useState('')
  const [sortByLag, setSortByLag] = useState(false)

  const topics = useMemo(
    () => Array.from(new Set((group?.offsets ?? []).map((o) => o.topic))).sort(),
    [group],
  )

  const topicTotals = useMemo(() => {
    const all = group?.offsets ?? []
    const map = new Map<string, { partitions: number; maxLogEnd: number; lag: number }>()
    for (const o of all) {
      const existing = map.get(o.topic) ?? { partitions: 0, maxLogEnd: -1, lag: 0 }
      map.set(o.topic, {
        partitions: existing.partitions + 1,
        maxLogEnd: Math.max(existing.maxLogEnd, o.log_end_offset),
        lag: existing.lag + o.lag,
      })
    }
    return map
  }, [group])

  const memberMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of group?.members ?? []) {
      m.set(mem.id, mem.client_id || mem.id)
    }
    return m
  }, [group])

  const columns = useMemo(() => makeColumns(memberMap), [memberMap])

  const rows = useMemo(() => {
    let data = group?.offsets ?? []
    if (topicFilter) data = data.filter((o) => o.topic === topicFilter)
    if (sortByLag) data = [...data].sort((a, b) => b.lag - a.lag)
    return data
  }, [group, topicFilter, sortByLag])

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-3 items-center">
        <Select value={topicFilter || 'all'} onValueChange={(v) => setTopicFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics</SelectItem>
            {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={sortByLag}
            onChange={(e) => setSortByLag(e.target.checked)}
          />
          Sort by lag
        </label>
      </div>
      {/* Per-topic aggregate summary (shown when viewing all topics) */}
      {!topicFilter && topicTotals.size > 0 && (
        <div className="rounded-md border mb-3 overflow-hidden">
          <div className="grid px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/50" style={{ gridTemplateColumns: '1fr 80px 130px 100px' }}>
            <span>Topic</span>
            <span>Partitions</span>
            <span>Max Log End</span>
            <span className="text-right">Total Lag</span>
          </div>
          {Array.from(topicTotals.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([t, totals]) => (
            <div key={t} className="grid px-4 py-2 border-t items-center text-sm" style={{ gridTemplateColumns: '1fr 80px 130px 100px' }}>
              <span className="font-mono text-xs">{t}</span>
              <span className="text-muted-foreground font-mono text-xs">{totals.partitions}</span>
              <span className="text-muted-foreground font-mono text-xs">{formatNumber(totals.maxLogEnd)}</span>
              <span className={cn('font-mono text-xs text-right', totals.lag > 10_000 ? 'text-destructive' : totals.lag > 1_000 ? 'text-amber-600' : '')}>
                {formatNumber(totals.lag)}
                {totals.lag > 10_000 && ' ⚠'}
              </span>
            </div>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(o) => `${o.topic}-${o.partition}`}
        emptyMessage="No offset data"
      />
    </div>
  )
}
