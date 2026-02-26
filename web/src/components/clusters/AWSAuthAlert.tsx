// Inline banner — shown when AWS SSO session is expired for the active cluster.
// Not a blocking modal; the rest of the UI stays usable.

import { AlertTriangle, Copy } from 'lucide-react'
import { useClusterSession } from '../../hooks/useCluster'

interface AWSAuthAlertProps {
  clusterId: string
  awsProfile: string
}

export function AWSAuthAlert({ clusterId, awsProfile }: AWSAuthAlertProps) {
  const { data: session, refetch, isFetching } = useClusterSession(clusterId)

  if (!session || session.valid) return null

  const cmd = `aws sso login --profile ${awsProfile}`

  function copy() {
    navigator.clipboard.writeText(cmd)
  }

  return (
    <div style={{
      margin: '16px 24px 0',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: 6,
      border: '1px solid rgba(234, 179, 8, 0.3)',
      background: 'rgba(234, 179, 8, 0.07)',
      padding: '10px 14px',
      fontSize: 13,
    }}>
      <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0, color: 'var(--k-amber)' }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 2px', color: 'var(--k-amber)' }}>
          AWS SSO session expired for profile <code style={{ fontFamily: 'var(--k-font)' }}>{awsProfile}</code>
        </p>
        <p style={{ margin: 0, color: 'var(--k-muted)', fontSize: 12 }}>
          Run: <code style={{ fontFamily: 'var(--k-font)', color: 'var(--k-text)' }}>{cmd}</code>
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={copy} className="k-btn-link">
          <Copy size={12} />
          Copy
        </button>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="k-btn-link"
          style={{ textDecoration: 'underline', opacity: isFetching ? 0.5 : 1 }}
        >
          {isFetching ? 'Checking…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}
