import { useParams, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useClusters, useConnectionStatus, useClusterOverview } from '../../../hooks/useCluster'
import { PageHeader } from '../../../components/shared/PageHeader'

const CONFIG_LABELS: Record<string, string> = {
  'log.retention.hours': 'Log Retention',
  'log.retention.bytes': 'Retention Bytes',
  'default.replication.factor': 'Replication Factor',
  'min.insync.replicas': 'Min ISR',
  'auto.create.topics.enable': 'Auto-create Topics',
}

const CONFIG_ORDER = [
  'log.retention.hours',
  'log.retention.bytes',
  'default.replication.factor',
  'min.insync.replicas',
  'auto.create.topics.enable',
]

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
      {(isLoading || (overview && CONFIG_ORDER.some((k) => overview.configs[k] !== undefined))) && (
        <div>
          <SectionHeader title="Configuration" />
          {isLoading ? (
            <div
              style={{
                border: '1px solid var(--k-border)',
                borderRadius: 8,
                padding: '20px 24px',
                background: 'var(--k-surface)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '16px 24px',
              }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skel h={9} w="55%" />
                  <Skel h={13} w="65%" />
                </div>
              ))}
            </div>
          ) : (
            overview && (
              <div
                style={{
                  border: '1px solid var(--k-border)',
                  borderRadius: 8,
                  padding: '20px 24px',
                  background: 'var(--k-surface)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '16px 24px',
                }}
              >
                {CONFIG_ORDER.filter((key) => overview.configs[key] !== undefined).map((key) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--k-font)',
                        color: 'var(--k-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {CONFIG_LABELS[key]}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontFamily: 'var(--k-font)',
                        color: 'var(--k-text)',
                        fontWeight: 500,
                      }}
                    >
                      {overview.configs[key]}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
