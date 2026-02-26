// Screen-8b: Consumer Group Offsets
// Per-partition committed offset vs log-end with lag highlight

import { useParams } from '@tanstack/react-router'
import { useConsumerGroup } from '../../../../../hooks/useConsumerGroups'
import { DataTable, type Column } from '../../../../../components/shared/DataTable'
import type { GroupOffset } from '../../../../../types/consumer'
import { formatNumber } from '../../../../../lib/utils'

const columns: Column<GroupOffset>[] = [
  { key: 'topic', header: 'Topic' },
  { key: 'partition', header: 'P#', render: (o) => String(o.partition) },
  { key: 'committed_offset', header: 'Committed', render: (o) => formatNumber(o.committed_offset) },
  { key: 'log_end_offset', header: 'Log End', render: (o) => formatNumber(o.log_end_offset) },
  {
    key: 'lag',
    header: 'Lag',
    render: (o) => (
      <span style={{ color: o.lag > 10_000 ? 'var(--k-red)' : o.lag > 1_000 ? 'var(--k-amber)' : undefined }}>
        {formatNumber(o.lag)}
        {o.lag > 10_000 && ' ⚠'}
      </span>
    ),
  },
]

export function GroupOffsetsPage() {
  const { clusterId, groupId } = useParams({ strict: false }) as {
    clusterId: string
    groupId: string
  }
  const { data: group, isLoading, error } = useConsumerGroup(clusterId, groupId)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!group) return null

  return (
    <div className="k-page">
      <DataTable
        columns={columns}
        data={group.offsets}
        rowKey={(o) => `${o.topic}-${o.partition}`}
        emptyMessage="No offset data"
      />
    </div>
  )
}
