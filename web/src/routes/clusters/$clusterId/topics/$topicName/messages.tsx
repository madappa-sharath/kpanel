// Screen-5: Message Browser
// Fetch messages from a topic with partition selector, seek by offset/timestamp, live tail

import { useState } from 'react'
import { useParams, useSearch } from '@tanstack/react-router'
import { MessageBrowser } from '../../../../../components/topics/MessageBrowser'
import { useTopic } from '../../../../../hooks/useTopics'
import type { Message, PeekRequest } from '../../../../../types/topic'
import { api } from '../../../../../lib/api'

export function TopicMessagesPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  // partition may be pre-selected from partitions tab click
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

  return (
    <div className="k-page">
      {fetchError && (
        <p style={{ color: 'var(--k-red)', fontSize: 13, marginBottom: 12 }}>{fetchError}</p>
      )}
      <MessageBrowser
        messages={messages}
        isLoading={isLoading}
        partitions={partitions}
        initialPartition={initialPartition}
        onFetch={handleFetch}
      />
    </div>
  )
}
