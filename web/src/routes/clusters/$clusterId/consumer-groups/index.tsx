// Screen-7: Consumer Group List

import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { GroupTable } from '../../../../components/consumer-groups/GroupTable'
import { useConsumerGroups } from '../../../../hooks/useConsumerGroups'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { ArrowDownWideNarrow, ListFilter, Search, Users } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'
import { useAppStore, type GroupListState } from '../../../../stores/appStore'

const PAGE_SIZE = 15
const ALL_STATES = ['Stable', 'Empty', 'PreparingRebalance', 'CompletingRebalance', 'Dead']
const DEFAULT_LIST_STATE: GroupListState = {
  search: '',
  stateFilter: '',
  sortBy: 'lag-desc',
  page: 1,
}

/** Returns page numbers and ellipsis markers for a window of max 7 items. */
function getPageRange(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', pageCount]
  if (page >= pageCount - 3) return [1, 'ellipsis', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pageCount]
}

export function GroupsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: groups, isLoading, error } = useConsumerGroups(clusterId)
  const listState = useAppStore((state) => state.groupListStateByCluster[clusterId] ?? DEFAULT_LIST_STATE)
  const setGroupListState = useAppStore((state) => state.setGroupListState)
  const { search, stateFilter, sortBy } = listState

  const filtered = (groups ?? []).filter((g) => {
    const matchSearch = g.id.toLowerCase().includes(search.toLowerCase())
    const matchState = !stateFilter || g.state === stateFilter
    return matchSearch && matchState
  })
  const sortedGroups = [...filtered].sort((a, b) => {
    if (sortBy === 'lag-asc') return a.total_lag - b.total_lag || a.id.localeCompare(b.id)
    if (sortBy === 'group-id') return a.id.localeCompare(b.id)
    return b.total_lag - a.total_lag || a.id.localeCompare(b.id)
  })

  const pageCount = Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE))
  const page = Math.min(listState.page, pageCount)
  const pagedGroups = sortedGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showPagination = sortedGroups.length > PAGE_SIZE

  return (
    <div className="p-6">
      <PageHeader title="Consumer Groups" description={`${groups?.length ?? '…'} groups`}>
        <div role="toolbar" aria-label="Consumer group controls" className="flex items-center gap-2">
          <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <div className="flex items-center gap-2 pl-3 pr-1 text-sm text-muted-foreground">
              <ListFilter className="size-4" aria-hidden="true" />
              <span>State</span>
            </div>
            <Select value={stateFilter || 'all'} onValueChange={(v) => setGroupListState(clusterId, { stateFilter: v === 'all' ? '' : v, page: 1 })}>
              <SelectTrigger className="h-9 w-32 border-0 bg-transparent pl-2 pr-3 shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {ALL_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <div className="flex items-center gap-2 pl-3 pr-1 text-sm text-muted-foreground">
              <ArrowDownWideNarrow className="size-4" aria-hidden="true" />
              <span>Sort</span>
            </div>
            <Select value={sortBy} onValueChange={(v) => setGroupListState(clusterId, { sortBy: v as GroupListState['sortBy'], page: 1 })}>
              <SelectTrigger className="h-9 w-36 border-0 bg-transparent pl-2 pr-3 shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lag-desc">Total lag ↓</SelectItem>
                <SelectItem value="lag-asc">Total lag ↑</SelectItem>
                <SelectItem value="group-id">Group ID A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search groups…"
              value={search}
              onChange={(e) => setGroupListState(clusterId, { search: e.target.value, page: 1 })}
              className="w-48 pl-9"
            />
          </div>
        </div>
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
        <GroupTable clusterId={clusterId} groups={pagedGroups} />
      )}

      {showPagination && (
        <div className="flex items-center justify-between mt-4">
          {/* Left: range label */}
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedGroups.length)} of {sortedGroups.length} groups
          </p>

          {/* Center: page number links */}
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setGroupListState(clusterId, { page: Math.max(1, page - 1) })
                  }}
                  aria-disabled={page === 1}
                  className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {getPageRange(page, pageCount).map((item, i) =>
                item === 'ellipsis' ? (
                  <PaginationItem key={`ellipsis-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href="#"
                      isActive={item === page}
                      onClick={(e) => {
                        e.preventDefault()
                        setGroupListState(clusterId, { page: item })
                      }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setGroupListState(clusterId, { page: Math.min(pageCount, page + 1) })
                  }}
                  aria-disabled={page === pageCount}
                  className={page === pageCount ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          {/* Right: jump-to-page select */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Go to</span>
            <Select value={String(page)} onValueChange={(v) => setGroupListState(clusterId, { page: Number(v) })}>
              <SelectTrigger className="w-20 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
