// Screen-8b: Consumer Group Offsets

import { useState, useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import type { GroupOffset } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'


function LagValue({ lag }: { lag: number }) {
  return (
    <span className={cn('font-mono text-xs tabular-nums', lag > 10_000 ? 'text-destructive font-medium' : lag > 1_000 ? 'text-amber-500' : 'text-muted-foreground')}>
      {formatNumber(lag)}
      {lag > 10_000 && ' ⚠'}
    </span>
  )
}

type TopicGroup = {
  topic: string
  partitions: GroupOffset[]
  totalLag: number
  maxLogEnd: number
}

function TopicRow({
  group,
  expanded,
  onToggle,
  memberMap,
}: {
  group: TopicGroup
  expanded: boolean
  onToggle: () => void
  memberMap: Map<string, string>
}) {
  return (
    <>
      {/* Topic summary row */}
      <tr
        className="border-b cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 w-6">
          <ChevronRight
            size={14}
            className={cn('text-muted-foreground transition-transform duration-150', expanded && 'rotate-90')}
          />
        </td>
        <td className="px-4 py-2.5 font-mono text-sm font-medium">{group.topic}</td>
        <td className="px-4 py-2.5 text-muted-foreground text-sm tabular-nums">{group.partitions.length}</td>
        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs tabular-nums">—</td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(group.maxLogEnd)}</td>
        <td className="px-4 py-2.5">
          <LagValue lag={group.totalLag} />
        </td>
        <td className="px-4 py-2.5" />
      </tr>

      {/* Partition detail rows */}
      {expanded && group.partitions.map((o) => {
        const memberLabel = o.member_id ? (memberMap.get(o.member_id) ?? o.member_id) : null
        return (
          <tr key={`${o.topic}-${o.partition}`} className="border-b bg-muted/20 hover:bg-muted/30">
            <td className="px-4 py-2" />
            <td className="px-4 py-2 text-muted-foreground text-xs pl-8">partition</td>
            <td className="px-4 py-2 font-mono text-xs tabular-nums">{o.partition}</td>
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(o.committed_offset)}</td>
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(o.log_end_offset)}</td>
            <td className="px-4 py-2">
              <LagValue lag={o.lag} />
            </td>
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground truncate max-w-[180px]">
              {memberLabel ?? <span className="opacity-30">—</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

export function GroupOffsetsPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: group, isLoading, error } = useConsumerGroup(clusterId, groupId)
  const [topicFilter, setTopicFilter] = useState('')
  const [sortByLag, setSortByLag] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  const topicGroups: TopicGroup[] = useMemo(() => {
    const all = group?.offsets ?? []
    const map = new Map<string, GroupOffset[]>()
    for (const o of all) {
      if (!map.has(o.topic)) map.set(o.topic, [])
      map.get(o.topic)!.push(o)
    }
    let groups = Array.from(map.entries()).map(([topic, partitions]) => ({
      topic,
      partitions: partitions.sort((a, b) => a.partition - b.partition),
      totalLag: partitions.reduce((s, p) => s + p.lag, 0),
      maxLogEnd: Math.max(...partitions.map((p) => p.log_end_offset)),
    }))
    if (topicFilter) groups = groups.filter((g) => g.topic === topicFilter)
    if (sortByLag) groups = [...groups].sort((a, b) => b.totalLag - a.totalLag)
    else groups = groups.sort((a, b) => a.topic.localeCompare(b.topic))
    return groups
  }, [group, topicFilter, sortByLag])

  const allExpanded = topicGroups.length > 0 && topicGroups.every((g) => expanded.has(g.topic))

  function toggleAll() {
    if (allExpanded) {
      setExpanded(new Set())
    } else {
      setExpanded(new Set(topicGroups.map((g) => g.topic)))
    }
  }

  function toggleTopic(topic: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="p-6">
      <div className="flex gap-2 mb-4 items-center">
        <Select value={topicFilter || 'all'} onValueChange={(v) => setTopicFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics ({topics.length})</SelectItem>
            {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sortByLag}
            onChange={(e) => setSortByLag(e.target.checked)}
          />
          Sort by lag
        </label>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs text-muted-foreground">
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="w-6 px-4 py-2" />
              <th className="px-4 py-2 text-left font-medium">Topic</th>
              <th className="px-4 py-2 text-left font-medium">Partitions</th>
              <th className="px-4 py-2 text-left font-medium">Committed</th>
              <th className="px-4 py-2 text-left font-medium">Log End</th>
              <th className="px-4 py-2 text-left font-medium">Total Lag</th>
              <th className="px-4 py-2 text-left font-medium">Member</th>
            </tr>
          </thead>
          <tbody>
            {topicGroups.map((g) => (
              <TopicRow
                key={g.topic}
                group={g}
                expanded={expanded.has(g.topic)}
                onToggle={() => toggleTopic(g.topic)}
                memberMap={memberMap}
              />
            ))}
            {topicGroups.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No offset data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
