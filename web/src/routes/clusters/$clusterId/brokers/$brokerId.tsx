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
    <div className="p-6">
      <PageHeader
        title={`Broker ${brokerId}`}
        description="Per-broker partitions, ISR, and resource metrics"
      />
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">Broker detail — coming soon</p>
      </div>
    </div>
  )
}
