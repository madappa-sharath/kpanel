import { useParams, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { useClusters, useConnectionStatus, useClusterOverview } from '../../../hooks/useCluster'
import { PageHeader } from '../../../components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ClusterOverview } from '../../../types/broker'

type RuleStatus = 'good' | 'warning' | 'info' | null

interface BestPracticeRule {
  label: string
  kafkaKey: string
  category: 'Reliability' | 'Retention' | 'Governance' | 'Performance'
  check: (value: string, brokerCount: number) => RuleStatus
  recommendation: (value: string, brokerCount: number) => string
  why: string
}

const BEST_PRACTICE_RULES: BestPracticeRule[] = [
  {
    label: 'Replication Factor',
    kafkaKey: 'default.replication.factor',
    category: 'Reliability',
    check: (v, n) => { if (parseInt(v, 10) >= 3) return 'good'; return n === 1 ? 'info' : 'warning' },
    recommendation: (_v, n) => n === 1 ? 'Single-broker — not suitable for production' : 'Set ≥ 3 for production durability',
    why: 'RF < 3 means one broker failure can make you unrecoverable if another fails.',
  },
  {
    label: 'Min In-Sync Replicas',
    kafkaKey: 'min.insync.replicas',
    category: 'Reliability',
    check: (v, n) => { if (parseInt(v, 10) >= 2) return 'good'; return n === 1 ? 'info' : 'warning' },
    recommendation: (_v, n) => n === 1 ? 'Single-broker — only one replica possible' : 'Set ≥ 2 to prevent silent data loss',
    why: 'min.insync.replicas=1 allows acks=all writes to exist on only one broker.',
  },
  {
    label: 'Unclean Leader Election',
    kafkaKey: 'unclean.leader.election.enable',
    category: 'Reliability',
    check: (v) => (v === 'true' ? 'warning' : 'good'),
    recommendation: () => 'Disable to prevent data loss on failover',
    why: 'Out-of-sync replicas becoming leader can lose already-acknowledged messages.',
  },
  {
    label: 'Offsets Topic Replication',
    kafkaKey: 'offsets.topic.replication.factor',
    category: 'Reliability',
    check: (v, n) => { if (parseInt(v, 10) >= 3) return 'good'; return n === 1 ? 'info' : 'warning' },
    recommendation: (_v, n) => n === 1 ? 'Single-broker — consumer offset durability limited' : 'Set ≥ 3 to protect consumer group state',
    why: '__consumer_offsets stores group positions; low RF risks losing commit history.',
  },
  {
    label: 'Transaction Log Replication',
    kafkaKey: 'transaction.state.log.replication.factor',
    category: 'Reliability',
    check: (v, n) => { if (parseInt(v, 10) >= 3) return 'good'; return n === 1 ? 'info' : 'warning' },
    recommendation: (_v, n) => n === 1 ? 'Single-broker — transaction state durability limited' : 'Set ≥ 3 to protect transaction state',
    why: '__transaction_state needs sufficient replication to avoid coordinator outages.',
  },
  { label: 'Transaction Log Min ISR', kafkaKey: 'transaction.state.log.min.isr', category: 'Reliability', check: () => null, recommendation: () => '', why: '' },
  { label: 'Log Retention Hours', kafkaKey: 'log.retention.hours', category: 'Retention', check: () => null, recommendation: () => '', why: '' },
  {
    label: 'Log Retention Bytes',
    kafkaKey: 'log.retention.bytes',
    category: 'Retention',
    check: (v) => (v === '-1' ? 'info' : null),
    recommendation: () => 'Consider a byte cap to prevent disk exhaustion',
    why: 'Unlimited retention means disk fills until time-based retention kicks in.',
  },
  { label: 'Log Retention Ms', kafkaKey: 'log.retention.ms', category: 'Retention', check: () => null, recommendation: () => '', why: '' },
  {
    label: 'Auto-create Topics',
    kafkaKey: 'auto.create.topics.enable',
    category: 'Governance',
    check: (v) => (v === 'true' ? 'warning' : 'good'),
    recommendation: () => 'Disable to enforce explicit topic management',
    why: 'Auto-creation allows any producer to create topics with default (often poor) configs.',
  },
  {
    label: 'Delete Topic Enable',
    kafkaKey: 'delete.topic.enable',
    category: 'Governance',
    check: (v) => (v === 'false' ? 'warning' : 'good'),
    recommendation: () => 'Enable so topics can be deleted via admin API',
    why: 'With delete disabled, topic deletion requests are silently ignored.',
  },
  {
    label: 'Default Partitions',
    kafkaKey: 'num.partitions',
    category: 'Performance',
    check: (v) => (parseInt(v, 10) === 1 ? 'info' : null),
    recommendation: () => 'Consider increasing for better consumer parallelism',
    why: '1 default partition limits throughput and parallelism for auto-created topics.',
  },
  { label: 'Max Message Bytes', kafkaKey: 'message.max.bytes', category: 'Performance', check: () => null, recommendation: () => '', why: '' },
]

const CATEGORY_ORDER = ['Reliability', 'Retention', 'Governance', 'Performance'] as const

function ConfigStatusBadge({ status, title }: { status: RuleStatus; title?: string }) {
  if (status === null) return null
  if (status === 'warning') return <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400" title={title}>Warning</Badge>
  if (status === 'good') return <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950 dark:text-green-400" title={title}>OK</Badge>
  return <Badge variant="secondary" title={title}>Info</Badge>
}

function ConfigTable({ overview }: { overview: ClusterOverview }) {
  const brokerCount = overview.brokerCount

  return (
    <div className="rounded-md border overflow-hidden text-sm">
      <div className="grid px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground uppercase tracking-wider font-medium" style={{ gridTemplateColumns: '1fr 160px 1fr' }}>
        {['Config', 'Value', 'Status / Note'].map((col) => (
          <span key={col}>{col}</span>
        ))}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const rules = BEST_PRACTICE_RULES.filter((r) => r.category === category)
        const visibleRules = rules.filter((r) => overview.configs[r.kafkaKey] !== undefined)
        if (visibleRules.length === 0) return null

        const statusOrder: Record<string, number> = { warning: 0, info: 1, good: 2 }
        const sorted = [...visibleRules].sort((a, b) => {
          const ea = overview.configs[a.kafkaKey]
          const eb = overview.configs[b.kafkaKey]
          const sa = ea ? a.check(ea.value, brokerCount) : null
          const sb = eb ? b.check(eb.value, brokerCount) : null
          const oa = sa !== null ? (statusOrder[sa] ?? 3) : 3
          const ob = sb !== null ? (statusOrder[sb] ?? 3) : 3
          return oa - ob
        })

        return (
          <div key={category}>
            <div className="px-4 py-1 bg-muted/30 border-y text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {category}
            </div>
            {sorted.map((rule) => {
              const entry = overview.configs[rule.kafkaKey]
              if (!entry) return null
              const status = rule.check(entry.value, brokerCount)
              const isDefault = entry.source === 'default'

              return (
                <div
                  key={rule.kafkaKey}
                  className="grid px-4 py-2 border-b last:border-b-0 items-center gap-4 hover:bg-muted/30 transition-colors"
                  style={{ gridTemplateColumns: '1fr 160px 1fr' }}
                >
                  <div>
                    <span className="text-foreground">{rule.label}</span>
                    <span className="block text-xs font-mono text-muted-foreground/60 leading-tight">{rule.kafkaKey}</span>
                  </div>
                  <span className={cn('font-mono', isDefault && 'text-muted-foreground')}>
                    {entry.value}
                    {isDefault && <span className="ml-1.5 text-xs text-muted-foreground/50">default</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <ConfigStatusBadge status={status} title={rule.why || undefined} />
                    {(status === 'warning' || status === 'info') && (
                      <span className={cn(status === 'warning' ? 'text-amber-600' : 'text-muted-foreground')}>
                        {rule.recommendation(entry.value, brokerCount)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function DashboardPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { data: clusters } = useClusters()
  const { data: status, isLoading: statusLoading } = useConnectionStatus(clusterId)
  const { data: overview, isLoading } = useClusterOverview(clusterId)
  const cluster = clusters?.find((c) => c.id === clusterId)
  const [copied, setCopied] = useState(false)

  const platformLabel =
    cluster?.platform === 'aws' ? 'AWS MSK'
    : cluster?.platform === 'confluent' ? 'Confluent Cloud'
    : (cluster?.platform ?? 'Kafka')

  function copyClusterId() {
    if (overview?.clusterId) {
      navigator.clipboard.writeText(overview.clusterId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const isAWS = cluster?.platform === 'aws'
  const hasPartitionIssues = overview && (overview.offlinePartitions > 0 || overview.underReplicated > 0)
  const partitionSubtitle = overview
    ? overview.offlinePartitions > 0
      ? `${overview.offlinePartitions} offline`
      : overview.underReplicated > 0
      ? `${overview.underReplicated} under-replicated`
      : '● healthy'
    : ''

  return (
    <div className="p-6">
      <PageHeader title={cluster?.name ?? clusterId} description={platformLabel} />

      {/* Disconnected banner */}
      {status && !status.connected && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 text-destructive px-4 py-2.5 text-sm mb-6">
          Unable to connect to cluster{status.error ? `: ${status.error}` : ''}
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-md border bg-card p-5 flex flex-col gap-2.5">
              <Skeleton className="h-7 w-2/5" />
              <Skeleton className="h-2.5 w-3/5" />
            </div>
          ))
        ) : (
          <>
            {/* Brokers */}
            <div className="rounded-md border bg-card p-5 flex flex-col gap-1.5">
              <span className="text-2xl font-bold font-mono">{overview?.brokerCount ?? '—'}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Brokers</span>
              {overview && (
                <span className={cn(
                  'text-xs',
                  hasPartitionIssues ? (overview.offlinePartitions > 0 ? 'text-destructive' : 'text-amber-600') : 'text-green-600',
                )}>
                  {partitionSubtitle}
                </span>
              )}
            </div>

            {/* Topics — linked */}
            <Link to="/clusters/$clusterId/topics" params={{ clusterId }} className="no-underline">
              <div className="rounded-md border bg-card p-5 flex flex-col gap-1.5 h-full hover:border-border/80 hover:bg-muted/30 transition-colors cursor-pointer">
                <span className="text-2xl font-bold font-mono">{overview?.topicCount ?? '—'}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Topics</span>
              </div>
            </Link>

            {/* Consumer Groups — linked */}
            <Link to="/clusters/$clusterId/consumer-groups" params={{ clusterId }} className="no-underline">
              <div className="rounded-md border bg-card p-5 flex flex-col gap-1.5 h-full hover:border-border/80 hover:bg-muted/30 transition-colors cursor-pointer">
                <span className="text-2xl font-bold font-mono">{overview?.consumerGroupCount ?? '—'}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Groups</span>
              </div>
            </Link>

            {/* Partitions */}
            <div className="rounded-md border bg-card p-5 flex flex-col gap-1.5">
              <span className="text-2xl font-bold font-mono">{overview?.totalPartitions ?? '—'}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Partitions</span>
              {overview && (
                <span className={cn(
                  'text-xs',
                  hasPartitionIssues ? (overview.offlinePartitions > 0 ? 'text-destructive' : 'text-amber-600') : 'text-green-600',
                )}>
                  {partitionSubtitle}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Partition Health + Cluster Identity ────────────────────── */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: '3fr 2fr' }}>
        {/* Partition Health */}
        <div className="rounded-md border bg-card p-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Partition Health</div>
          {isLoading ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : overview ? (
            <div className="flex flex-col gap-3">
              {[
                { label: 'Total', value: overview.totalPartitions, colorClass: 'bg-blue-500', active: true },
                { label: 'Under-replicated', value: overview.underReplicated, colorClass: 'bg-amber-500', active: overview.underReplicated > 0 },
                { label: 'Offline', value: overview.offlinePartitions, colorClass: 'bg-destructive', active: overview.offlinePartitions > 0 },
              ].map(({ label, value, colorClass, active }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className={cn('size-2 rounded-full flex-shrink-0', active ? colorClass : 'bg-muted-foreground/30')} />
                  <span className="text-sm text-muted-foreground flex-1">{label}</span>
                  <span className={cn(
                    'text-sm font-semibold',
                    active && label !== 'Total'
                      ? label === 'Offline' ? 'text-destructive' : 'text-amber-600'
                      : 'text-foreground',
                  )}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Cluster Identity */}
        <div className="rounded-md border bg-card p-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Cluster Identity</div>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-2 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : overview ? (
            <div className="flex flex-col gap-3">
              {overview.clusterId && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Cluster ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono truncate flex-1 min-w-0">{overview.clusterId}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyClusterId}
                      className={cn('h-5 px-1.5 text-xs flex-shrink-0', copied && 'text-green-600')}
                    >
                      {copied ? '✓' : 'copy'}
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Kafka Version</span>
                <span className="text-sm">{overview.kafkaVersion}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Controller</span>
                <span className="text-sm">Broker {overview.controllerId}</span>
              </div>
              {!statusLoading && status?.identity && (
                <div className="flex flex-col gap-1 pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Auth Principal</span>
                  <span className="text-xs font-mono text-muted-foreground break-all">{status.identity}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Broker Fleet ───────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brokers</span>
          {overview?.brokerCount !== undefined && (
            <Badge variant="secondary" className="text-xs">{overview.brokerCount}</Badge>
          )}
        </div>
        {isLoading ? (
          <div className="rounded-md border overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn('flex gap-6 px-4 py-3 items-center', i < 2 && 'border-b')}>
                <Skeleton className="h-2.5 w-8" />
                <Skeleton className="h-2.5 w-36" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        ) : overview?.brokers && overview.brokers.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <div className="grid gap-3 px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground uppercase tracking-wider font-semibold" style={{ gridTemplateColumns: '56px 1fr 110px 80px' }}>
              {['Node', 'Address', 'Role', 'Rack'].map((col) => (
                <span key={col}>{col}</span>
              ))}
            </div>
            {overview.brokers.map((broker, idx) => (
              <Link
                key={broker.nodeId}
                to="/clusters/$clusterId/brokers"
                params={{ clusterId }}
                className="no-underline block"
              >
                <div
                  className={cn(
                    'grid gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors items-center',
                    idx < overview.brokers.length - 1 && 'border-b',
                  )}
                  style={{ gridTemplateColumns: '56px 1fr 110px 80px' }}
                >
                  <span className="text-sm font-mono text-muted-foreground">{broker.nodeId}</span>
                  <span className="text-sm font-mono">{broker.host}:{broker.port}</span>
                  <div>
                    {broker.isController ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
                        Controller
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Broker</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{broker.rack ?? '—'}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No broker data available
          </div>
        )}
      </div>

      {/* ── CloudWatch Metrics (AWS only) ──────────────────────────── */}
      {isAWS && (
        <div className="mb-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart2 className="h-4 w-4" />
                CloudWatch Metrics
              </CardTitle>
              <CardDescription>CPU, disk, throughput and lag from AWS CloudWatch</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" size="sm" asChild>
                <Link to="/clusters/$clusterId/metrics" params={{ clusterId }}>View Metrics</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── Cluster Configuration ──────────────────────────────────── */}
      {(isLoading || (overview && Object.keys(overview.configs).length > 0)) && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Configuration</div>
          {isLoading ? (
            <div className="rounded-md border overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={cn('grid gap-3 px-4 py-3 items-center', i < 4 && 'border-b')} style={{ gridTemplateColumns: '220px 120px 90px 1fr' }}>
                  <div className="flex flex-col gap-1"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-2 w-9/10" /></div>
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : overview ? (
            <ConfigTable overview={overview} />
          ) : null}
        </div>
      )}

    </div>
  )
}
