export interface Broker {
  nodeId: number
  host: string
  port: number
  rack?: string
  isController: boolean
  leaderPartitions: number
  replicas: number
  logSizeBytes: number
}

export interface ClusterStatus {
  connected: boolean
  brokerCount?: number
  controllerId?: number
  error?: string
}

export interface BrokerSummary {
  nodeId: number
  host: string
  port: number
  rack?: string
  isController: boolean
}

export interface ClusterOverview {
  clusterId: string
  kafkaVersion: string
  controllerId: number
  brokerCount: number
  brokers: BrokerSummary[]
  totalPartitions: number
  underReplicated: number
  offlinePartitions: number
  topicCount: number
  consumerGroupCount: number
  configs: Record<string, string>
}
