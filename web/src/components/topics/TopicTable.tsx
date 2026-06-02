import { useNavigate } from '@tanstack/react-router'
import type { Topic } from '../../types/topic'
import { DataTable, type Column } from '../shared/DataTable'
import { StatusBadge } from '../shared/StatusBadge'
import { formatBytes, formatNumber } from '../../lib/utils'

interface TopicTableProps {
  clusterId: string
  topics: Topic[]
  sortKey: keyof Topic & string
  sortDir: 'asc' | 'desc'
  onSort: (key: keyof Topic & string) => void
}

const columns: Column<Topic>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (t) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{t.name}</span>
        {t.internal && <StatusBadge variant="neutral" label="internal" />}
      </span>
    ),
  },
  {
    key: 'partitions',
    header: 'Partitions',
    align: 'right',
    width: '110px',
    sortable: true,
    render: (t) => <span className="font-mono text-sm">{formatNumber(t.partitions)}</span>,
  },
  {
    key: 'message_count',
    header: 'Messages',
    align: 'right',
    width: '120px',
    sortable: true,
    render: (t) => (
      <span className="font-mono text-sm">
        {t.message_count === null ? '—' : formatNumber(t.message_count)}
      </span>
    ),
  },
  {
    key: 'log_size_bytes',
    header: 'Size',
    align: 'right',
    width: '120px',
    sortable: true,
    render: (t) => (
      <span
        className="font-mono text-sm"
        title={t.log_size_bytes === null ? 'Size unavailable' : 'Replicated disk usage'}
      >
        {t.log_size_bytes === null ? '—' : formatBytes(t.log_size_bytes)}
      </span>
    ),
  },
  {
    key: 'replication_factor',
    header: 'RF',
    align: 'right',
    width: '80px',
    sortable: true,
    render: (t) => <span className="font-mono text-sm">{formatNumber(t.replication_factor)}</span>,
  },
  {
    key: 'isr_health',
    header: 'ISR Health',
    width: '140px',
    sortable: true,
    render: (t) =>
      t.isr_health === 'degraded' ? (
        <span className="flex items-center gap-1.5">
          <StatusBadge variant="warn" label="Degraded" />
          <span className="text-xs text-muted-foreground">{t.under_replicated_partitions}p</span>
        </span>
      ) : (
        <StatusBadge variant="ok" label="Healthy" />
      ),
  },
]

export function TopicTable({ clusterId, topics, sortKey, sortDir, onSort }: TopicTableProps) {
  const navigate = useNavigate()

  return (
    <DataTable
      columns={columns}
      data={topics}
      rowKey={(t) => t.name}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
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
