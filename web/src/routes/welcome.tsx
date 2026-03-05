import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useClusters } from '../hooks/useCluster'
import { useDeleteCluster } from '../hooks/useClusterConnection'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/shared/ConfirmModal'
import { ClusterForm } from '../components/clusters/ClusterForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function WelcomePage() {
  const navigate                      = useNavigate()
  const { data: clusters, isLoading } = useClusters()
  const { mutate: deleteCluster }     = useDeleteCluster()
  const setActive                     = useAppStore((s) => s.setActiveCluster)
  const [showForm, setShowForm]       = useState(false)
  const [confirmDelete, setConfirm]   = useState<string | null>(null)

  function connectTo(id: string) {
    setActive(id)
    navigate({ to: '/clusters/$clusterId', params: { clusterId: id } })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">

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
                <div className="px-4 py-5 text-sm text-muted-foreground">Loading…</div>
              )}

              {!isLoading && clusters && clusters.length > 0 && (
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
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.brokers.join(', ')}</div>
                      </div>
                      {c.platform === 'aws' && (
                        <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 flex-shrink-0">
                          MSK
                        </Badge>
                      )}
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

              {!isLoading && (!clusters || clusters.length === 0) && (
                <div className="px-4 py-8 text-center text-sm">
                  <p className="font-medium text-foreground mb-1">No clusters configured</p>
                  <p className="text-muted-foreground">Connect to any Kafka cluster to begin.</p>
                </div>
              )}

              <div className="px-4 py-3 border-t">
                <Button
                  variant="outline"
                  className="w-full justify-center gap-1.5"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={13} />
                  Add cluster
                </Button>
              </div>
            </>
          )}

          {showForm && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-medium">Add cluster</span>
              </div>
              <ClusterForm
                onSuccess={() => setShowForm(false)}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}
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
