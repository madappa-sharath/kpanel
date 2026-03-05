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
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(o) => `${o.topic}-${o.partition}`}
        emptyMessage="No offset data"
      />
    </div>
  )
}
