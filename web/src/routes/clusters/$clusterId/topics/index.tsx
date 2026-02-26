// Screen-3: Topic List
// Searchable table of all topics in the cluster

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { TopicTable } from '../../../../components/topics/TopicTable'
import { CreateTopicModal } from '../../../../components/topics/CreateTopicModal'
import { useTopics } from '../../../../hooks/useTopics'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { MessageSquare } from 'lucide-react'

export function TopicsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: topics, isLoading, error } = useTopics(clusterId)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = (topics ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="k-page">
      <PageHeader title="Topics" description={`${topics?.length ?? '…'} topics`}>
        <input
          type="search"
          placeholder="Search topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="k-input"
          style={{ width: 192 }}
        />
        <button onClick={() => setShowCreate(true)} className="k-btn k-btn-primary">
          + New Topic
        </button>
      </PageHeader>

      {isLoading && <p style={{ color: 'var(--k-muted)', fontSize: 15 }}>Loading topics…</p>}
      {error && <p style={{ color: 'var(--k-red)', fontSize: 15 }}>{(error as Error).message}</p>}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No topics found"
          description={search ? 'Try a different search term' : 'This cluster has no topics yet'}
        />
      )}
      {!isLoading && filtered.length > 0 && (
        <TopicTable clusterId={clusterId} topics={filtered} />
      )}

      <CreateTopicModal
        clusterId={clusterId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  )
}
