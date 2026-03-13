export interface Topic {
  name: string
  partitions: number
  replication_factor: number
  internal: boolean
  isr_health: 'healthy' | 'degraded'
  under_replicated_partitions: number
}

export interface TopicPartition {
  partition: number
  leader: number
  replicas: number[]
  isr: number[]
  log_start_offset: number
  high_watermark: number
}

export interface ConfigEntry {
  value: string
  source: 'default' | 'dynamic' | 'static' | 'unknown'
}

export interface TopicDetail {
  name: string
  partitions: TopicPartition[]
  config: Record<string, ConfigEntry>
}

export interface Message {
  partition: number
  offset: number
  timestamp: string
  key: string | null
  key_encoding?: 'base64'
  value: string
  value_encoding?: 'base64'
  headers: Record<string, string>
  size: number
}

export interface PeekRequest {
  limit: number
  partition?: number       // omit for all partitions
  start_offset?: number    // seek to specific offset
  start_timestamp?: string // ISO 8601 / RFC3339: seek to first offset at/after this time
}

export interface CreateTopicRequest {
  name: string
  partitions: number
  replication_factor: number
}

export interface UpdateTopicPartitionsRequest {
  partitions: number
}

export interface SearchRequest {
  query: string
  limit?: number
  scan_limit?: number
  partition?: number
  start_offset?: number
  start_timestamp?: string
}

export interface SearchResponse {
  messages: Message[]
  scanned: number
  matched: number
  truncated: boolean
  duration_ms: number
}
