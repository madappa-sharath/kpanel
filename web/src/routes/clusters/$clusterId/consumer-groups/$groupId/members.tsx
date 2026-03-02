// Screen-8a: Consumer Group Members

import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupMember } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'

const columns: Column<GroupMember>[] = [
  { key: 'client_id', header: 'Client ID' },
  { key: 'host', header: 'Host' },
  {
    key: 'assignments',
    header: 'Assigned Partitions',
    render: (m) =>
      m.assignments
        .map((a) => `${a.topic}[${a.partitions.join(',')}]`)
        .join(', ') || '—',
  },
  {
    key: 'member_lag',
    header: 'Member Lag',
    render: (m) => (
      <span style={{ color: m.member_lag > 10_000 ? 'var(--k-red)' : m.member_lag > 1_000 ? 'var(--k-amber)' : undefined }}>
        {formatNumber(m.member_lag)}
        {m.member_lag > 10_000 && ' ⚠'}
      </span>
    ),
  },
]

export function GroupMembersPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: group, isLoading, error } = useConsumerGroup(clusterId, groupId)

  // Sort members by lag descending so highest-lag consumers are visible first
  const members = useMemo(
    () => [...(group?.members ?? [])].sort((a, b) => b.member_lag - a.member_lag),
    [group],
  )

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="k-page">
      <DataTable
        columns={columns}
        data={members}
        rowKey={(m) => m.id}
        emptyMessage="No active members — group may be idle"
      />
    </div>
  )
}
