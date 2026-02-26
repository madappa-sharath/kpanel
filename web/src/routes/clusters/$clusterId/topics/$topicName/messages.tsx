// Screen-5: Message Browser
// Fetch / stream messages from a topic

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { MessageBrowser } from '../../../../../components/topics/MessageBrowser'
import type { Message, PeekRequest } from '../../../../../types/topic'
import { api } from '../../../../../lib/api'

export function TopicMessagesPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setLoading] = useState(false)

  async function handleFetch(opts: { partition?: number; limit: number }) {
    setLoading(true)
    try {
      const data = await api.topics.peek(clusterId, topicName, opts as PeekRequest)
      setMessages(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="k-page">
      <MessageBrowser
        clusterId={clusterId}
        topicName={topicName}
        messages={messages}
        isLoading={isLoading}
        onFetch={handleFetch}
      />
    </div>
  )
}
