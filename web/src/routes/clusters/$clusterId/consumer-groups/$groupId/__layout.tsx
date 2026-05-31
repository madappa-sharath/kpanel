// Consumer Group layout — tab bar for Members, Offsets, Lag

import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ResetOffsetsModal } from '../../../../../components/consumer-groups/ResetOffsetsModal'
import { WriteModeBanner, WriteModeGate } from '../../../../../components/shared/WriteModeControl'
import { useConsumerGroup, useLagHistory } from '../../../../../hooks/useConsumerGroups'
import { StatusBadge, groupStateVariant } from '../../../../../components/shared/StatusBadge'
import { formatNumber } from '../../../../../lib/utils'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

const TABS = [
  { label: 'Members', value: 'members', to: '/clusters/$clusterId/consumer-groups/$groupId/members' as const },
  { label: 'Offsets', value: 'offsets', to: '/clusters/$clusterId/consumer-groups/$groupId/offsets' as const },
  { label: 'Lag',     value: 'lag',     to: '/clusters/$clusterId/consumer-groups/$groupId/lag'     as const },
]

export function GroupLayout() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [showReset, setShowReset] = useState(false)
  const { data: group } = useConsumerGroup(clusterId, groupId)
  // Keep lag polling alive on all tabs so history has no gaps.
  useLagHistory(clusterId, groupId)

  const totalLag = group?.offsets.reduce((sum, o) => sum + o.lag, 0) ?? 0

  const activeTab = pathname.endsWith('/offsets')
    ? 'offsets'
    : pathname.endsWith('/lag')
    ? 'lag'
    : 'members'

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Breadcrumb + actions */}
      <div className="min-w-0 px-6 pt-5">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link
              to="/clusters/$clusterId/consumer-groups"
              params={{ clusterId }}
              className="shrink-0 text-muted-foreground no-underline hover:text-foreground transition-colors"
            >
              Consumer Groups
            </Link>
            <ChevronRight size={13} className="shrink-0" />
            <span className="min-w-0 truncate text-foreground font-mono text-sm">{groupId}</span>
          </div>
          <WriteModeGate>
            <Button variant="ghost" size="sm" onClick={() => setShowReset(true)}>
              Reset offsets ▾
            </Button>
          </WriteModeGate>
        </div>

        {/* Stats row */}
        {group && (
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <StatusBadge variant={groupStateVariant(group.state)} label={group.state} />
            <span className="text-muted-foreground">
              Lag:{' '}
              <span className={cn(
                'font-semibold',
                totalLag > 10_000 ? 'text-destructive' : totalLag > 1_000 ? 'text-amber-600' : 'text-foreground',
              )}>
                {formatNumber(totalLag)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Members: <span className="text-foreground">{group.members.length}</span>
            </span>
            <span className="text-muted-foreground">
              Coordinator: <span className="text-foreground">broker-{group.coordinator_id}</span>
            </span>
            {group.protocol && (
              <span className="text-muted-foreground">
                Protocol: <span className="text-foreground">{group.protocol}</span>
              </span>
            )}
          </div>
        )}

        {/* Tab bar */}
        <Tabs value={activeTab}>
          <TabsList>
            {TABS.map(({ label, value, to }) => (
              <TabsTrigger key={value} value={value} asChild>
                <Link to={to} params={{ clusterId, groupId }}>
                  {label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <WriteModeBanner
          className="mt-4"
          description="Enable write mode to reset offsets for this consumer group."
        />
      </div>

      <div className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </div>

      <WriteModeGate>
        <ResetOffsetsModal
          open={showReset}
          clusterId={clusterId}
          groupId={groupId}
          onClose={() => setShowReset(false)}
        />
      </WriteModeGate>
    </div>
  )
}
