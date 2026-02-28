import { useParams, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useClusters, useConnectionStatus, useClusterOverview } from '../../../hooks/useCluster'
import { PageHeader } from '../../../components/shared/PageHeader'
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
  // Reliability
  {
    label: 'Replication Factor',
    kafkaKey: 'default.replication.factor',
    category: 'Reliability',
    check: (v, n) => {
      if (parseInt(v, 10) >= 3) return 'good'
      return n === 1 ? 'info' : 'warning'
    },
    recommendation: (_v, n) =>
      n === 1
        ? 'Single-broker — not suitable for production'
        : 'Set ≥ 3 for production durability',
    why: 'RF < 3 means one broker failure can make you unrecoverable if another fails.',
  },
  {
    label: 'Min In-Sync Replicas',
    kafkaKey: 'min.insync.replicas',
    category: 'Reliability',
    check: (v, n) => {
      if (parseInt(v, 10) >= 2) return 'good'
      return n === 1 ? 'info' : 'warning'
    },
    recommendation: (_v, n) =>
      n === 1
        ? 'Single-broker — only one replica possible'
        : 'Set ≥ 2 to prevent silent data loss',
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
    check: (v, n) => {
      if (parseInt(v, 10) >= 3) return 'good'
      return n === 1 ? 'info' : 'warning'
    },
    recommendation: (_v, n) =>
      n === 1
        ? 'Single-broker — consumer offset durability limited'
        : 'Set ≥ 3 to protect consumer group state',
    why: '__consumer_offsets stores group positions; low RF risks losing commit history.',
  },
  {
    label: 'Transaction Log Replication',
    kafkaKey: 'transaction.state.log.replication.factor',
    category: 'Reliability',
    check: (v, n) => {
      if (parseInt(v, 10) >= 3) return 'good'
      return n === 1 ? 'info' : 'warning'
    },
    recommendation: (_v, n) =>
      n === 1
        ? 'Single-broker — transaction state durability limited'
        : 'Set ≥ 3 to protect transaction state',
    why: '__transaction_state needs sufficient replication to avoid coordinator outages.',
  },
  {
    label: 'Transaction Log Min ISR',
    kafkaKey: 'transaction.state.log.min.isr',
    category: 'Reliability',
    check: () => null,
    recommendation: () => '',
    why: '',
  },
  // Retention
  {
    label: 'Log Retention Hours',
    kafkaKey: 'log.retention.hours',
    category: 'Retention',
    check: () => null,
    recommendation: () => '',
    why: '',
  },
  {
    label: 'Log Retention Bytes',
    kafkaKey: 'log.retention.bytes',
    category: 'Retention',
    check: (v) => (v === '-1' ? 'info' : null),
    recommendation: () => 'Consider a byte cap to prevent disk exhaustion',
    why: 'Unlimited retention means disk fills until time-based retention kicks in.',
  },
  {
    label: 'Log Retention Ms',
    kafkaKey: 'log.retention.ms',
    category: 'Retention',
    check: () => null,
    recommendation: () => '',
    why: '',
  },
  // Governance
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
  // Performance
  {
    label: 'Default Partitions',
    kafkaKey: 'num.partitions',
    category: 'Performance',
    check: (v) => (parseInt(v, 10) === 1 ? 'info' : null),
    recommendation: () => 'Consider increasing for better consumer parallelism',
    why: '1 default partition limits throughput and parallelism for auto-created topics.',
  },
  {
    label: 'Max Message Bytes',
    kafkaKey: 'message.max.bytes',
    category: 'Performance',
    check: () => null,
    recommendation: () => '',
    why: '',
  },
]

const CATEGORY_ORDER = ['Reliability', 'Retention', 'Governance', 'Performance'] as const

function Skel({ w = '100%', h = 14 }: { w?: string | number; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background: 'var(--k-border)',
        flexShrink: 0,
      }}
    />
  )
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--k-muted)',
          fontFamily: 'var(--k-font)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            padding: '1px 7px',
            borderRadius: 10,
            border: '1px solid var(--k-border-2)',
            background: 'var(--k-border)',
            color: 'var(--k-muted)',
            fontFamily: 'var(--k-font)',
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

function ConfigStatusBadge({ status, title }: { status: RuleStatus; title?: string }) {
  if (status === null) return null
  const cls =
    status === 'warning'
      ? 'k-badge k-badge-amber'
      : status === 'good'
        ? 'k-badge k-badge-green'
        : 'k-badge k-badge-muted'
  const label = status === 'warning' ? 'Warning' : status === 'good' ? 'OK' : 'Info'
  return (
    <span className={cls} title={title}>
      {label}
    </span>
  )
}

function ConfigSkeleton() {
  return (
    <div
      style={{
        border: '1px solid var(--k-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--k-surface)',
      }}
    >
      {/* header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 120px 90px 1fr',
          padding: '8px 16px',
          borderBottom: '1px solid var(--k-border)',
          background: 'var(--k-border)',
          gap: 12,
        }}
      >
        {['Config Name', 'Value', 'Status', 'Note'].map((col) => (
          <span
            key={col}
            style={{
              fontSize: 10,
              fontFamily: 'var(--k-font)',
              color: 'var(--k-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            {col}
          </span>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 120px 90px 1fr',
            padding: '12px 16px',
            borderBottom: i < 4 ? '1px solid var(--k-border)' : 'none',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Skel h={11} w="80%" />
            <Skel h={9} w="90%" />
          </div>
          <Skel h={11} w="60%" />
          <Skel h={18} w={50} />
          <Skel h={11} w="70%" />
        </div>
      ))}
    </div>
  )
}

function ConfigTable({ overview }: { overview: ClusterOverview }) {
  const brokerCount = overview.brokerCount

  return (
    <div
      style={{
        border: '1px solid var(--k-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--k-surface)',
      }}
    >
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 120px 90px 1fr',
          padding: '8px 16px',
          borderBottom: '1px solid var(--k-border)',
          background: 'var(--k-border)',
          gap: 12,
        }}
      >
        {['Config Name', 'Value', 'Status', 'Note'].map((col) => (
          <span
            key={col}
            style={{
              fontSize: 10,
              fontFamily: 'var(--k-font)',
              color: 'var(--k-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {CATEGORY_ORDER.map((category) => {
        const rules = BEST_PRACTICE_RULES.filter((r) => r.category === category)
        const visibleRules = rules.filter((r) => overview.configs[r.kafkaKey] !== undefined)
        if (visibleRules.length === 0) return null

        // Sort: warnings first, then info, then good, then null
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
            {/* Category sub-header */}
            <div
              style={{
                padding: '5px 16px',
                background: 'var(--k-border-2)',
                borderBottom: '1px solid var(--k-border-2)',
                borderTop: '1px solid var(--k-border-2)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--k-font)',
                  color: 'var(--k-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                }}
              >
                {category}
              </span>
            </div>

            {sorted.map((rule, idx) => {
              const entry = overview.configs[rule.kafkaKey]
              if (!entry) return null
              const status = rule.check(entry.value, brokerCount)

              return (
                <div
                  key={rule.kafkaKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '220px 120px 90px 1fr',
                    padding: '11px 16px',
                    borderBottom:
                      idx < sorted.length - 1 ? '1px solid var(--k-border)' : 'none',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  {/* Col 1: label + key */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontFamily: 'var(--k-font)',
                        color: 'var(--k-text)',
                      }}
                    >
                      {rule.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: 'var(--k-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rule.kafkaKey}
                    </span>
                  </div>

                  {/* Col 2: value + default chip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontFamily: 'monospace',
                        color: 'var(--k-text)',
                      }}
                    >
                      {entry.value}
                    </span>
                    {entry.source === 'default' && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 4,
                          border: '1px solid var(--k-border)',
                          background: 'var(--k-faint, var(--k-border))',
                          color: 'var(--k-muted)',
                          fontFamily: 'var(--k-font)',
                        }}
                      >
                        default
                      </span>
                    )}
                  </div>

                  {/* Col 3: status badge */}
                  <div>
                    <ConfigStatusBadge status={status} title={rule.why || undefined} />
                  </div>

                  {/* Col 4: recommendation — only shown when actionable */}
                  {(status === 'warning' || status === 'info') && (
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: 'var(--k-font)',
                        color: status === 'warning' ? 'var(--k-amber)' : 'var(--k-muted)',
                      }}
                    >
                      {rule.recommendation(entry.value, brokerCount)}
                    </span>
                  )}
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
  const { data: status } = useConnectionStatus(clusterId)
  const { data: overview, isLoading } = useClusterOverview(clusterId)
  const [copied, setCopied] = useState(false)

  const cluster = clusters?.find((c) => c.id === clusterId)

  const platformLabel =
    cluster?.platform === 'aws'
      ? 'AWS MSK'
      : cluster?.platform === 'confluent'
        ? 'Confluent Cloud'
        : (cluster?.platform ?? 'Kafka')

  function copyClusterId() {
    if (overview?.clusterId) {
      navigator.clipboard.writeText(overview.clusterId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  // Partition health subtitle for the stat card
  let partitionSubtitle = '● healthy'
  let partitionSubtitleColor = 'var(--k-green)'
  if (overview) {
    if (overview.offlinePartitions > 0) {
      partitionSubtitle = `${overview.offlinePartitions} offline`
      partitionSubtitleColor = 'var(--k-red)'
    } else if (overview.underReplicated > 0) {
      partitionSubtitle = `${overview.underReplicated} under-replicated`
      partitionSubtitleColor = 'var(--k-amber)'
    }
  }

  const statCardBase: React.CSSProperties = {
    border: '1px solid var(--k-border)',
    borderRadius: 8,
    padding: '20px 24px',
    background: 'var(--k-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    height: '100%',
    boxSizing: 'border-box',
  }

  const statNum: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: 'var(--k-font)',
    color: 'var(--k-text)',
    lineHeight: 1,
  }

  const statLabel: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'var(--k-font)',
    color: 'var(--k-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    fontWeight: 500,
  }

  const identityRow: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  }

  const identityKey: React.CSSProperties = {
    fontSize: 10,
    fontFamily: 'var(--k-font)',
    color: 'var(--k-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }

  const identityVal: React.CSSProperties = {
    fontSize: 13,
    fontFamily: 'var(--k-font)',
    color: 'var(--k-text)',
  }

  return (
    <div className="k-page">
      <PageHeader title={cluster?.name ?? clusterId} description={platformLabel} />

      {/* Disconnected banner */}
      {status && !status.connected && (
        <div
          style={{
            border: '1px solid rgba(217,82,82,0.25)',
            borderRadius: 6,
            padding: '10px 16px',
            background: 'var(--k-red-dim)',
            color: 'var(--k-red)',
            fontSize: 13,
            fontFamily: 'var(--k-font)',
            marginBottom: 24,
          }}
        >
          Unable to connect to cluster{status.error ? `: ${status.error}` : ''}
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {isLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ ...statCardBase, gap: 10 }}>
                <Skel h={28} w="45%" />
                <Skel h={10} w="55%" />
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Brokers */}
            <div style={statCardBase}>
              <span style={statNum}>{overview?.brokerCount ?? '—'}</span>
              <span style={statLabel}>Brokers</span>
              {overview && (
                <span style={{ fontSize: 11, fontFamily: 'var(--k-font)', color: partitionSubtitleColor }}>
                  {partitionSubtitle}
                </span>
              )}
            </div>

            {/* Topics — linked */}
            <Link
              to="/clusters/$clusterId/topics"
              params={{ clusterId }}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={statCardBase}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--k-border-2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--k-border)'
                }}
              >
                <span style={statNum}>{overview?.topicCount ?? '—'}</span>
                <span style={statLabel}>Topics</span>
              </div>
            </Link>

            {/* Consumer Groups — linked */}
            <Link
              to="/clusters/$clusterId/consumer-groups"
              params={{ clusterId }}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={statCardBase}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--k-border-2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--k-border)'
                }}
              >
                <span style={statNum}>{overview?.consumerGroupCount ?? '—'}</span>
                <span style={statLabel}>Groups</span>
              </div>
            </Link>

            {/* Partitions */}
            <div style={statCardBase}>
              <span style={statNum}>{overview?.totalPartitions ?? '—'}</span>
              <span style={statLabel}>Partitions</span>
              {overview && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--k-font)',
                    color: partitionSubtitleColor,
                  }}
                >
                  {partitionSubtitle}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Partition Health + Cluster Identity ────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Partition Health */}
        <div
          style={{
            border: '1px solid var(--k-border)',
            borderRadius: 8,
            padding: '20px 24px',
            background: 'var(--k-surface)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--k-muted)',
              fontFamily: 'var(--k-font)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 16,
            }}
          >
            Partition Health
          </div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skel h={12} w="70%" />
              <Skel h={12} w="80%" />
              <Skel h={12} w="65%" />
            </div>
          ) : overview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Total', value: overview.totalPartitions, color: 'var(--k-blue)', active: true },
                {
                  label: 'Under-replicated',
                  value: overview.underReplicated,
                  color: 'var(--k-amber)',
                  active: overview.underReplicated > 0,
                },
                {
                  label: 'Offline',
                  value: overview.offlinePartitions,
                  color: 'var(--k-red)',
                  active: overview.offlinePartitions > 0,
                },
              ].map(({ label, value, color, active }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: active ? color : 'var(--k-border-2)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--k-font)',
                      color: 'var(--k-muted)',
                      flex: 1,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--k-font)',
                      color: active && label !== 'Total' ? color : 'var(--k-text)',
                      fontWeight: 600,
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Cluster Identity */}
        <div
          style={{
            border: '1px solid var(--k-border)',
            borderRadius: 8,
            padding: '20px 24px',
            background: 'var(--k-surface)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--k-muted)',
              fontFamily: 'var(--k-font)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 16,
            }}
          >
            Cluster Identity
          </div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Skel h={9} w="40%" />
                <Skel h={12} w="85%" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Skel h={9} w="45%" />
                <Skel h={12} w="60%" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Skel h={9} w="40%" />
                <Skel h={12} w="50%" />
              </div>
            </div>
          ) : overview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {overview.clusterId && (
                <div style={identityRow}>
                  <span style={identityKey}>Cluster ID</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: 'var(--k-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {overview.clusterId}
                    </span>
                    <button
                      onClick={copyClusterId}
                      style={{
                        border: '1px solid var(--k-border-2)',
                        borderRadius: 4,
                        background: 'transparent',
                        color: copied ? 'var(--k-green)' : 'var(--k-muted)',
                        fontSize: 10,
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontFamily: 'var(--k-font)',
                        flexShrink: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {copied ? '✓' : 'copy'}
                    </button>
                  </div>
                </div>
              )}
              <div style={identityRow}>
                <span style={identityKey}>Kafka Version</span>
                <span style={identityVal}>{overview.kafkaVersion}</span>
              </div>
              <div style={identityRow}>
                <span style={identityKey}>Controller</span>
                <span style={identityVal}>Broker {overview.controllerId}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Broker Fleet ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader title="Brokers" count={overview?.brokerCount} />
        {isLoading ? (
          <div
            style={{
              border: '1px solid var(--k-border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--k-surface)',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < 2 ? '1px solid var(--k-border)' : 'none',
                  display: 'flex',
                  gap: 24,
                  alignItems: 'center',
                }}
              >
                <Skel w={32} h={11} />
                <Skel w={150} h={11} />
                <Skel w={70} h={11} />
              </div>
            ))}
          </div>
        ) : overview?.brokers && overview.brokers.length > 0 ? (
          <div
            style={{
              border: '1px solid var(--k-border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--k-surface)',
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1fr 110px 80px',
                padding: '8px 16px',
                borderBottom: '1px solid var(--k-border)',
                background: 'var(--k-border)',
              }}
            >
              {['Node', 'Address', 'Role', 'Rack'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--k-font)',
                    color: 'var(--k-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {overview.brokers.map((broker, idx) => (
              <Link
                key={broker.nodeId}
                to="/clusters/$clusterId/brokers"
                params={{ clusterId }}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 110px 80px',
                    padding: '11px 16px',
                    borderBottom:
                      idx < overview.brokers.length - 1 ? '1px solid var(--k-border)' : 'none',
                    cursor: 'pointer',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--k-border)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--k-font)',
                      color: 'var(--k-muted)',
                    }}
                  >
                    {broker.nodeId}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--k-font)',
                      color: 'var(--k-text)',
                    }}
                  >
                    {broker.host}:{broker.port}
                  </span>
                  <div>
                    {broker.isController ? (
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 10,
                          border: '1px solid rgba(217,159,34,0.35)',
                          background: 'rgba(217,159,34,0.12)',
                          color: 'var(--k-amber)',
                          fontFamily: 'var(--k-font)',
                        }}
                      >
                        Controller
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: 'var(--k-font)',
                          color: 'var(--k-muted)',
                        }}
                      >
                        Broker
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--k-font)',
                      color: 'var(--k-muted)',
                    }}
                  >
                    {broker.rack ?? '—'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div
            style={{
              border: '1px dashed var(--k-border-2)',
              borderRadius: 6,
              padding: 24,
              textAlign: 'center',
              color: 'var(--k-muted)',
              fontSize: 13,
              fontFamily: 'var(--k-font)',
            }}
          >
            No broker data available
          </div>
        )}
      </div>

      {/* ── Cluster Configuration ──────────────────────────────────── */}
      {(isLoading || (overview && Object.keys(overview.configs).length > 0)) && (
        <div style={{ marginBottom: 20 }}>
          <SectionHeader title="Configuration" />
          {isLoading ? <ConfigSkeleton /> : overview && <ConfigTable overview={overview} />}
        </div>
      )}
    </div>
  )
}
