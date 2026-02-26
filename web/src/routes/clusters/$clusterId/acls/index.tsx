// Screen-10: ACL List (conditional — when authorized)
// TODO: implement ACL list, create/delete ACL

import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { ShieldCheck } from 'lucide-react'

export function AclsPage() {
  useParams({ strict: false })

  return (
    <div className="k-page">
      <PageHeader title="Access Control" description="Kafka ACLs — principal, resource, operation" />
      <EmptyState
        icon={<ShieldCheck size={32} />}
        title="ACL management coming soon"
        description="List, create, and delete Kafka ACLs. Requires DESCRIBE and ALTER permissions on the cluster."
      />
    </div>
  )
}
