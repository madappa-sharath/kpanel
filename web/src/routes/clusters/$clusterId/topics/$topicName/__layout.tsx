// Topic layout — tab bar shared by Overview, Partitions, Configuration, Messages

import { useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useRouterState, useSearch } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useTopic } from '../../../../../hooks/useTopics'
import { IncreasePartitionsModal } from '../../../../../components/topics/IncreasePartitionsModal'
import { DeleteTopicModal } from '../../../../../components/topics/DeleteTopicModal'
import { MessageBrowser } from '../../../../../components/topics/MessageBrowser'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Message, PeekRequest, SearchRequest, SearchResponse } from '../../../../../types/topic'
import { api } from '../../../../../lib/api'

const TABS = [
  { label: 'Overview',      value: 'overview',      to: '/clusters/$clusterId/topics/$topicName' as const,               exact: true  },
  { label: 'Partitions',    value: 'partitions',    to: '/clusters/$clusterId/topics/$topicName/partitions' as const,    exact: false },
  { label: 'Configuration', value: 'config',        to: '/clusters/$clusterId/topics/$topicName/config' as const,        exact: false },
  { label: 'Messages',      value: 'messages',      to: '/clusters/$clusterId/topics/$topicName/messages' as const,      exact: false },
]

export function TopicLayout() {
  const navigate = useNavigate()
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic } = useTopic(clusterId, topicName)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [showIncrease, setShowIncrease] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const { partition: initialPartition } = useSearch({ strict: false }) as { partition?: number }

  const activeTab = pathname.endsWith('/partitions')
    ? 'partitions'
    : pathname.endsWith('/config')
    ? 'config'
    : pathname.endsWith('/messages')
    ? 'messages'
    : 'overview'

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
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link
              to="/clusters/$clusterId/topics"
              params={{ clusterId }}
              className="text-muted-foreground no-underline hover:text-foreground transition-colors"
            >
              Topics
            </Link>
            <ChevronRight size={13} />
            <span className="text-foreground font-mono text-sm">{topicName}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowIncrease(true)}
              disabled={!topic}
            >
              Increase Partitions
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
            >
              Delete Topic
            </Button>
          </div>
        </div>

        {/* Tab bar using shadcn Tabs */}
        <Tabs value={activeTab}>
          <TabsList>
            {TABS.map(({ label, value, to, exact }) => (
              <TabsTrigger key={value} value={value} asChild>
                <Link
                  to={to}
                  params={{ clusterId, topicName }}
                  activeOptions={{ exact }}
                >
                  {label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Non-messages tabs */}
        <div className={cn(activeTab === 'messages' && 'hidden')}>
          <Outlet />
        </div>

        {/* Messages tab — always mounted, hidden when inactive */}
        <div className={cn('p-6 h-full flex flex-col', activeTab !== 'messages' && 'hidden')}>
          {fetchError && <p className="text-destructive text-sm mb-3">{fetchError}</p>}
          <div className="flex-1 min-h-0">
            <MessageBrowser
              messages={messages}
              isLoading={isLoading}
              partitions={partitions}
              initialPartition={initialPartition}
              isVisible={activeTab === 'messages'}
              onFetch={handleFetch}
              onSearch={handleSearch}
            />
          </div>
        </div>
      </div>

      {topic && (
        <IncreasePartitionsModal
          open={showIncrease}
          clusterId={clusterId}
          topicName={topicName}
          currentPartitions={topic.partitions.length}
          onClose={() => setShowIncrease(false)}
        />
      )}

      <DeleteTopicModal
        open={showDelete}
        clusterId={clusterId}
        topicName={topicName}
        onDeleted={() => {
          setShowDelete(false)
          navigate({
            to: '/clusters/$clusterId/topics',
            params: { clusterId },
          })
        }}
        onClose={() => setShowDelete(false)}
      />
    </div>
  )
}
