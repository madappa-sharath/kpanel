// Screen-8a: Consumer Group Members

import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupMember } from '../../../../../types/consumer'

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
]

export function GroupMembersPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: group, isLoading, error } = useConsumerGroup(clusterId, groupId)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="k-page">
      <DataTable
        columns={columns}
        data={group.members}
        rowKey={(m) => m.id}
        emptyMessage="No active members — group may be idle"
      />
    </div>
  )
}
