import { describe, expect, test } from 'bun:test'
import {
  bindingAppliesTo,
  consumerBindings,
  iamPresets,
  mskResourceArns,
  normalizePrincipal,
  parseResourceRef,
  producerBindings,
} from './acls'
import type { AclBinding } from '../types/acl'

const ops = (bs: AclBinding[]) => bs.map((b) => `${b.resource_type}:${b.resource_name}:${b.operation}`)

describe('presets', () => {
  test('producer expands to write on the topic', () => {
    const bs = producerBindings({ principal: 'alice', topic: 'orders', pattern: 'literal' })
    expect(ops(bs)).toEqual(['topic:orders:write'])
    for (const b of bs) {
      expect(b.principal).toBe('User:alice')
      expect(b.host).toBe('*')
      expect(b.permission).toBe('allow')
      expect(b.pattern_type).toBe('literal')
    }
  })

  test('transactional producer adds the transactional id', () => {
    const bs = producerBindings({ principal: 'User:alice', topic: 'orders', pattern: 'prefixed', transactionalId: 'tx-' })
    expect(ops(bs)).toEqual(['topic:orders:write', 'transactional_id:tx-:write'])
    expect(bs.every((b) => b.pattern_type === 'prefixed')).toBe(true)
  })

  test('consumer expands to topic read and group read', () => {
    const bs = consumerBindings({ principal: 'bob', topic: 'payments', group: 'audit', pattern: 'literal', host: '10.0.0.1' })
    expect(ops(bs)).toEqual(['topic:payments:read', 'group:audit:read'])
    expect(bs.every((b) => b.host === '10.0.0.1')).toBe(true)
  })
})

describe('normalizePrincipal', () => {
  test('adds User: only when no type is given', () => {
    expect(normalizePrincipal(' alice ')).toBe('User:alice')
    expect(normalizePrincipal('Group:ops')).toBe('Group:ops')
    expect(normalizePrincipal('')).toBe('')
  })
})

describe('resource filter', () => {
  const b = (resource_name: string, pattern_type: string, resource_type = 'topic'): AclBinding => ({
    principal: 'User:a', host: '*', operation: 'read', permission: 'allow',
    resource_type, resource_name, pattern_type,
  })
  const orders = parseResourceRef('topic:orders')!

  test('parses refs and rejects malformed ones', () => {
    expect(orders).toEqual({ type: 'topic', name: 'orders' })
    expect(parseResourceRef('topic:a:b')).toEqual({ type: 'topic', name: 'a:b' })
    expect(parseResourceRef('orders')).toBeNull()
    expect(parseResourceRef('topic:')).toBeNull()
    expect(parseResourceRef(undefined)).toBeNull()
  })

  test('matches literal, wildcard and prefixed bindings', () => {
    expect(bindingAppliesTo(b('orders', 'literal'), orders)).toBe(true)
    expect(bindingAppliesTo(b('*', 'literal'), orders)).toBe(true)
    expect(bindingAppliesTo(b('ord', 'prefixed'), orders)).toBe(true)
    expect(bindingAppliesTo(b('orders-v2', 'literal'), orders)).toBe(false)
    expect(bindingAppliesTo(b('pay', 'prefixed'), orders)).toBe(false)
    expect(bindingAppliesTo(b('orders', 'literal', 'group'), orders)).toBe(false)
  })
})

describe('iamPresets', () => {
  test('each preset is a complete policy on its own', () => {
    for (const preset of iamPresets()) {
      const actions = preset.statements.flatMap((s) => s.actions)
      expect(actions).toContain('kafka-cluster:Connect')
    }
    const tx = iamPresets().find((p) => p.label === 'Transactional producer')!
    const txActions = tx.statements.flatMap((s) => s.actions)
    expect(txActions).toContain('kafka-cluster:WriteData')
    expect(txActions).not.toContain('kafka-cluster:WriteDataIdempotently')
  })
})

describe('mskResourceArns', () => {
  test('derives resource ARNs from the cluster ARN', () => {
    const arn = mskResourceArns('arn:aws:kafka:us-east-1:123456789012:cluster/prod/abcd-1234-5')
    expect(arn.cluster).toBe('arn:aws:kafka:us-east-1:123456789012:cluster/prod/abcd-1234-5')
    expect(arn.topic('orders')).toBe('arn:aws:kafka:us-east-1:123456789012:topic/prod/abcd-1234-5/orders')
    expect(arn.group('g')).toBe('arn:aws:kafka:us-east-1:123456789012:group/prod/abcd-1234-5/g')
    expect(arn.transactionalId('t')).toBe('arn:aws:kafka:us-east-1:123456789012:transactional-id/prod/abcd-1234-5/t')
  })

  test('falls back to placeholders without an ARN', () => {
    const arn = mskResourceArns(undefined)
    expect(arn.topic('x')).toBe('arn:aws:kafka:<region>:<account>:topic/<cluster-name>/<cluster-uuid>/x')
  })
})
