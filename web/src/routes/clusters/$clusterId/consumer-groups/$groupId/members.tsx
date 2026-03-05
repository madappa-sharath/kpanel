// Screen-8a: Consumer Group Members

import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupMember } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'
import { cn } from '@/lib/utils'

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
      <span className={cn(
        m.member_lag > 10_000 ? 'text-destructive' : m.member_lag > 1_000 ? 'text-amber-600' : '',
      )}>
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

  const members = useMemo(
    () => [...(group?.members ?? [])].sort((a, b) => b.member_lag - a.member_lag),
    [group],
  )

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="p-6">
      <DataTable
        columns={columns}
        data={members}
        rowKey={(m) => m.id}
        emptyMessage="No active members — group may be idle"
      />
    </div>
  )
}
