export interface ConsumerGroup {
  id: string
  state: 'Stable' | 'Empty' | 'PreparingRebalance' | 'CompletingRebalance' | 'Dead' | string
  members: number
  topics: string[]
  total_lag: number
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
}

export interface GroupOffset {
  topic: string
  partition: number
  committed_offset: number
  log_end_offset: number
  lag: number
}

export interface GroupDetail {
  id: string
  state: string
  members: GroupMember[]
  offsets: GroupOffset[]
}

export type ResetOffsetStrategy =
  | 'earliest'
  | 'latest'
  | { timestamp: string }
  | { offset: number }
