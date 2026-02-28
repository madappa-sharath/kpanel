import { useNavigate } from '@tanstack/react-router'
import type { Topic } from '../../types/topic'
import { DataTable, type Column } from '../shared/DataTable'
import { StatusBadge } from '../shared/StatusBadge'

interface TopicTableProps {
  clusterId: string
  topics: Topic[]
}

const columns: Column<Topic>[] = [
  { key: 'name', header: 'Name' },
  { key: 'partitions', header: 'Partitions', render: (t) => String(t.partitions) },
  { key: 'replication_factor', header: 'Replication', render: (t) => String(t.replication_factor) },
  {
    key: 'isr_health',
    header: 'ISR Health',
    render: (t) =>
      t.isr_health === 'degraded' ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge variant="warn" label="Degraded" />
          <span style={{ fontSize: 11, color: 'var(--k-muted)' }}>
            {t.under_replicated_partitions}p
          </span>
        </span>
      ) : (
        <StatusBadge variant="ok" label="Healthy" />
      ),
  },
  {
    key: 'internal',
    header: 'Internal',
    render: (t) =>
      t.internal ? <StatusBadge variant="neutral" label="internal" /> : null,
  },
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
