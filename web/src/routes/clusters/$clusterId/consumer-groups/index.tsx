// Screen-7: Consumer Group List

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { GroupTable } from '../../../../components/consumer-groups/GroupTable'
import { useConsumerGroups } from '../../../../hooks/useConsumerGroups'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { Users } from 'lucide-react'

const ALL_STATES = ['Stable', 'Empty', 'PreparingRebalance', 'CompletingRebalance', 'Dead']

export function GroupsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: groups, isLoading, error } = useConsumerGroups(clusterId)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const filtered = (groups ?? []).filter((g) => {
    const matchSearch = g.id.toLowerCase().includes(search.toLowerCase())
    const matchState = !stateFilter || g.state === stateFilter
    return matchSearch && matchState
  })

  return (
    <div className="k-page">
      <PageHeader title="Consumer Groups" description={`${groups?.length ?? '…'} groups`}>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="k-input"
          style={{ width: 160 }}
        >
          <option value="">All states</option>
          {ALL_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
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
          description={search || stateFilter ? 'Try a different filter' : 'No consumer groups in this cluster'}
        />
      )}
      {!isLoading && filtered.length > 0 && (
        <GroupTable clusterId={clusterId} groups={filtered} />
      )}
    </div>
  )
}
