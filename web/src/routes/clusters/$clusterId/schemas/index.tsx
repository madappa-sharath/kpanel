// Screen-9: Schema List (conditional — only when schema registry URL is configured)
// TODO: add schema registry URL field to cluster config

import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { Database } from 'lucide-react'

export function SchemasPage() {
  useParams({ strict: false })

  // TODO: check if cluster has schema_registry_url configured
  const hasRegistry = false

  return (
    <div className="k-page">
      <PageHeader title="Schema Registry" description="Avro, JSON Schema, and Protobuf schemas" />
      {hasRegistry ? (
        <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>TODO: implement schema list</p>
      ) : (
        <EmptyState
          icon={<Database size={32} />}
          title="No schema registry configured"
          description="Add a Schema Registry URL to the cluster settings to browse schemas"
        />
      )}
    </div>
  )
}
