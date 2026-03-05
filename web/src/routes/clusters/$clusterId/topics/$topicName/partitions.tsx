// Screen-4b: Topic Partitions

import { useParams, useNavigate } from '@tanstack/react-router'
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
  const navigate = useNavigate()
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
  if (!topic) return null

  const totalMessages = topic.partitions.reduce(
    (sum, p) => sum + Math.max(0, p.high_watermark - p.log_start_offset),
    0,
  )
  const avgMessages = topic.partitions.length > 0 ? totalMessages / topic.partitions.length : 0

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
        <span className="flex items-center gap-1.5">
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
      key: 'skew' as keyof TopicPartition,
      header: 'Skew',
      render: (p) => {
        if (p.log_start_offset < 0 || p.high_watermark < 0 || avgMessages === 0) return '—'
        const count = p.high_watermark - p.log_start_offset
        if (count > avgMessages * 2) return <StatusBadge variant="warn" label="Hot" />
        if (count < avgMessages * 0.5) return <StatusBadge variant="warn" label="Cold" />
        return '—'
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

  function handleRowClick(p: TopicPartition) {
    navigate({
      to: '/clusters/$clusterId/topics/$topicName/messages',
      params: { clusterId, topicName },
      search: { partition: p.partition },
    })
  }

  return (
    <div className="p-6">
      <DataTable
        columns={columns}
        data={topic.partitions}
        rowKey={(p) => String(p.partition)}
        onRowClick={handleRowClick}
      />
    </div>
  )
}
