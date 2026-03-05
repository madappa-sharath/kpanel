// Screen-8c: Consumer Group Lag chart

import { useParams } from '@tanstack/react-router'
import { LagChart } from '../../../../../components/consumer-groups/LagChart'

export function GroupLagPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }

  return (
    <div className="p-6">
      <LagChart clusterId={clusterId} groupId={groupId} />
    </div>
  )
}
