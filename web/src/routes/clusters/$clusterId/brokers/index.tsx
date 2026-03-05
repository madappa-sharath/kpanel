import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { DataTable, type Column } from '../../../../components/shared/DataTable'
import { useBrokers } from '../../../../hooks/useBrokers'
import type { Broker } from '../../../../types/broker'
import { Badge } from '@/components/ui/badge'

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function BrokersPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: brokers = [], isLoading } = useBrokers(clusterId)

  const columns: Column<Broker>[] = [
    {
      key: 'nodeId',
      header: 'ID',
      render: (b) => <span className="font-mono text-muted-foreground">{b.nodeId}</span>,
    },
    {
      key: 'host',
      header: 'Address',
      render: (b) => <span className="font-mono">{b.host}:{b.port}</span>,
    },
    {
      key: 'isController',
      header: 'Role',
      render: (b) =>
        b.isController ? (
          <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
            Controller
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Broker</span>
        ),
    },
    {
      key: 'leaderPartitions',
      header: 'Leader Partitions',
      render: (b) => <span className="font-mono">{b.leaderPartitions}</span>,
    },
    {
      key: 'replicas',
      header: 'Total Replicas',
      render: (b) => <span className="font-mono text-muted-foreground">{b.replicas}</span>,
    },
    {
      key: 'logSizeBytes',
      header: 'Disk Used',
      render: (b) => <span className="font-mono text-muted-foreground">{fmtBytes(b.logSizeBytes)}</span>,
    },
    {
      key: 'rack',
      header: 'Rack',
      render: (b) => <span className="text-muted-foreground">{b.rack ?? '—'}</span>,
    },
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Brokers"
        description={
          isLoading ? 'Loading…' :
          brokers.length === 1 ? '1 broker' :
          `${brokers.length} brokers`
        }
      />
      {!isLoading && (
        <DataTable
          columns={columns}
          data={brokers}
          rowKey={(b) => String(b.nodeId)}
          emptyMessage="No brokers found"
        />
      )}
    </div>
  )
}
