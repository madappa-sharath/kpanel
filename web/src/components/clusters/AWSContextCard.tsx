// AWS context card — shows active profile, credential status, and MSK discovery.
// Hidden entirely when no AWS credentials are configured.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ChevronRight, Cloud, Copy, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { useAppStore } from '../../stores/appStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AWSContextCardProps {
  defaultExpanded?: boolean
}

export function AWSContextCard({ defaultExpanded = false }: AWSContextCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setActive = useAppStore((s) => s.setActiveCluster)

  const { data: ctx, isLoading } = useQuery({
    queryKey: queryKeys.aws.context(),
    queryFn: () => api.aws.context(),
    retry: false,
    staleTime: 60_000,
  })

  const {
    data: mskClusters,
    isFetching: isDiscovering,
    refetch: discover,
    isFetched: hasDiscovered,
  } = useQuery({
    queryKey: queryKeys.msk.clusters(),
    queryFn: () => api.msk.discover(),
    enabled: false,
    retry: false,
  })

  const { mutate: importCluster, isPending: isImporting, variables: importingArn } = useMutation({
    mutationFn: (arn: string) => api.msk.import(arn),
    onSuccess: (cluster) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() })
      setActive(cluster.id)
      navigate({ to: '/clusters/$clusterId/settings', params: { clusterId: cluster.id } })
    },
  })

  // Hide while loading or when no AWS credentials are configured
  if (isLoading) return null
  if (!ctx || (!ctx.valid && !ctx.recovery)) return null

  // Collapsed compact row
  if (!expanded) {
    return (
      <div className="rounded-md border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS</span>
        <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">{ctx.profile}</Badge>
        {ctx.account && (
          <span className="text-xs text-muted-foreground/60">{ctx.account}</span>
        )}
        <button
          onClick={() => setExpanded(true)}
          className="ml-auto text-xs text-amber-600 hover:text-amber-500 flex items-center gap-0.5 transition-colors"
        >
          Discover clusters <ChevronRight size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AWS</h2>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          collapse
        </button>
      </div>

      {/* Expired / invalid session warning */}
      {!ctx.valid && ctx.recovery && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                AWS session expired for profile{' '}
                <code className="font-mono">{ctx.profile}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run:{' '}
                <code className="font-mono text-foreground">{ctx.recovery}</code>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(ctx.recovery!)}
                className="h-6 gap-1 mt-1 px-0 text-xs"
              >
                <Copy size={11} /> Copy command
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Valid session info + discover button */}
      {ctx.valid && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Badge variant="outline" className="font-mono text-xs">{ctx.profile}</Badge>
          {ctx.account && (
            <span className="text-xs text-muted-foreground">{ctx.account}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1.5"
            onClick={() => discover()}
            disabled={isDiscovering}
          >
            {isDiscovering
              ? <><RefreshCw size={12} className="animate-spin" /> Discovering…</>
              : 'Discover MSK clusters'
            }
          </Button>
        </div>
      )}

      {/* Discovery results */}
      {hasDiscovered && !isDiscovering && mskClusters && mskClusters.length === 0 && (
        <p className="text-sm text-muted-foreground">No MSK clusters found in {ctx.region}.</p>
      )}

      {mskClusters && mskClusters.length > 0 && (
        <div className="-mx-4 -mb-4 border-t">
          {mskClusters.map((c) => (
            <div key={c.arn} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.region} · {c.brokers.length} broker{c.brokers.length !== 1 ? 's' : ''}
                </div>
              </div>
              <Badge variant="outline" className="text-xs flex-shrink-0">{c.state}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-shrink-0"
                disabled={isImporting && importingArn === c.arn}
                onClick={() => importCluster(c.arn)}
              >
                {isImporting && importingArn === c.arn ? 'Importing…' : 'Import'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
