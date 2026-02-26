// Screen-8c: Consumer Group Lag chart
// Time-series lag per partition (recharts LineChart)
// TODO: wire up CloudWatch or polling-based lag history

import { useParams } from '@tanstack/react-router'
import { LagChart } from '../../../../../components/consumer-groups/LagChart'

export function GroupLagPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }

  return (
    <div className="k-page">
      <LagChart clusterId={clusterId} groupId={groupId} />
    </div>
  )
}
