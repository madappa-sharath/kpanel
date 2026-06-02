// Screen-3: Topic List

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { TopicTable } from '../../../../components/topics/TopicTable'
import { useTopics } from '../../../../hooks/useTopics'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { MessageSquare, Plus } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
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
import { CreateTopicModal } from '../../../../components/topics/CreateTopicModal'
import { WriteModeBanner, WriteModeGate } from '../../../../components/shared/WriteModeControl'
import { useAppStore, type TopicListState } from '../../../../stores/appStore'
import type { Topic } from '../../../../types/topic'

const PAGE_SIZE = 15
type TopicSortKey = TopicListState['sortKey']

const DEFAULT_LIST_STATE: TopicListState = {
  search: '',
  showInternal: false,
  sortKey: 'name',
  sortDir: 'asc',
  page: 1,
}

/** Returns page numbers and ellipsis markers for a window of max 7 items. */
function getPageRange(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', pageCount]
  if (page >= pageCount - 3) return [1, 'ellipsis', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pageCount]
}

function compareNullableNumber(a: number | null, b: number | null, dir: 'asc' | 'desc') {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const result = a - b
  return dir === 'asc' ? result : -result
}

function compareTopics(a: Topic, b: Topic, key: TopicSortKey, dir: 'asc' | 'desc') {
  switch (key) {
    case 'name':
      return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    case 'partitions':
      return dir === 'asc' ? a.partitions - b.partitions : b.partitions - a.partitions
    case 'message_count':
      return compareNullableNumber(a.message_count, b.message_count, dir)
    case 'log_size_bytes':
      return compareNullableNumber(a.log_size_bytes, b.log_size_bytes, dir)
    case 'replication_factor':
      return dir === 'asc' ? a.replication_factor - b.replication_factor : b.replication_factor - a.replication_factor
    case 'isr_health': {
      const healthRank = { degraded: 0, healthy: 1 }
      const result = healthRank[a.isr_health] - healthRank[b.isr_health]
      return dir === 'asc' ? result : -result
    }
  }
}

export function TopicsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: topics, isLoading, error } = useTopics(clusterId)
  const [createOpen, setCreateOpen] = useState(false)
  const listState = useAppStore((state) => state.topicListStateByCluster[clusterId] ?? DEFAULT_LIST_STATE)
  const setTopicListState = useAppStore((state) => state.setTopicListState)
  const {
    search,
    showInternal,
    sortKey = DEFAULT_LIST_STATE.sortKey,
    sortDir = DEFAULT_LIST_STATE.sortDir,
  } = listState

  const allTopics = topics ?? []
  const visibleTopics = allTopics.filter((t) => {
    if (!showInternal && t.internal) return false
    return t.name.toLowerCase().includes(search.toLowerCase())
  })
  const sortedTopics = [...visibleTopics].sort((a, b) => {
    const result = compareTopics(a, b, sortKey, sortDir)
    if (result !== 0) return result
    return a.name.localeCompare(b.name)
  })

  const pageCount = Math.max(1, Math.ceil(sortedTopics.length / PAGE_SIZE))
  const page = Math.min(listState.page, pageCount)
  const pagedTopics = sortedTopics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showPagination = sortedTopics.length > PAGE_SIZE
  const handleSort = (key: keyof Topic & string) => {
    if (key === sortKey) {
      setTopicListState(clusterId, { sortDir: sortDir === 'asc' ? 'desc' : 'asc', page: 1 })
      return
    }
    setTopicListState(clusterId, {
      sortKey: key as TopicSortKey,
      sortDir: key === 'name' || key === 'isr_health' ? 'asc' : 'desc',
      page: 1,
    })
  }

  const totalPartitions = allTopics.reduce((sum, t) => sum + t.partitions, 0)
  const hiddenInternalCount = allTopics.filter((t) => t.internal && !showInternal).length
  const degradedCount = allTopics.filter((t) => t.isr_health === 'degraded').length

  return (
    <div className="p-6">
      <PageHeader title="Topics" description={`${allTopics.length} topics · ${totalPartitions} partitions`}>
        <WriteModeGate>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create Topic
          </Button>
        </WriteModeGate>
      </PageHeader>

      <WriteModeBanner description="Enable write mode to create topics from this cluster." />

      <div className="mb-4 flex items-center">
        <Input
          type="search"
          placeholder="Search topics…"
          value={search}
          onChange={(e) => setTopicListState(clusterId, { search: e.target.value, page: 1 })}
          className="max-w-sm"
        />
      </div>

      {/* Summary bar */}
      {!isLoading && !error && allTopics.length > 0 && (degradedCount > 0 || hiddenInternalCount > 0) && (
        <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
          {degradedCount > 0 && (
            <span className="text-amber-600 font-medium">
              ⚠ {degradedCount} topic{degradedCount > 1 ? 's' : ''} under-replicated
            </span>
          )}
          {hiddenInternalCount > 0 && (
            <span>
              {hiddenInternalCount} internal topic{hiddenInternalCount > 1 ? 's' : ''} hidden —{' '}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setTopicListState(clusterId, { showInternal: true, page: 1 })}>
                show
              </Button>
            </span>
          )}
          {showInternal && hiddenInternalCount > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setTopicListState(clusterId, { showInternal: false, page: 1 })}>
              hide internal
            </Button>
          )}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Loading topics…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      {!isLoading && !error && visibleTopics.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No topics found"
          description={search ? 'Try a different search term' : 'This cluster has no topics yet'}
        />
      )}
      {!isLoading && visibleTopics.length > 0 && (
        <TopicTable
          clusterId={clusterId}
          topics={pagedTopics}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}

      {showPagination && (
        <div className="flex items-center justify-between mt-4">
          {/* Left: range label */}
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedTopics.length)} of {sortedTopics.length} topics
          </p>

          {/* Center: page number links */}
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setTopicListState(clusterId, { page: Math.max(1, page - 1) })
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
                        setTopicListState(clusterId, { page: item })
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
                    setTopicListState(clusterId, { page: Math.min(pageCount, page + 1) })
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
            <Select value={String(page)} onValueChange={(v) => setTopicListState(clusterId, { page: Number(v) })}>
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

      <WriteModeGate>
        <CreateTopicModal
          clusterId={clusterId}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      </WriteModeGate>
    </div>
  )
}
