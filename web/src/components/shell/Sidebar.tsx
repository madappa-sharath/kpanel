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
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/appStore'

const NAV = [
  { label: 'Dashboard',       icon: LayoutDashboard, to: '/clusters/$clusterId'                 as const, exact: true  },
  { label: 'Brokers',         icon: Server,          to: '/clusters/$clusterId/brokers'         as const, exact: false },
  { label: 'Topics',          icon: MessageSquare,   to: '/clusters/$clusterId/topics'          as const, exact: false },
  { label: 'Consumer Groups', icon: Users,           to: '/clusters/$clusterId/consumer-groups' as const, exact: false },
  { label: 'Schemas',         icon: Database,        to: '/clusters/$clusterId/schemas'         as const, exact: false },
  { label: 'ACLs',            icon: ShieldCheck,     to: '/clusters/$clusterId/acls'            as const, exact: false },
  { label: 'Connection',      icon: Settings,        to: '/clusters/$clusterId/settings'        as const, exact: false },
]

const navItemClass = (isActive: boolean, collapsed: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-md text-sm transition-colors cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent',
    isActive && 'bg-accent text-accent-foreground font-medium',
    collapsed ? 'justify-center p-2' : 'px-3 py-2',
  )

export function Sidebar() {
  const params          = useParams({ strict: false }) as { clusterId?: string }
  const activeClusterId = useAppStore((s) => s.activeClusterId)
  const collapsed       = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar   = useAppStore((s) => s.toggleSidebar)
  const clusterId       = params.clusterId ?? activeClusterId

  return (
    <aside
      className="bg-card border-r border-border flex flex-col overflow-hidden"
      style={{
        width:      collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)',
        height:     '100%',
        transition: 'width 180ms ease',
        flexShrink: 0,
      }}
    >
      {/* Logo mark — links to /welcome (add / switch / delete clusters) */}
      <Link
        to="/welcome"
        className="no-underline border-b border-border flex items-center gap-2.5 flex-shrink-0 hover:bg-accent transition-colors"
        style={{
          height:          'var(--header-h)',
          padding:         collapsed ? '0' : '0 12px',
          justifyContent:  collapsed ? 'center' : 'flex-start',
        }}
        title="Manage clusters"
      >
        <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center flex-shrink-0 font-semibold text-sm text-black font-mono">
          k
        </div>
        {!collapsed && (
          <span className="text-sm font-medium text-foreground">
            kpanel
          </span>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 p-1.5 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {clusterId ? (
          NAV.map(({ label, icon: Icon, to, exact }) => (
            <Link
              key={label}
              to={to}
              params={{ clusterId }}
              activeOptions={{ exact }}
              className="no-underline"
            >
              {({ isActive }) => (
                <div
                  className={navItemClass(isActive, collapsed)}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  {!collapsed && (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {label}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))
        ) : (
          !collapsed && (
            <p className="px-3 py-2 text-xs text-muted-foreground/50">
              No cluster selected
            </p>
          )
        )}
      </nav>

      {/* Bottom: settings + collapse toggle */}
      <div className="p-1.5 border-t border-border flex flex-col gap-0.5">
        <Link to="/settings" className="no-underline">
          {({ isActive }) => (
            <div
              className={navItemClass(isActive, collapsed)}
              title={collapsed ? 'Settings' : undefined}
            >
              <Settings size={15} className="flex-shrink-0" />
              {!collapsed && <span>Settings</span>}
            </div>
          )}
        </Link>

        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={navItemClass(false, collapsed) + ' w-full bg-transparent border-transparent'}
        >
          {collapsed
            ? <PanelLeftOpen size={15} className="flex-shrink-0" />
            : <><PanelLeftClose size={15} className="flex-shrink-0" /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  )
}
