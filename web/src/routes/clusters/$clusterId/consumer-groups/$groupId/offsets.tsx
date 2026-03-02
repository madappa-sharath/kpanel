// Screen-8b: Consumer Group Offsets
// Per-partition committed offset vs log-end with lag highlight

import { useState, useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupOffset } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'

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
        <span style={{ color: o.lag > 10_000 ? 'var(--k-red)' : o.lag > 1_000 ? 'var(--k-amber)' : undefined }}>
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
        return <span style={{ color: o.member_id ? 'var(--k-text)' : 'var(--k-faint)', fontFamily: 'var(--k-font)', fontSize: 11 }}>{label}</span>
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

  // Build memberId → clientId map for readable display
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

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="k-page">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="k-input"
          style={{ width: 220 }}
        >
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)', cursor: 'pointer' }}>
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
