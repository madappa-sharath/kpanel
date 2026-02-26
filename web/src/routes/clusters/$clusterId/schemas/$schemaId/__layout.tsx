// Schema detail layout — breadcrumb wrapper, ready for tabs when implemented.

import { Link, Outlet, useParams } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

export function SchemaLayout() {
  const { clusterId, schemaId } = useParams({ strict: false }) as {
    clusterId: string
    schemaId: string
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)', marginBottom: 16 }}>
          <Link
            to="/clusters/$clusterId/schemas"
            params={{ clusterId }}
            style={{ color: 'var(--k-muted)', textDecoration: 'none' }}
          >
            Schemas
          </Link>
          <ChevronRight size={13} />
          <span style={{ color: 'var(--k-text)', fontFamily: 'var(--k-font)' }}>{schemaId}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
