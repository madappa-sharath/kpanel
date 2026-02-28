// Screen-4b: Topic Partitions
// Per-partition table: leader, replicas, ISR, offsets, message count, status

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { TopicPartition } from '../../../../../types/topic'
import { StatusBadge } from '../../../../../components/shared/StatusBadge'
import { formatNumber } from '../../../../../lib/utils'

export function TopicPartitionsPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  const columns: Column<TopicPartition>[] = [
    { key: 'partition', header: 'P#', render: (p) => String(p.partition) },
    {
      key: 'leader',
      header: 'Leader',
      render: (p) =>
        p.leader < 0 ? (
          <StatusBadge variant="error" label="Offline" />
        ) : (
          String(p.leader)
        ),
    },
    { key: 'replicas', header: 'Replicas', render: (p) => p.replicas.join(', ') },
    {
      key: 'isr',
      header: 'ISR',
      render: (p) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {p.isr.join(', ')}
          {p.isr.length < p.replicas.length && (
            <StatusBadge variant="warn" label="Under-replicated" />
          )}
        </span>
      ),
    },
    {
      key: 'log_start_offset',
      header: 'Start Offset',
      render: (p) => (p.log_start_offset >= 0 ? formatNumber(p.log_start_offset) : '—'),
    },
    {
      key: 'high_watermark',
      header: 'High Watermark',
      render: (p) => (p.high_watermark >= 0 ? formatNumber(p.high_watermark) : '—'),
    },
    {
      key: 'messages' as keyof TopicPartition,
      header: 'Messages',
      render: (p) => {
        if (p.log_start_offset < 0 || p.high_watermark < 0) return '—'
        return formatNumber(p.high_watermark - p.log_start_offset)
      },
    },
    {
      key: 'status' as keyof TopicPartition,
      header: 'Status',
      render: (p) => {
        if (p.leader < 0) return <StatusBadge variant="error" label="Offline" />
        if (p.isr.length < p.replicas.length) return <StatusBadge variant="warn" label="Under-replicated" />
        return <StatusBadge variant="ok" label="In Sync" />
      },
    },
  ]

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  return (
    <div className="k-page">
      <DataTable
        columns={columns}
        data={topic.partitions}
        rowKey={(p) => String(p.partition)}
      />
    </div>
  )
}
