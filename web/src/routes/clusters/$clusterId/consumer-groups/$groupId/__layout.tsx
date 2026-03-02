// Consumer Group layout — tab bar for Members, Offsets, Lag

import { Link, Outlet, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ResetOffsetsModal } from '../../../../../components/consumer-groups/ResetOffsetsModal'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { StatusBadge, groupStateVariant } from '../../../../../components/shared/StatusBadge'
import { formatNumber } from '../../../../../lib/utils'

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
  const { data: group } = useConsumerGroup(clusterId, groupId)

  const totalLag = group?.offsets.reduce((sum, o) => sum + o.lag, 0) ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb + actions */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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

        {/* Stats row */}
        {group && (
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusBadge variant={groupStateVariant(group.state)} label={group.state} />
            </div>
            <span style={{ color: 'var(--k-muted)' }}>
              Lag:{' '}
              <span style={{ color: totalLag > 10_000 ? 'var(--k-red)' : totalLag > 1_000 ? 'var(--k-amber)' : 'var(--k-text)', fontWeight: 600 }}>
                {formatNumber(totalLag)}
              </span>
            </span>
            <span style={{ color: 'var(--k-muted)' }}>
              Members: <span style={{ color: 'var(--k-text)' }}>{group.members.length}</span>
            </span>
            <span style={{ color: 'var(--k-muted)' }}>
              Coordinator: <span style={{ color: 'var(--k-text)' }}>broker-{group.coordinator_id}</span>
            </span>
            {group.protocol && (
              <span style={{ color: 'var(--k-muted)' }}>
                Protocol: <span style={{ color: 'var(--k-text)' }}>{group.protocol}</span>
              </span>
            )}
          </div>
        )}

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
