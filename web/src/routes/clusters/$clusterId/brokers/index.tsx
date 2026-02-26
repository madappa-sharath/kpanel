// Screen: Broker List
// TODO: implement full broker list with per-broker metadata

import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { api } from '../../../../lib/api'
import { queryKeys } from '../../../../lib/queryKeys'
import { DataTable, type Column } from '../../../../components/shared/DataTable'

interface Broker {
  id: number
  host: string
  port: number
  rack?: string
  is_controller: boolean
}

export function BrokersPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: brokers = [], isLoading } = useQuery({
    queryKey: queryKeys.brokers.all(clusterId),
    queryFn: () => api.brokers.list(clusterId),
    enabled: !!clusterId,
  })

  const columns: Column<Broker>[] = [
    { key: 'id', header: 'ID', render: (b) => String(b.id) },
    { key: 'host', header: 'Host', render: (b) => `${b.host}:${b.port}` },
    { key: 'rack', header: 'Rack', render: (b) => b.rack ?? '—' },
    { key: 'is_controller', header: 'Role', render: (b) => b.is_controller ? 'Controller' : 'Broker' },
  ]

  return (
    <div className="k-page">
      <PageHeader title="Brokers" description="Kafka broker metadata and partition distribution" />
      {isLoading ? (
        <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>Loading brokers…</p>
      ) : (
        <DataTable
          columns={columns}
          data={brokers as Broker[]}
          rowKey={(b) => String(b.id)}
          emptyMessage="No brokers returned — backend endpoint may not be implemented yet"
        />
      )}
    </div>
  )
}
