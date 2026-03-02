export interface ConsumerGroup {
  id: string
  state: 'Stable' | 'Empty' | 'PreparingRebalance' | 'CompletingRebalance' | 'Dead' | string
  members: number
  topics: string[]
  total_lag: number
  coordinator_id: number
  protocol_type: string
}

export interface PartitionAssignment {
  topic: string
  partitions: number[]
}

export interface GroupMember {
  id: string
  client_id: string
  host: string
  assignments: PartitionAssignment[]
  member_lag: number
}

export interface GroupOffset {
  topic: string
  partition: number
  committed_offset: number
  log_end_offset: number
  lag: number
  member_id?: string
}

export interface GroupDetail {
  id: string
  state: string
  protocol: string
  protocol_type: string
  coordinator_id: number
  members: GroupMember[]
  offsets: GroupOffset[]
}

export interface LagSnapshot {
  ts: number
  total_lag: number
  by_topic: Record<string, number>
}

export interface ResetOffsetsDiff {
  topic: string
  partition: number
  old_offset: number
  new_offset: number
  delta: number
}

export interface ResetOffsetsResult {
  active_members: number
  dry_run: boolean
  diff: ResetOffsetsDiff[]
}

export interface ResetOffsetsRequest {
  scope: 'all' | 'topic'
  topic?: string
  strategy: 'earliest' | 'latest' | 'timestamp' | 'offset'
  timestamp_ms?: number
  offset?: number
  dry_run: boolean
  force: boolean
}
