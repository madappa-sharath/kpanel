// Topic layout — tab bar shared by Overview, Partitions, Configuration, Messages, Search

import { useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useRouterState, useSearch } from '@tanstack/react-router'
import { ChevronRight, Plus, Send, Trash2 } from 'lucide-react'
import { useTopic } from '../../../../../hooks/useTopics'
import { IncreasePartitionsModal } from '../../../../../components/topics/IncreasePartitionsModal'
import { DeleteTopicModal } from '../../../../../components/topics/DeleteTopicModal'
import { MessageBrowser } from '../../../../../components/topics/MessageBrowser'
import { MessageSearch } from '../../../../../components/topics/MessageSearch'
import { ProduceMessageModal } from '../../../../../components/topics/ProduceMessageModal'
import { WriteModeBanner, WriteModeGate } from '../../../../../components/shared/WriteModeControl'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { Message, PeekRequest, SearchRequest, SearchResponse } from '../../../../../types/topic'
import { api } from '../../../../../lib/api'

const TABS = [
  { label: 'Overview',      value: 'overview',      to: '/clusters/$clusterId/topics/$topicName' as const,               exact: true  },
  { label: 'Partitions',    value: 'partitions',    to: '/clusters/$clusterId/topics/$topicName/partitions' as const,    exact: false },
  { label: 'Configuration', value: 'config',        to: '/clusters/$clusterId/topics/$topicName/config' as const,        exact: false },
  { label: 'Messages',      value: 'messages',      to: '/clusters/$clusterId/topics/$topicName/messages' as const,      exact: false },
  { label: 'Search',        value: 'search',        to: '/clusters/$clusterId/topics/$topicName/search' as const,        exact: false },
]

export function TopicLayout() {
  const navigate = useNavigate()
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic } = useTopic(clusterId, topicName)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [showProduce, setShowProduce] = useState(false)
  const [showIncrease, setShowIncrease] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const { partition: initialPartition } = useSearch({ strict: false }) as { partition?: number }

  // Read the segment after the topic name rather than matching a path suffix:
  // a topic literally named "messages" or "search" would otherwise hijack that
  // tab and make its own Overview unreachable.
  const afterTopics = pathname.split('/topics/')[1] ?? ''
  const slash = afterTopics.indexOf('/')
  const subPath = slash === -1 ? '' : afterTopics.slice(slash + 1)
  const activeTab =
    subPath === 'partitions' ? 'partitions'
    : subPath === 'config' ? 'config'
    : subPath === 'messages' ? 'messages'
    : subPath === 'search' ? 'search'
    : 'overview'
  const writeModeDescription =
    activeTab === 'config'
      ? 'Enable write mode to edit topic configuration values.'
      : activeTab === 'messages' || activeTab === 'search'
      ? 'Enable write mode to produce messages to this topic.'
      : activeTab === 'partitions'
      ? 'Enable write mode to increase partitions for this topic.'
      : 'Enable write mode to produce messages, increase partitions, or delete this topic.'

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

          <WriteModeGate>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 min-w-32"
                onClick={() => setShowProduce(true)}
                disabled={!topic}
              >
                <Send className="h-4 w-4" />
                Produce
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 min-w-40"
                onClick={() => setShowIncrease(true)}
                disabled={!topic}
              >
                <Plus className="h-4 w-4" />
                Increase Partitions
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-9 min-w-32"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Topic
              </Button>
            </div>
          </WriteModeGate>
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
        <WriteModeBanner
          className="mt-4"
          description={writeModeDescription}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {/* Tabs whose content comes from the router */}
        <div className={cn((activeTab === 'messages' || activeTab === 'search') && 'hidden')}>
          <Outlet />
        </div>

        {/* Messages tab — always mounted, hidden when inactive, so a fetched page
            and a live tail survive tab switches */}
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
            />
          </div>
        </div>

        {/* Search tab — also kept mounted so results are not lost on a detour */}
        <div className={cn('p-6 h-full flex flex-col', activeTab !== 'search' && 'hidden')}>
          <div className="flex-1 min-h-0">
            <MessageSearch partitions={partitions} onSearch={handleSearch} />
          </div>
        </div>
      </div>

      <WriteModeGate>
        <ProduceMessageModal
          open={showProduce}
          clusterId={clusterId}
          topicName={topicName}
          partitions={partitions}
          onClose={() => setShowProduce(false)}
        />

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
      </WriteModeGate>
    </div>
  )
}
