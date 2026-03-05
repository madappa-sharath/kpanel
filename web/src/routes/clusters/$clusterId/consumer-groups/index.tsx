// Screen-7: Consumer Group List

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { GroupTable } from '../../../../components/consumer-groups/GroupTable'
import { useConsumerGroups } from '../../../../hooks/useConsumerGroups'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
    <div className="p-6">
      <PageHeader title="Consumer Groups" description={`${groups?.length ?? '…'} groups`}>
        <Select value={stateFilter || 'all'} onValueChange={(v) => setStateFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {ALL_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="search"
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </PageHeader>

      {isLoading && <p className="text-muted-foreground">Loading consumer groups…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}
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
