// TODO: Screen-3 — implement as part of Topic List screen.
// Renders topics using DataTable. Supports search + Create Topic button.

import { useNavigate } from '@tanstack/react-router'
import type { Topic } from '../../types/topic'
import { DataTable, type Column } from '../shared/DataTable'

interface TopicTableProps {
  clusterId: string
  topics: Topic[]
}

const columns: Column<Topic>[] = [
  { key: 'name', header: 'Name' },
  { key: 'partitions', header: 'Partitions', render: (t) => String(t.partitions) },
  { key: 'replication_factor', header: 'Replication', render: (t) => String(t.replication_factor) },
  { key: 'internal', header: 'Internal', render: (t) => (t.internal ? 'Yes' : 'No') },
]

export function TopicTable({ clusterId, topics }: TopicTableProps) {
  const navigate = useNavigate()

  return (
    <DataTable
      columns={columns}
      data={topics}
      rowKey={(t) => t.name}
      onRowClick={(t) =>
        navigate({
          to: '/clusters/$clusterId/topics/$topicName',
          params: { clusterId, topicName: t.name },
        })
      }
      emptyMessage="No topics found"
    />
  )
}
