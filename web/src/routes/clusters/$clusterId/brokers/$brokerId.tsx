// Screen: Broker Detail
// TODO: implement broker detail — partitions led, ISR participation, CloudWatch metrics

import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'

export function BrokerDetailPage() {
  const { brokerId } = useParams({ strict: false }) as {
    clusterId: string
    brokerId: string
  }

  return (
    <div className="k-page">
      <PageHeader
        title={`Broker ${brokerId}`}
        description="Per-broker partitions, ISR, and resource metrics"
      />
      <div style={{ border: '1px dashed var(--k-border-2)', borderRadius: 6, padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>Broker detail — coming soon</p>
      </div>
    </div>
  )
}
