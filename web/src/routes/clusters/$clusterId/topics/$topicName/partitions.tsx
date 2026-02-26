// Screen-4b: Topic Partitions
// Per-partition table: leader, replicas, ISR, offsets

import { useParams } from '@tanstack/react-router'
import { useTopic } from '../../../../../hooks/useTopics'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { TopicPartition } from '../../../../../types/topic'
import { StatusBadge } from '../../../../../components/shared/StatusBadge'

export function TopicPartitionsPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)

  const columns: Column<TopicPartition>[] = [
    { key: 'partition', header: 'P#', render: (p) => String(p.partition) },
    { key: 'leader', header: 'Leader', render: (p) => String(p.leader) },
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
    { key: 'log_start_offset', header: 'Start Offset', render: (p) => String(p.log_start_offset) },
    { key: 'high_watermark', header: 'High Watermark', render: (p) => String(p.high_watermark) },
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
