// Cluster layout — provides cluster context + AWS auth alert.
// Wraps all cluster sub-routes.

import { Outlet, useParams } from '@tanstack/react-router'
import { useClusters } from '../../../hooks/useCluster'
import { AWSAuthAlert } from '../../../components/clusters/AWSAuthAlert'

export function ClusterLayout() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)

  const awsCfg =
    cluster?.platform === 'aws' && cluster.platform_config
      ? (cluster.platform_config as { profile?: string })
      : null

  return (
    <>
      {awsCfg?.profile && (
        <AWSAuthAlert clusterId={clusterId} awsProfile={awsCfg.profile} />
      )}
      <Outlet />
    </>
  )
}
