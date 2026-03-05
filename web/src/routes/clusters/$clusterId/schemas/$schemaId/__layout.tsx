// Schema detail layout — breadcrumb wrapper, ready for tabs when implemented.

import { Link, Outlet, useParams } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

export function SchemaLayout() {
  const { clusterId, schemaId } = useParams({ strict: false }) as {
    clusterId: string
    schemaId: string
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-0">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <Link
            to="/clusters/$clusterId/schemas"
            params={{ clusterId }}
            className="hover:text-foreground transition-colors"
          >
            Schemas
          </Link>
          <ChevronRight size={13} />
          <span className="text-foreground font-mono">{schemaId}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
