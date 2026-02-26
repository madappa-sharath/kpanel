// Topic layout — tab bar shared by Overview, Partitions, Configuration, Messages

import { Link, Outlet, useParams } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

const TABS = [
  { label: 'Overview', to: '/clusters/$clusterId/topics/$topicName' as const, exact: true },
  { label: 'Partitions', to: '/clusters/$clusterId/topics/$topicName/partitions' as const, exact: false },
  { label: 'Configuration', to: '/clusters/$clusterId/topics/$topicName/config' as const, exact: false },
  { label: 'Messages', to: '/clusters/$clusterId/topics/$topicName/messages' as const, exact: false },
]

export function TopicLayout() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)', marginBottom: 16 }}>
          <Link
            to="/clusters/$clusterId/topics"
            params={{ clusterId }}
            style={{ color: 'var(--k-muted)', textDecoration: 'none' }}
          >
            Topics
          </Link>
          <ChevronRight size={13} />
          <span style={{ color: 'var(--k-text)', fontFamily: 'var(--k-font)' }}>{topicName}</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--k-border)' }}>
          {TABS.map(({ label, to, exact }) => (
            <Link
              key={label}
              to={to}
              params={{ clusterId, topicName }}
              className="k-tab"
              activeProps={{ className: 'k-tab k-tab-active' }}
              activeOptions={{ exact }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
