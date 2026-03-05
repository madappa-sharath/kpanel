// Mirrors server/internal/config/config.go types

export type Platform = 'aws' | 'confluent' | 'generic'

export type AuthMechanism =
  | 'none'
  | 'sasl_plain'
  | 'sasl_scram_sha256'
  | 'sasl_scram_sha512'
  | 'aws_iam'

export interface ClusterAuth {
  mechanism: AuthMechanism
  credentialRef?: string // keyring key, omitted when no creds stored
}

export interface TLSConfig {
  enabled: boolean
  caCertPath?: string
}

export interface AWSPlatformConfig {
  profile: string
  region: string
  clusterArn?: string
}

export interface ConfluentPlatformConfig {
  environment: string
  clusterId: string
}

export interface Cluster {
  id: string
  name: string
  platform: Platform
  brokers: string[]
  auth: ClusterAuth
  tls: TLSConfig
  platformConfig?: { aws?: AWSPlatformConfig; confluent?: ConfluentPlatformConfig }
}

export interface SessionStatus {
  valid: boolean
  identity?: string // AWS ARN for aws clusters
  error?: string
}

// Request body for PUT /api/connections/:id (same shape, id omitted — locked server-side)
export type UpdateClusterRequest = Omit<AddClusterRequest, 'id'>

// Request body for POST /api/connections
export interface AddClusterRequest {
  id?: string
  name: string
  platform: Platform
  brokers: string[]
  auth: {
    mechanism: AuthMechanism
    username?: string
    password?: string
    awsProfile?: string
    awsRegion?: string
  }
  tls?: {
    enabled: boolean
    caCert?: string // PEM content — only sent when uploading a new cert; omit to keep existing
  }
}
