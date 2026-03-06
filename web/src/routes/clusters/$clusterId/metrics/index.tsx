import { useParams } from '@tanstack/react-router'
import { useClusters } from '../../../../hooks/useCluster'
import { useClusterMetrics } from '../../../../hooks/useMetrics'
import { MetricsChart } from '../../../../components/metrics/MetricsChart'
import { MetricsErrorBanner } from '../../../../components/metrics/MetricsErrorBanner'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Info } from 'lucide-react'

export function MetricsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)
  const isAWS = cluster?.platform === 'aws'
  const { data: metricsData, isLoading: metricsLoading, error } = useClusterMetrics(clusterId, isAWS)

  return (
    <div className="p-6">
      <PageHeader title="Metrics" description="CloudWatch · last 3 hours · 5-min resolution" />

      {!isAWS ? (
        <Alert className="border-border">
          <Info className="h-4 w-4" />
          <AlertTitle>Metrics not available</AlertTitle>
          <AlertDescription>
            CloudWatch metrics are only available for AWS MSK clusters.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <MetricsErrorBanner error={error as Error | null} />
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'cpu_user', title: 'CPU User %' },
              { id: 'disk_used', title: 'Disk Used %' },
              { id: 'bytes_in', title: 'Bytes In/sec' },
              { id: 'bytes_out', title: 'Bytes Out/sec' },
            ].map(({ id, title }) => (
              <div key={id} className="rounded-md border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {title}
                </p>
                <MetricsChart
                  series={metricsData?.series.find((s) => s.id === id)}
                  isLoading={metricsLoading}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
