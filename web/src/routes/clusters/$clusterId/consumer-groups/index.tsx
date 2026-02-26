// Screen-7: Consumer Group List

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { GroupTable } from '../../../../components/consumer-groups/GroupTable'
import { useConsumerGroups } from '../../../../hooks/useConsumerGroups'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { Users } from 'lucide-react'

export function GroupsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: groups, isLoading, error } = useConsumerGroups(clusterId)
  const [search, setSearch] = useState('')

  const filtered = (groups ?? []).filter((g) =>
    g.id.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="k-page">
      <PageHeader title="Consumer Groups" description={`${groups?.length ?? '…'} groups`}>
        <input
          type="search"
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="k-input"
          style={{ width: 192 }}
        />
      </PageHeader>

      {isLoading && <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>Loading consumer groups…</p>}
      {error && <p style={{ color: 'var(--k-red)', fontSize: 15 }}>{(error as Error).message}</p>}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<Users size={32} />}
          title="No consumer groups found"
          description={search ? 'Try a different search term' : 'No consumer groups in this cluster'}
        />
      )}
      {!isLoading && filtered.length > 0 && (
        <GroupTable clusterId={clusterId} groups={filtered} />
      )}
    </div>
  )
}
