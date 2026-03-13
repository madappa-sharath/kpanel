import type { Cluster, SessionStatus, AWSContext, MSKCluster, AddClusterRequest, UpdateClusterRequest } from '../types/cluster'
import type { MetricsResponse } from '../types/metrics'
import type {
  Topic,
  TopicDetail,
  Message,
  PeekRequest,
  CreateTopicRequest,
  UpdateTopicPartitionsRequest,
  SearchRequest,
  SearchResponse,
} from '../types/topic'
import type { ConsumerGroup, GroupDetail, LagSnapshot, ResetOffsetsRequest, ResetOffsetsResult } from '../types/consumer'
import type { Broker, ClusterStatus, ClusterOverview } from '../types/broker'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  health: {
    get: () => request<{ status: string }>('/health'),
  },

  connections: {
    list: () => request<Cluster[]>('/connections'),
    add: (body: AddClusterRequest) =>
      request<Cluster>('/connections', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UpdateClusterRequest) =>
      request<Cluster>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<void>(`/connections/${id}`, { method: 'DELETE' }),
    session: (id: string) =>
      request<SessionStatus>(`/connections/${id}/session`),
    status: (id: string) =>
      request<ClusterStatus>(`/connections/${id}/status`),
    overview: (id: string) =>
      request<ClusterOverview>(`/connections/${id}/overview`),
  },

  topics: {
    list: (clusterId: string) =>
      request<Topic[]>(`/connections/${clusterId}/topics`),
    create: (clusterId: string, body: CreateTopicRequest) =>
      request<{ ok: boolean }>(`/connections/${clusterId}/topics`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (clusterId: string, name: string) =>
      request<TopicDetail>(`/connections/${clusterId}/topics/${encodeURIComponent(name)}`),
    delete: (clusterId: string, name: string) =>
      request<{ ok: boolean }>(`/connections/${clusterId}/topics/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    peek: (clusterId: string, name: string, opts: PeekRequest) =>
      request<Message[]>(`/connections/${clusterId}/topics/${encodeURIComponent(name)}/peek`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
    updateConfig: (clusterId: string, name: string, configs: Record<string, string>) =>
      request<{ ok: boolean }>(`/connections/${clusterId}/topics/${encodeURIComponent(name)}/config`, {
        method: 'PUT',
        body: JSON.stringify({ configs }),
      }),
    updatePartitions: (clusterId: string, name: string, body: UpdateTopicPartitionsRequest) =>
      request<{ ok: boolean }>(`/connections/${clusterId}/topics/${encodeURIComponent(name)}/partitions`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    search: (clusterId: string, name: string, opts: SearchRequest) =>
      request<SearchResponse>(
        `/connections/${clusterId}/topics/${encodeURIComponent(name)}/search`,
        { method: 'POST', body: JSON.stringify(opts) },
      ),
  },

  groups: {
    list: (clusterId: string) =>
      request<ConsumerGroup[]>(`/connections/${clusterId}/groups`),
    get: (clusterId: string, groupId: string) =>
      request<GroupDetail>(`/connections/${clusterId}/groups/${encodeURIComponent(groupId)}`),
    lagHistory: (clusterId: string, groupId: string) =>
      request<LagSnapshot[]>(`/connections/${clusterId}/groups/${encodeURIComponent(groupId)}/lag-history`),
    resetOffsets: (clusterId: string, groupId: string, body: ResetOffsetsRequest) =>
      request<ResetOffsetsResult>(`/connections/${clusterId}/groups/${encodeURIComponent(groupId)}/reset-offsets`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  brokers: {
    list: (clusterId: string) =>
      request<Broker[]>(`/connections/${clusterId}/brokers`),
  },

  aws: {
    context: () => request<AWSContext>('/aws/context'),
  },

  msk: {
    discover: (region?: string) =>
      request<MSKCluster[]>(`/msk/clusters${region ? `?region=${encodeURIComponent(region)}` : ''}`),
    import: (arn: string, access: 'private' | 'public' = 'private') =>
      request<Cluster>(`/msk/clusters/${encodeURIComponent(arn)}/import?access=${access}`, { method: 'POST' }),
  },

  metrics: {
    get: (clusterId: string, params: Record<string, string>) =>
      request<MetricsResponse>(
        `/connections/${encodeURIComponent(clusterId)}/metrics?${new URLSearchParams(params)}`,
      ),
  },
} as const
