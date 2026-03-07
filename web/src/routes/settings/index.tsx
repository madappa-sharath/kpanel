// Screen-2: Settings / Preferences

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { ConfirmModal } from '../../components/shared/ConfirmModal'
import { ClusterForm } from '../../components/clusters/ClusterForm'
import { useClusters } from '../../hooks/useCluster'
import { useDeleteCluster } from '../../hooks/useClusterConnection'
import { useAppStore } from '../../stores/appStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function SettingsPage() {
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
    <div className="p-6 max-w-xl">
      <PageHeader title="Settings" description="App preferences and credential management" />

      <div className="flex flex-col gap-3">
        <Section title="Clusters">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!isLoading && clusters && clusters.length > 0 && (
            <div className="-mx-4 -mt-2.5 mb-3">
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

          {!isLoading && (!clusters || clusters.length === 0) && !showForm && (
            <p className="text-sm text-muted-foreground mb-3">No clusters configured.</p>
          )}

          {showForm ? (
            <div className="-mx-4 -mb-4 p-4 border-t">
              <p className="text-sm font-medium mb-4">Add cluster</p>
              <ClusterForm
                onSuccess={() => setShowForm(false)}
                onCancel={() => setShowForm(false)}
              />
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowForm(true)}
            >
              <Plus size={13} />
              Add cluster
            </Button>
          )}
        </Section>

        <Section title="Credentials">
          <p className="text-sm text-muted-foreground mb-1.5">
            Stored in the system keychain under{' '}
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              kpanel
            </code>
            .
          </p>
          <p className="text-xs text-muted-foreground/60">
            TODO: credential viewer / delete entries
          </p>
        </Section>

        <Section title="About">
          <p className="text-sm text-muted-foreground mb-1">kpanel — lightweight Kafka GUI</p>
          <p className="text-xs text-muted-foreground/60">v0.0.1</p>
        </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
        {title}
      </h2>
      {children}
    </div>
  )
}
