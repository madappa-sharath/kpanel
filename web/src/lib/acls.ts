import type {
  AclBinding,
  AclOperation,
  AclPatternType,
  AclPermission,
  AclResourceType,
} from '../types/acl'

export const RESOURCE_TYPES: { value: AclResourceType; label: string }[] = [
  { value: 'topic', label: 'Topic' },
  { value: 'group', label: 'Group' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'transactional_id', label: 'Transactional ID' },
  { value: 'delegation_token', label: 'Delegation token' },
]

/** Operations Kafka checks for each resource type, in the order they are offered. */
export const RESOURCE_OPERATIONS: Record<AclResourceType, AclOperation[]> = {
  topic: ['read', 'write', 'describe', 'create', 'delete', 'alter', 'describe_configs', 'alter_configs', 'all'],
  group: ['read', 'describe', 'delete', 'all'],
  cluster: ['describe', 'alter', 'create', 'cluster_action', 'idempotent_write', 'describe_configs', 'alter_configs', 'all'],
  transactional_id: ['write', 'describe', 'all'],
  delegation_token: ['describe', 'all'],
}

export function resourceTypeLabel(type: string): string {
  return RESOURCE_TYPES.find((t) => t.value === type)?.label ?? type
}

export function operationLabel(op: string): string {
  return op.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}

/** Adds the "User:" principal type when the user typed a bare name. */
export function normalizePrincipal(principal: string): string {
  const p = principal.trim()
  if (!p) return ''
  return p.includes(':') ? p : `User:${p}`
}

interface PresetBase {
  principal: string
  host?: string
  pattern: AclPatternType
}

function binding(
  base: PresetBase,
  resource_type: AclResourceType,
  resource_name: string,
  operation: AclOperation,
  permission: AclPermission = 'allow',
): AclBinding {
  return {
    principal: normalizePrincipal(base.principal),
    host: base.host?.trim() || '*',
    resource_type,
    resource_name: resource_name.trim(),
    pattern_type: base.pattern,
    operation,
    permission,
  }
}

export interface ProducerPreset extends PresetBase {
  topic: string
  /** Set for transactional producers. */
  transactionalId?: string
}

/**
 * Bindings a producer needs for an existing topic. Write implies Describe, and
 * on Kafka 3.0+ it also covers idempotent produce, so nothing else is added.
 */
export function producerBindings(p: ProducerPreset): AclBinding[] {
  const out = [binding(p, 'topic', p.topic, 'write')]
  if (p.transactionalId?.trim()) {
    out.push(binding(p, 'transactional_id', p.transactionalId, 'write'))
  }
  return out
}

export interface ConsumerPreset extends PresetBase {
  topic: string
  group: string
}

/** Bindings a group consumer needs for an existing topic. Read implies Describe. */
export function consumerBindings(p: ConsumerPreset): AclBinding[] {
  return [
    binding(p, 'topic', p.topic, 'read'),
    binding(p, 'group', p.group, 'read'),
  ]
}

export function bindingKey(b: AclBinding): string {
  return [b.principal, b.permission, b.operation, b.resource_type, b.pattern_type, b.resource_name, b.host].join('|')
}

/** A resource reference in the `?resource=` search param, e.g. "topic:orders". */
export interface ResourceRef {
  type: string
  name: string
}

export function parseResourceRef(value: string | undefined): ResourceRef | null {
  if (!value) return null
  const i = value.indexOf(':')
  if (i <= 0 || i === value.length - 1) return null
  return { type: value.slice(0, i), name: value.slice(i + 1) }
}

export function formatResourceRef(ref: ResourceRef): string {
  return `${ref.type}:${ref.name}`
}

/**
 * Whether a binding applies to the named resource the way the broker
 * evaluates it: an exact literal name, the literal "*" wildcard, or a
 * prefixed pattern the name starts with.
 */
export function bindingAppliesTo(b: AclBinding, ref: ResourceRef): boolean {
  if (b.resource_type !== ref.type) return false
  if (b.pattern_type === 'prefixed') return ref.name.startsWith(b.resource_name)
  return b.resource_name === ref.name || b.resource_name === '*'
}

// ── MSK IAM ──────────────────────────────────────────────────────────────────

export interface IamStatement {
  actions: string[]
  resource: string
}

export interface IamPreset {
  label: string
  description: string
  statements: IamStatement[]
}

export interface MskClusterRef {
  clusterArn?: string
  region?: string
  clusterName?: string
}

/**
 * Builds IAM resource ARNs from an MSK cluster ARN
 * (arn:aws:kafka:<region>:<account>:cluster/<name>/<uuid>). Without the ARN,
 * the known region and cluster name are filled in and the rest stays a
 * placeholder.
 */
export function mskResourceArns(ref: MskClusterRef = {}) {
  const m = ref.clusterArn?.match(/^(arn:[^:]+:kafka:[^:]+:[^:]+):cluster\/([^/]+)\/(.+)$/)
  const prefix = m ? m[1] : `arn:aws:kafka:${ref.region || '<region>'}:<account>`
  const scope = m ? `${m[2]}/${m[3]}` : `${ref.clusterName || '<cluster-name>'}/<cluster-uuid>`
  return {
    cluster: m ? ref.clusterArn! : `${prefix}:cluster/${scope}`,
    topic: (name: string) => `${prefix}:topic/${scope}/${name}`,
    group: (name: string) => `${prefix}:group/${scope}/${name}`,
    transactionalId: (name: string) => `${prefix}:transactional-id/${scope}/${name}`,
  }
}

export const MSK_IAM_DOCS_URL = 'https://docs.aws.amazon.com/msk/latest/developerguide/iam-access-control-use-cases.html'

export function iamPresets(ref?: MskClusterRef): IamPreset[] {
  const arn = mskResourceArns(ref)
  const connect = { actions: ['kafka-cluster:Connect'], resource: arn.cluster }
  const writeTopic = { actions: ['kafka-cluster:DescribeTopic', 'kafka-cluster:WriteData'], resource: arn.topic('<topic>') }
  return [
    {
      label: 'Producer',
      description: 'Write to a topic. Clients with idempotence enabled, the default since Kafka 3.0, also need WriteDataIdempotently on the cluster.',
      statements: [
        { actions: ['kafka-cluster:Connect', 'kafka-cluster:WriteDataIdempotently'], resource: arn.cluster },
        writeTopic,
      ],
    },
    {
      label: 'Transactional producer',
      description: 'Write to a topic inside transactions.',
      statements: [
        connect,
        writeTopic,
        { actions: ['kafka-cluster:DescribeTransactionalId', 'kafka-cluster:AlterTransactionalId'], resource: arn.transactionalId('<transactional-id>') },
      ],
    },
    {
      label: 'Consumer',
      description: 'Read a topic as a member of a consumer group.',
      statements: [
        connect,
        { actions: ['kafka-cluster:DescribeTopic', 'kafka-cluster:ReadData'], resource: arn.topic('<topic>') },
        { actions: ['kafka-cluster:DescribeGroup', 'kafka-cluster:AlterGroup'], resource: arn.group('<group>') },
      ],
    },
  ]
}
