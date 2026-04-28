import { Outlet } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { UpdateBanner } from './UpdateBanner'

export function AppShell() {
  return (
    <div
      className="bg-background text-foreground"
      style={{
        display: 'grid',
        gridTemplateColumns: 'var(--sidebar-w) 1fr',
        gridTemplateRows: 'var(--header-h) 1fr',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar spans both rows */}
      <div style={{ gridRow: '1 / -1' }}>
        <Sidebar />
      </div>

      {/* Header */}
      <Header />

      {/* Main content */}
      <main className="overflow-auto bg-background flex flex-col">
        <UpdateBanner />
        <Outlet />
      </main>
    </div>
  )
}
