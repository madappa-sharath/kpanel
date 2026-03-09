// AWS context card — shows active profile, credential status, and MSK discovery.

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Cloud, Copy, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface AWSContextCardProps {
  defaultExpanded?: boolean
}

export function AWSContextCard({ defaultExpanded = false }: AWSContextCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [region, setRegion] = useState('')
  const queryClient = useQueryClient()

  const { data: ctx, isLoading, isFetching: isChecking, refetch: recheck } = useQuery({
    queryKey: queryKeys.aws.context(),
    queryFn: () => api.aws.context(),
    retry: false,
    staleTime: 60_000,
  })

  // Default region to whatever AWS resolved once ctx loads
  useEffect(() => {
    if (ctx?.region && !region) setRegion(ctx.region)
  }, [ctx?.region])

  const {
    data: mskClusters,
    isFetching: isDiscovering,
    refetch: discover,
    isFetched: hasDiscovered,
  } = useQuery({
    queryKey: queryKeys.msk.clusters(region),
    queryFn: () => api.msk.discover(region),
    enabled: false,
    retry: false,
  })

  // Per-cluster access mode selection: 'private' | 'public'
  const [accessMode, setAccessMode] = useState<Record<string, 'private' | 'public'>>({})
  function getAccess(arn: string) { return accessMode[arn] ?? 'private' }

  const [importError, setImportError] = useState<string | null>(null)

  const { mutate: importCluster, isPending: isImporting, variables: importingArgs } = useMutation({
    mutationFn: ({ arn, access }: { arn: string; access: 'private' | 'public' }) =>
      api.msk.import(arn, access),
    onSuccess: () => {
      setImportError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() })
    },
    onError: (err: Error) => {
      setImportError(err.message)
    },
  })

  if (isLoading) return null

  // No credentials and no SSO recovery — show a minimal check row
  if (!ctx || (!ctx.valid && !ctx.recovery)) {
    return (
      <div className="rounded-md border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS</span>
        <span className="text-xs text-muted-foreground/60">No credentials detected</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1.5 text-xs"
          onClick={() => recheck()}
          disabled={isChecking}
        >
          {isChecking
            ? <><RefreshCw size={11} className="animate-spin" /> Checking…</>
            : <><RefreshCw size={11} /> Recheck</>
          }
        </Button>
      </div>
    )
  }

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground/60 hover:text-muted-foreground"
            onClick={() => recheck()}
            disabled={isChecking}
          >
            <RefreshCw size={10} className={isChecking ? 'animate-spin' : ''} />
            {isChecking ? 'Checking…' : 'Recheck'}
          </Button>
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            collapse
          </button>
        </div>
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

      {/* Valid session info + region picker + discover button */}
      {ctx.valid && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Badge variant="outline" className="font-mono text-xs">{ctx.profile}</Badge>
          {ctx.account && (
            <span className="text-xs text-muted-foreground">{ctx.account}</span>
          )}
          <Input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="us-east-1"
            className="ml-auto h-7 w-36 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => discover()}
            disabled={isDiscovering || !region}
          >
            {isDiscovering
              ? <><RefreshCw size={12} className="animate-spin" /> Discovering…</>
              : 'Discover'
            }
          </Button>
        </div>
      )}

      {/* Discovery results */}
      {hasDiscovered && !isDiscovering && mskClusters && mskClusters.length === 0 && (
        <p className="text-sm text-muted-foreground">No MSK clusters found in {region}.</p>
      )}

      {importError && (
        <p className="text-xs text-destructive mb-3">{importError}</p>
      )}

      {mskClusters && mskClusters.length > 0 && (
        <div className="-mx-4 -mb-4 border-t">
          {mskClusters.map((c) => {
            const hasPublic = c.publicBrokers && c.publicBrokers.length > 0
            const access = getAccess(c.arn)
            const isThisImporting = isImporting && importingArgs?.arn === c.arn
            const brokerCount = access === 'public' ? c.publicBrokers.length : c.brokers.length

            return (
              <div key={c.arn} className="px-4 py-3 border-b last:border-b-0 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.region} · {brokerCount} broker{brokerCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">{c.state}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-shrink-0"
                    disabled={isThisImporting}
                    onClick={() => importCluster({ arn: c.arn, access })}
                  >
                    {isThisImporting ? 'Importing…' : 'Import'}
                  </Button>
                </div>

                {/* Access mode selector — only shown when public brokers are available */}
                {hasPublic && (
                  <div className="flex items-center gap-2 ml-0.5">
                    <span className="text-xs text-muted-foreground">Connect via:</span>
                    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 gap-0.5">
                      {([
                        { mode: 'private', label: 'VPC (private)' },
                        { mode: 'public',  label: 'Public access' },
                      ] as const).map(({ mode, label }) => (
                        <button
                          key={mode}
                          onClick={() => setAccessMode((s) => ({ ...s, [c.arn]: mode }))}
                          className={`text-xs px-3 py-1 rounded transition-all cursor-pointer select-none font-medium ${
                            access === mode
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-sm ring-1 ring-amber-500/30'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
