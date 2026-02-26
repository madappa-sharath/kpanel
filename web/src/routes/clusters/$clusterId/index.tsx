import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../components/shared/PageHeader'
import { useClusters } from '../../../hooks/useCluster'

export function DashboardPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)

  return (
    <div className="k-page">
      <PageHeader
        title={cluster?.name ?? clusterId}
        description={cluster?.platform === 'aws' ? 'AWS MSK' : cluster?.platform}
      />

      <div style={{
        border: '1px dashed var(--k-border-2)',
        borderRadius: 6,
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <p style={{ margin: '0 0 6px', color: 'var(--k-muted)', fontSize: 15 }}>
          Dashboard — coming soon
        </p>
        <p style={{ margin: 0, color: 'var(--k-faint)', fontSize: 13 }}>
          Will show: broker count, topic count, top consumer lag, bytes in/out
        </p>
      </div>
    </div>
  )
}
