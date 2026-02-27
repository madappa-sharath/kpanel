import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { DataTable, type Column } from '../../../../components/shared/DataTable'
import { useBrokers } from '../../../../hooks/useBrokers'
import type { Broker } from '../../../../types/broker'

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
      render: (b) => (
        <span style={{ fontFamily: 'var(--k-font)', color: 'var(--k-muted)' }}>
          {b.nodeId}
        </span>
      ),
    },
    {
      key: 'host',
      header: 'Address',
      render: (b) => (
        <span style={{ fontFamily: 'var(--k-font)' }}>
          {b.host}:{b.port}
        </span>
      ),
    },
    {
      key: 'isController',
      header: 'Role',
      render: (b) =>
        b.isController ? (
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 10,
            border: '1px solid rgba(217,159,34,0.35)',
            background: 'rgba(217,159,34,0.12)',
            color: 'var(--k-amber)',
            fontFamily: 'var(--k-font)',
          }}>
            Controller
          </span>
        ) : (
          <span style={{ color: 'var(--k-muted)', fontSize: 13 }}>Broker</span>
        ),
    },
    {
      key: 'leaderPartitions',
      header: 'Leader Partitions',
      render: (b) => (
        <span style={{ fontFamily: 'var(--k-font)' }}>{b.leaderPartitions}</span>
      ),
    },
    {
      key: 'replicas',
      header: 'Total Replicas',
      render: (b) => (
        <span style={{ fontFamily: 'var(--k-font)', color: 'var(--k-muted)' }}>
          {b.replicas}
        </span>
      ),
    },
    {
      key: 'logSizeBytes',
      header: 'Disk Used',
      render: (b) => (
        <span style={{ fontFamily: 'var(--k-font)', color: 'var(--k-muted)' }}>
          {fmtBytes(b.logSizeBytes)}
        </span>
      ),
    },
    {
      key: 'rack',
      header: 'Rack',
      render: (b) => (
        <span style={{ color: 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>
          {b.rack ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="k-page">
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
