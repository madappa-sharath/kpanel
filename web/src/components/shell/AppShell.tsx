import { Outlet } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppStore } from '../../stores/appStore'

export function AppShell() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'} 1fr`,
        gridTemplateRows: 'var(--header-h) 1fr',
        height: '100vh',
        overflow: 'hidden',
        transition: 'grid-template-columns 180ms ease',
      }}
    >
      {/* Sidebar spans both rows */}
      <div style={{ gridRow: '1 / -1' }}>
        <Sidebar />
      </div>

      {/* Header */}
      <Header />

      {/* Main content */}
      <main
        style={{
          overflow: 'auto',
          background: 'var(--k-bg)',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
