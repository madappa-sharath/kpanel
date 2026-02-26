// Consumer Group layout — tab bar for Members, Offsets, Lag

import { Link, Outlet, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ResetOffsetsModal } from '../../../../../components/consumer-groups/ResetOffsetsModal'

const TABS = [
  { label: 'Members', to: '/clusters/$clusterId/consumer-groups/$groupId/members' as const },
  { label: 'Offsets', to: '/clusters/$clusterId/consumer-groups/$groupId/offsets' as const },
  { label: 'Lag', to: '/clusters/$clusterId/consumer-groups/$groupId/lag' as const },
]

export function GroupLayout() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const [showReset, setShowReset] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb + actions */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)' }}>
            <Link
              to="/clusters/$clusterId/consumer-groups"
              params={{ clusterId }}
              style={{ color: 'var(--k-muted)', textDecoration: 'none' }}
            >
              Consumer Groups
            </Link>
            <ChevronRight size={13} />
            <span style={{ color: 'var(--k-text)', fontFamily: 'var(--k-font)' }}>{groupId}</span>
          </div>
          <button
            onClick={() => setShowReset(true)}
            className="k-btn-link"
            style={{ padding: '4px 8px' }}
          >
            Reset offsets ▾
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--k-border)' }}>
          {TABS.map(({ label, to }) => (
            <Link
              key={label}
              to={to}
              params={{ clusterId, groupId }}
              className="k-tab"
              activeProps={{ className: 'k-tab k-tab-active' }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>

      <ResetOffsetsModal
        open={showReset}
        clusterId={clusterId}
        groupId={groupId}
        onClose={() => setShowReset(false)}
      />
    </div>
  )
}
