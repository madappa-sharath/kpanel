// Topic layout — tab bar shared by Overview, Partitions, Configuration, Messages

import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const TABS = [
  { label: 'Overview',      value: 'overview',      to: '/clusters/$clusterId/topics/$topicName' as const,               exact: true  },
  { label: 'Partitions',    value: 'partitions',    to: '/clusters/$clusterId/topics/$topicName/partitions' as const,    exact: false },
  { label: 'Configuration', value: 'config',        to: '/clusters/$clusterId/topics/$topicName/config' as const,        exact: false },
  { label: 'Messages',      value: 'messages',      to: '/clusters/$clusterId/topics/$topicName/messages' as const,      exact: false },
]

export function TopicLayout() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const activeTab = pathname.endsWith('/partitions')
    ? 'partitions'
    : pathname.endsWith('/config')
    ? 'config'
    : pathname.endsWith('/messages')
    ? 'messages'
    : 'overview'

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
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
        <Outlet />
      </div>
    </div>
  )
}
