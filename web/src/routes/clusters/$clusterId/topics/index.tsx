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

export function TopicsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: topics, isLoading, error } = useTopics(clusterId)
  const [search, setSearch] = useState('')
  const [showInternal, setShowInternal] = useState(false)

  const allTopics = topics ?? []
  const visibleTopics = allTopics.filter((t) => {
    if (!showInternal && t.internal) return false
    return t.name.toLowerCase().includes(search.toLowerCase())
  })

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
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
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
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowInternal(true)}>
                show
              </Button>
            </span>
          )}
          {showInternal && hiddenInternalCount > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setShowInternal(false)}>
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
        <TopicTable clusterId={clusterId} topics={visibleTopics} />
      )}
    </div>
  )
}
