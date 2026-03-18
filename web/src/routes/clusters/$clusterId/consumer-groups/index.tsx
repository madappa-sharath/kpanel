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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

const PAGE_SIZE = 15
const ALL_STATES = ['Stable', 'Empty', 'PreparingRebalance', 'CompletingRebalance', 'Dead']

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
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [page, setPage] = useState(1)

  const filtered = (groups ?? []).filter((g) => {
    const matchSearch = g.id.toLowerCase().includes(search.toLowerCase())
    const matchState = !stateFilter || g.state === stateFilter
    return matchSearch && matchState
  })

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const pagedGroups = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showPagination = filtered.length > PAGE_SIZE

  return (
    <div className="p-6">
      <PageHeader title="Consumer Groups" description={`${groups?.length ?? '…'} groups`}>
        <Select value={stateFilter || 'all'} onValueChange={(v) => { setStateFilter(v === 'all' ? '' : v); setPage(1) }}>
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
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
        <GroupTable clusterId={clusterId} groups={pagedGroups} />
      )}

      {showPagination && (
        <div className="flex items-center justify-between mt-4">
          {/* Left: range label */}
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} groups
          </p>

          {/* Center: page number links */}
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)) }}
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
                      onClick={(e) => { e.preventDefault(); setPage(item) }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage(p => Math.min(pageCount, p + 1)) }}
                  aria-disabled={page === pageCount}
                  className={page === pageCount ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          {/* Right: jump-to-page select */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Go to</span>
            <Select value={String(page)} onValueChange={(v) => setPage(Number(v))}>
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
