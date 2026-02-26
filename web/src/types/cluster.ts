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
  credential_ref?: string // keyring key, omitted when no creds stored
}

export interface TLSConfig {
  enabled: boolean
  ca_file?: string
}

export interface AWSPlatformConfig {
  profile: string
  region: string
  cluster_arn?: string
}

export interface ConfluentPlatformConfig {
  environment_id: string
  cluster_id: string
}

export interface Cluster {
  id: string
  name: string
  platform: Platform
  brokers: string[]
  auth: ClusterAuth
  tls: TLSConfig
  platform_config?: AWSPlatformConfig | ConfluentPlatformConfig
}

export interface SessionStatus {
  valid: boolean
  identity?: string // AWS ARN for aws clusters
  error?: string
}

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
    aws_profile?: string
    aws_region?: string
  }
  tls?: {
    enabled: boolean
    ca_file?: string
  }
}
