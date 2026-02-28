// Screen-3: Topic List
// Searchable table of all topics in the cluster

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { TopicTable } from '../../../../components/topics/TopicTable'
import { useTopics } from '../../../../hooks/useTopics'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { MessageSquare } from 'lucide-react'

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
    <div className="k-page">
      <PageHeader title="Topics" description={`${allTopics.length} topics · ${totalPartitions} partitions`}>
        <input
          type="search"
          placeholder="Search topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="k-input"
          style={{ width: 192 }}
        />
      </PageHeader>

      {/* Summary bar */}
      {!isLoading && !error && allTopics.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--k-muted)' }}>
          {degradedCount > 0 && (
            <span style={{ color: 'var(--k-amber)', fontWeight: 500 }}>
              ⚠ {degradedCount} topic{degradedCount > 1 ? 's' : ''} under-replicated
            </span>
          )}
          {hiddenInternalCount > 0 && (
            <span>
              {hiddenInternalCount} internal topic{hiddenInternalCount > 1 ? 's' : ''} hidden —{' '}
              <button
                onClick={() => setShowInternal(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--k-text)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
              >
                show
              </button>
            </span>
          )}
          {showInternal && hiddenInternalCount > 0 && (
            <button
              onClick={() => setShowInternal(false)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--k-muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >
              hide internal
            </button>
          )}
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>Loading topics…</p>}
      {error && <p style={{ color: 'var(--k-red)', fontSize: 15 }}>{(error as Error).message}</p>}
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
