import { useParams, useNavigate } from '@tanstack/react-router'
import { useClusters } from '../../../../hooks/useCluster'
import { ClusterForm } from '../../../../components/clusters/ClusterForm'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'

export function ClusterSettingsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const navigate = useNavigate()
  const { data: clusters, isLoading } = useClusters()

  const cluster = clusters?.find((c) => c.id === clusterId)

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-32 w-full mt-6" />
      </div>
    )
  }

  if (!cluster) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Cluster not found.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Connection settings"
        description={`Edit the connection config for ${cluster.name}.`}
      />
      <div className="mt-6">
        <ClusterForm
          cluster={cluster}
          onSuccess={() => {}}
          onCancel={() => navigate({ to: '/clusters/$clusterId', params: { clusterId } })}
        />
      </div>
    </div>
  )
}
