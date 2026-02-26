export interface Topic {
  name: string
  partitions: number
  replication_factor: number
  internal: boolean
}

export interface TopicPartition {
  partition: number
  leader: number
  replicas: number[]
  isr: number[]
  log_start_offset: number
  high_watermark: number
}

export interface TopicDetail {
  name: string
  partitions: TopicPartition[]
  config: Record<string, string>
}

export interface Message {
  partition: number
  offset: number
  timestamp: string
  key: string | null
  value: string
  headers: Record<string, string>
  size: number
}

export interface PeekRequest {
  limit: number
  partition?: number // omit for all partitions
  offset?: 'earliest' | 'latest' | number
}
