// Screen-5: Message Browser

import { useState } from 'react'
import { useParams, useSearch } from '@tanstack/react-router'
import { MessageBrowser } from '../../../../../components/topics/MessageBrowser'
import { useTopic } from '../../../../../hooks/useTopics'
import type { Message, PeekRequest, SearchRequest, SearchResponse } from '../../../../../types/topic'
import { api } from '../../../../../lib/api'

export function TopicMessagesPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { partition: initialPartition } = useSearch({ strict: false }) as { partition?: number }

  const { data: topic } = useTopic(clusterId, topicName)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const partitions = (topic?.partitions ?? []).map((p) => p.partition)

  async function handleFetch(opts: PeekRequest) {
    setLoading(true)
    setFetchError(null)
    try {
      const data = await api.topics.peek(clusterId, topicName, opts)
      setMessages(data)
    } catch (err) {
      setFetchError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(opts: SearchRequest): Promise<SearchResponse> {
    return api.topics.search(clusterId, topicName, opts)
  }

  return (
    <div className="p-6">
      {fetchError && (
        <p className="text-destructive text-sm mb-3">{fetchError}</p>
      )}
      <MessageBrowser
        messages={messages}
        isLoading={isLoading}
        partitions={partitions}
        initialPartition={initialPartition}
        onFetch={handleFetch}
        onSearch={handleSearch}
      />
    </div>
  )
}
