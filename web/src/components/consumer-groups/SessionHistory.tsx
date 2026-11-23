import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useLagHistory } from '../../hooks/useConsumerGroups'
import { LagChart } from './LagChart'
import { ThroughputChart, ThroughputSummary } from './ThroughputChart'

interface SessionHistoryProps {
  clusterId: string
  groupId: string
}

export function SessionHistory({ clusterId, groupId }: SessionHistoryProps) {
  const { data: snapshots, isLoading, error } = useLagHistory(clusterId, groupId)

  let body: ReactNode
  if (isLoading) {
    body = <Placeholder>Loading lag history…</Placeholder>
  } else if (error) {
    body = <Placeholder className="text-destructive">{(error as Error).message}</Placeholder>
  } else if (!snapshots?.length) {
    body = <Placeholder>No lag history yet. Snapshots are collected every 15 s while this tab is open.</Placeholder>
  } else {
    body = (
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">Consumer lag — messages</p>
          <LagChart snapshots={snapshots} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">Throughput — messages/s produced vs committed</p>
          <ThroughputChart snapshots={snapshots} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Live Session</span>
          <span>
            {' '}· every 15 s while this tab is open
            {snapshots?.length ? ` · ${snapshots.length} sample${snapshots.length !== 1 ? 's' : ''}` : ''}
          </span>
        </p>
        {snapshots?.length ? <ThroughputSummary snapshots={snapshots} /> : null}
      </div>
      <div className="min-w-0 rounded-md border bg-card p-4">{body}</div>
    </div>
  )
}

function Placeholder({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-48 items-center justify-center text-sm text-muted-foreground', className)}>{children}</div>
}
