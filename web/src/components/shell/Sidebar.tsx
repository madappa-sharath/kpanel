import { Link, useParams } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Server,
  MessageSquare,
  Users,
  Database,
  ShieldCheck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

const NAV = [
  { label: 'Dashboard',       icon: LayoutDashboard, to: '/clusters/$clusterId'                as const, exact: true  },
  { label: 'Brokers',         icon: Server,           to: '/clusters/$clusterId/brokers'        as const, exact: false },
  { label: 'Topics',          icon: MessageSquare,    to: '/clusters/$clusterId/topics'         as const, exact: false },
  { label: 'Consumer Groups', icon: Users,            to: '/clusters/$clusterId/consumer-groups' as const, exact: false },
  { label: 'Schemas',         icon: Database,         to: '/clusters/$clusterId/schemas'        as const, exact: false },
  { label: 'ACLs',            icon: ShieldCheck,      to: '/clusters/$clusterId/acls'           as const, exact: false },
]

export function Sidebar() {
  const params          = useParams({ strict: false }) as { clusterId?: string }
  const activeClusterId = useAppStore((s) => s.activeClusterId)
  const collapsed       = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar   = useAppStore((s) => s.toggleSidebar)
  const clusterId       = params.clusterId ?? activeClusterId

  return (
    <aside
      style={{
        width:      collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        height:     '100%',
        background: 'var(--k-surface)',
        borderRight: '1px solid var(--k-border)',
        display:    'flex',
        flexDirection: 'column',
        overflow:   'hidden',
        transition: 'width 180ms ease',
        flexShrink: 0,
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          height: 'var(--header-h)',
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0' : '0 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid var(--k-border)',
          flexShrink: 0,
          gap: 10,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            background: 'var(--k-amber)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontWeight: 600,
            fontSize: 14,
            color: '#000',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--k-font)',
          }}
        >
          k
        </div>
        {!collapsed && (
          <span
            style={{
              fontFamily: 'var(--k-font)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--k-text)',
              letterSpacing: '-0.01em',
              opacity: collapsed ? 0 : 1,
              transition: 'opacity 120ms ease',
            }}
          >
            kpanel
          </span>
        )}
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {clusterId ? (
          NAV.map(({ label, icon: Icon, to, exact }) => (
            <Link
              key={label}
              to={to}
              params={{ clusterId }}
              activeOptions={{ exact }}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <div
                  className="k-nav-item"
                  style={{
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '8px' : '8px 12px',
                    ...(isActive ? {
                      color: 'var(--k-amber)',
                      background: 'var(--k-amber-dim)',
                      borderColor: 'var(--k-amber-border)',
                    } : {}),
                  }}
                  title={collapsed ? label : undefined}
                >
                  <Icon
                    size={15}
                    style={{ flexShrink: 0, color: isActive ? 'var(--k-amber)' : 'inherit' }}
                  />
                  {!collapsed && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {label}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))
        ) : (
          !collapsed && (
            <p style={{ padding: '8px 12px', color: 'var(--k-faint)', fontSize: 11 }}>
              No cluster selected
            </p>
          )
        )}
      </nav>

      {/* Bottom: settings + collapse toggle */}
      <div
        style={{
          padding: '6px',
          borderTop: '1px solid var(--k-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Link to="/settings" style={{ textDecoration: 'none' }}>
          {({ isActive }) => (
            <div
              className="k-nav-item"
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '8px' : '8px 12px',
                ...(isActive ? {
                  color: 'var(--k-amber)',
                  background: 'var(--k-amber-dim)',
                  borderColor: 'var(--k-amber-border)',
                } : {}),
              }}
              title={collapsed ? 'Settings' : undefined}
            >
              <Settings size={15} style={{ flexShrink: 0 }} />
              {!collapsed && <span>Settings</span>}
            </div>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="k-nav-item"
          style={{
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px' : '8px 12px',
            width: '100%',
            background: 'none',
            border: '1px solid transparent',
            cursor: 'pointer',
          }}
        >
          {collapsed
            ? <PanelLeftOpen size={15} style={{ flexShrink: 0 }} />
            : <><PanelLeftClose size={15} style={{ flexShrink: 0 }} /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  )
}
