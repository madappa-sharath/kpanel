import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { useClusters } from '../hooks/useCluster'
import { useDeleteCluster } from '../hooks/useClusterConnection'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/shared/ConfirmModal'
import { ClusterForm } from '../components/clusters/ClusterForm'
import { AWSContextCard } from '../components/clusters/AWSContextCard'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'

export function WelcomePage() {
  const navigate                      = useNavigate()
  const { data: clusters, isLoading, error } = useClusters()
  const { mutate: deleteCluster }     = useDeleteCluster()
  const setActive                     = useAppStore((s) => s.setActiveCluster)
  const [showForm, setShowForm]       = useState(false)
  const [confirmDelete, setConfirm]   = useState<string | null>(null)

  function connectTo(id: string) {
    setActive(id)
    navigate({ to: '/clusters/$clusterId', params: { clusterId: id } })
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-background px-5 pt-20 pb-10">
      <div className="w-full max-w-md">

        {/* Wordmark */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500 rounded-xl mb-4 font-mono font-semibold text-2xl text-black">
            k
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">kpanel</h1>
          <p className="mt-2 text-sm text-muted-foreground">kafka cluster manager</p>
        </div>

        {/* Card */}
        <div className="rounded-lg border bg-card overflow-hidden">

          {!showForm && (
            <>
              {isLoading && (
                <WelcomeClusterListSkeleton />
              )}

              {!isLoading && error && (
                <div className="px-4 py-5 text-sm">
                  <p className="font-medium text-destructive">Could not load clusters</p>
                  <p className="mt-1 text-muted-foreground">{error.message}</p>
                </div>
              )}

              {!isLoading && !error && clusters && clusters.length > 0 && (
                <div>
                  <div className="px-4 py-2.5 text-xs text-muted-foreground border-b uppercase tracking-wider">
                    Saved clusters
                  </div>
                  {clusters.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 px-4 py-3 border-b hover:bg-muted/40 transition-colors"
                    >
                      <div className="size-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                          {c.platform === 'aws' && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 flex-shrink-0 text-[10px] px-1.5 py-0">
                              MSK
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.brokers.join(', ')}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => connectTo(c.id)}
                          className="h-7 text-amber-600 hover:text-amber-600 gap-1"
                        >
                          Connect <ArrowRight size={11} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setActive(c.id)
                            navigate({ to: '/clusters/$clusterId/settings', params: { clusterId: c.id } })
                          }}
                          aria-label={`Edit ${c.name}`}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirm(c.id)}
                          aria-label={`Delete ${c.name}`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && !error && (!clusters || clusters.length === 0) && (
                <div className="px-4 py-8 text-center text-sm">
                  <p className="font-medium text-foreground mb-1">No clusters configured</p>
                  <p className="text-muted-foreground">Add any Kafka cluster to get started. AWS discovery is optional.</p>
                </div>
              )}

              <div className="px-4 py-3 border-t">
                <Button
                  variant="outline"
                  className="w-full justify-center gap-1.5"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={13} />
                  Add Kafka cluster
                </Button>
              </div>
            </>
          )}

          {showForm && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-medium">Add Kafka cluster</span>
              </div>
              <ClusterForm
                onSuccess={() => setShowForm(false)}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}
        </div>

        {/* Optional AWS discovery helper lives below saved clusters */}
        <div className="mt-3">
          <AWSContextCard />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          credentials stored in system keychain · no data leaves your machine
        </p>
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete cluster?"
        description="Removes the cluster config and keychain credentials. You can re-add it later."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) deleteCluster(confirmDelete); setConfirm(null) }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

function WelcomeClusterListSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="px-4 py-2.5 border-b">
        <Skeleton className="h-3 w-28" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="size-1.5 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-64" />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-7 w-7" />
          </div>
        </div>
      ))}
    </div>
  )
}
