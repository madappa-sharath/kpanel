// Screen-3: Topic List

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { TopicTable } from '../../../../components/topics/TopicTable'
import { useTopics } from '../../../../hooks/useTopics'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { CreateTopicModal } from '../../../../components/topics/CreateTopicModal'

const PAGE_SIZE = 15

/** Returns page numbers and ellipsis markers for a window of max 7 items. */
function getPageRange(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', pageCount]
  if (page >= pageCount - 3) return [1, 'ellipsis', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pageCount]
}

export function TopicsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: topics, isLoading, error } = useTopics(clusterId)
  const [search, setSearch] = useState('')
  const [showInternal, setShowInternal] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [page, setPage] = useState(1)

  const allTopics = topics ?? []
  const visibleTopics = allTopics.filter((t) => {
    if (!showInternal && t.internal) return false
    return t.name.toLowerCase().includes(search.toLowerCase())
  })

  const pageCount = Math.ceil(visibleTopics.length / PAGE_SIZE)
  const pagedTopics = visibleTopics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showPagination = visibleTopics.length > PAGE_SIZE

  const totalPartitions = allTopics.reduce((sum, t) => sum + t.partitions, 0)
  const hiddenInternalCount = allTopics.filter((t) => t.internal && !showInternal).length
  const degradedCount = allTopics.filter((t) => t.isr_health === 'degraded').length

  return (
    <div className="p-6">
      <PageHeader title="Topics" description={`${allTopics.length} topics · ${totalPartitions} partitions`}>
        <Input
          type="search"
          placeholder="Search topics…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-48"
        />
        <Button onClick={() => setCreateOpen(true)}>Create Topic</Button>
      </PageHeader>

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
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setShowInternal(true); setPage(1) }}>
                show
              </Button>
            </span>
          )}
          {showInternal && hiddenInternalCount > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => { setShowInternal(false); setPage(1) }}>
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
        <TopicTable clusterId={clusterId} topics={pagedTopics} />
      )}

      {showPagination && (
        <div className="flex items-center justify-between mt-4">
          {/* Left: range label */}
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleTopics.length)} of {visibleTopics.length} topics
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

      <CreateTopicModal
        clusterId={clusterId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}
