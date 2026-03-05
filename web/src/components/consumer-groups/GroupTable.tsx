import { useNavigate } from '@tanstack/react-router'
import type { ConsumerGroup } from '../../types/consumer'
import { DataTable, type Column } from '../shared/DataTable'
import { StatusBadge, groupStateVariant } from '../shared/StatusBadge'
import { formatNumber } from '../../lib/utils'
import { cn } from '@/lib/utils'

interface GroupTableProps {
  clusterId: string
  groups: ConsumerGroup[]
}

const columns: Column<ConsumerGroup>[] = [
  { key: 'id', header: 'Group ID' },
  {
    key: 'state',
    header: 'State',
    render: (g) => <StatusBadge variant={groupStateVariant(g.state)} label={g.state} />,
  },
  { key: 'members', header: 'Members', render: (g) => String(g.members) },
  {
    key: 'topics',
    header: 'Topics',
    render: (g) => <span title={g.topics.join(', ')}>{g.topics.length}</span>,
  },
  {
    key: 'total_lag',
    header: 'Total Lag',
    render: (g) => (
      <span className={cn(g.total_lag > 10_000 && 'text-amber-600')}>
        {formatNumber(g.total_lag)}
      </span>
    ),
  },
  {
    key: 'coordinator_id',
    header: 'Coordinator',
    render: (g) => <span className="text-muted-foreground">broker-{g.coordinator_id}</span>,
  },
]

export function GroupTable({ clusterId, groups }: GroupTableProps) {
  const navigate = useNavigate()

  return (
    <DataTable
      columns={columns}
      data={groups}
      rowKey={(g) => g.id}
      onRowClick={(g) =>
        navigate({
          to: '/clusters/$clusterId/consumer-groups/$groupId/offsets',
          params: { clusterId, groupId: g.id },
        })
      }
      emptyMessage="No consumer groups found"
    />
  )
}
