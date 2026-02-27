import { useParams, Link } from '@tanstack/react-router'
import { useClusters, useConnectionStatus } from '../../hooks/useCluster'
import { useAppStore } from '../../stores/appStore'
import { ClusterSwitcher } from './ClusterSwitcher'

export function Header() {
  const params          = useParams({ strict: false }) as { clusterId?: string; topicName?: string; groupId?: string }
  const activeClusterId = useAppStore((s) => s.activeClusterId)
  const clusterId       = params.clusterId ?? activeClusterId
  const { data: clusters } = useClusters()
  const { data: status, isLoading } = useConnectionStatus(clusterId ?? '')

  const cluster = clusters?.find((c) => c.id === clusterId)

  return (
    <header
      style={{
        height:      'var(--header-h)',
        display:     'flex',
        alignItems:  'center',
        padding:     '0 16px',
        borderBottom: '1px solid var(--k-border)',
        background:  'var(--k-surface)',
        gap:         16,
        flexShrink:  0,
      }}
    >
      {/* Cluster switcher */}
      <ClusterSwitcher />

      {/* Breadcrumb path */}
      {cluster && (
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        6,
            color:      'var(--k-muted)',
            fontSize:   11,
            fontFamily: 'var(--k-font)',
          }}
        >
          <span style={{ color: 'var(--k-border-3)' }}>/</span>
          {params.topicName && (
            <>
              <Link
                to="/clusters/$clusterId/topics"
                params={{ clusterId: clusterId! }}
                style={{ color: 'var(--k-muted)', textDecoration: 'none' }}
              >
                topics
              </Link>
              <span style={{ color: 'var(--k-border-3)' }}>/</span>
              <span style={{ color: 'var(--k-text)' }}>{params.topicName}</span>
            </>
          )}
          {params.groupId && (
            <>
              <Link
                to="/clusters/$clusterId/consumer-groups"
                params={{ clusterId: clusterId! }}
                style={{ color: 'var(--k-muted)', textDecoration: 'none' }}
              >
                groups
              </Link>
              <span style={{ color: 'var(--k-border-3)' }}>/</span>
              <span style={{ color: 'var(--k-text)' }}>{params.groupId}</span>
            </>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Connection status */}
      {clusterId && (
        <div
          style={{
            display:     'flex',
            alignItems:  'center',
            gap:         7,
            padding:     '4px 12px',
            borderRadius: 20,
            border:      '1px solid',
            fontSize:    12,
            fontFamily:  'var(--k-font)',
            borderColor: (isLoading || status === undefined)
              ? 'var(--k-amber-border)'
              : status.connected
              ? 'rgba(61,184,122,0.25)'
              : 'rgba(217,82,82,0.25)',
            background: (isLoading || status === undefined)
              ? 'var(--k-amber-dim)'
              : status.connected
              ? 'var(--k-green-dim)'
              : 'var(--k-red-dim)',
            color: (isLoading || status === undefined)
              ? 'var(--k-amber)'
              : status.connected
              ? 'var(--k-green)'
              : 'var(--k-red)',
          }}
        >
          <span
            className={`k-dot ${
              (isLoading || status === undefined)
                ? 'k-dot-amber k-dot-pulse'
                : status.connected
                ? 'k-dot-green k-dot-pulse'
                : 'k-dot-red'
            }`}
          />
          {(isLoading || status === undefined)
            ? 'checking'
            : status.connected
            ? 'connected'
            : 'disconnected'}
        </div>
      )}
    </header>
  )
}
