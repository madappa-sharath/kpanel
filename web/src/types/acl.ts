export type AclResourceType = 'topic' | 'group' | 'cluster' | 'transactional_id' | 'delegation_token'
export type AclPatternType = 'literal' | 'prefixed'
export type AclPermission = 'allow' | 'deny'
export type AclOperation =
  | 'all'
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'alter'
  | 'describe'
  | 'cluster_action'
  | 'describe_configs'
  | 'alter_configs'
  | 'idempotent_write'

export interface AclBinding {
  principal: string
  host: string
  /** Listed bindings may carry types kpanel does not create, e.g. "user". */
  resource_type: AclResourceType | (string & {})
  resource_name: string
  pattern_type: AclPatternType | (string & {})
  operation: AclOperation | (string & {})
  permission: AclPermission | (string & {})
}

export interface AclResult extends AclBinding {
  deleted?: number
  error?: string
}

export interface AclResultsResponse {
  results: AclResult[]
}

/** Error codes the ACL endpoints return alongside `error`. */
export type AclErrorCode = 'security_disabled' | 'unauthorized' | 'iam_managed'
