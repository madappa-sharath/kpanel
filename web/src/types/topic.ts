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
  value: string
  headers: Record<string, string>
  size: number
}

export interface PeekRequest {
  limit: number
  partition?: number // omit for all partitions
}
