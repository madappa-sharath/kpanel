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
  produce_rate: number | null
  consume_rate: number | null
  commits: number | null
  topic_rates?: Record<string, TopicRate>
}

export interface TopicRate {
  produce_rate: number
  consume_rate: number
  commits: number
}

export interface LagHistory {
  interval_ms: number
  retention_ms: number
  watch_ttl_ms: number
  sampling_since: number
  last_error?: string
  snapshots: LagSnapshot[]
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
