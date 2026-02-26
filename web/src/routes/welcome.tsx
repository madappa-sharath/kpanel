import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useClusters } from '../hooks/useCluster'
import { useDeleteCluster } from '../hooks/useClusterConnection'
import { useAppStore } from '../stores/appStore'
import { ConfirmModal } from '../components/shared/ConfirmModal'
import { ClusterForm } from '../components/clusters/ClusterForm'

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
    <div
      className="k-dot-grid"
      style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '40px 20px',
        background:     'var(--k-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, background: 'var(--k-amber)', borderRadius: 10,
              marginBottom: 18, fontFamily: 'var(--k-font)', fontWeight: 600,
              fontSize: 24, color: '#000',
            }}
          >
            k
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--k-font)', fontSize: 26, fontWeight: 500, color: 'var(--k-text)', letterSpacing: '-0.02em' }}>
            kpanel
          </h1>
          <p style={{ margin: '8px 0 0', fontFamily: 'var(--k-font)', fontSize: 14, color: 'var(--k-muted)' }}>
            kafka cluster manager
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 8, overflow: 'hidden' }}>

          {!showForm && (
            <>
              {isLoading && (
                <div style={{ padding: '20px 18px', color: 'var(--k-muted)', fontSize: 14, fontFamily: 'var(--k-font)' }}>
                  Loading…
                </div>
              )}

              {!isLoading && clusters && clusters.length > 0 && (
                <div>
                  <div style={{
                    padding: '10px 16px 8px', fontSize: 11, color: 'var(--k-muted)',
                    fontFamily: 'var(--k-font)', borderBottom: '1px solid var(--k-border)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Saved clusters
                  </div>
                  {clusters.map((c) => (
                    <div
                      key={c.id}
                      className="k-hover-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderBottom: '1px solid var(--k-border)',
                      }}
                    >
                      <span className="k-dot k-dot-muted" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--k-font)', fontSize: 15, fontWeight: 500, color: 'var(--k-text)', marginBottom: 2 }}>
                          {c.name}
                        </div>
                        <div style={{ fontFamily: 'var(--k-font)', fontSize: 12, color: 'var(--k-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.brokers.join(', ')}
                        </div>
                      </div>
                      {c.platform === 'aws' && (
                        <span className="k-badge k-badge-amber" style={{ flexShrink: 0 }}>MSK</span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => connectTo(c.id)}
                          className="k-btn-link"
                          style={{ color: 'var(--k-amber)', fontWeight: 500, fontSize: 13 }}
                        >
                          Connect <ArrowRight size={11} />
                        </button>
                        <button
                          onClick={() => setConfirm(c.id)}
                          className="k-icon-btn k-icon-btn-danger"
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && (!clusters || clusters.length === 0) && (
                <div style={{ padding: '32px 18px', textAlign: 'center', fontFamily: 'var(--k-font)', color: 'var(--k-muted)', fontSize: 14 }}>
                  <p style={{ margin: '0 0 4px', color: 'var(--k-text)', fontWeight: 500 }}>No clusters configured</p>
                  <p style={{ margin: 0, fontSize: 13 }}>Connect to any Kafka cluster to begin.</p>
                </div>
              )}

              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--k-border)' }}>
                <button
                  className="k-btn k-btn-ghost"
                  onClick={() => setShowForm(true)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Plus size={13} />
                  Add cluster
                </button>
              </div>
            </>
          )}

          {showForm && (
            <div style={{ padding: '18px 18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontFamily: 'var(--k-font)', fontSize: 15, fontWeight: 500, color: 'var(--k-text)' }}>
                  Add cluster
                </span>
              </div>
              <ClusterForm
                onSuccess={() => setShowForm(false)}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}
        </div>

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--k-faint)', fontFamily: 'var(--k-font)' }}>
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
