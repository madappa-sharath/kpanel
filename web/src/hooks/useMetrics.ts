import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { TimeRange } from '../components/metrics/TimeRangePicker'

const FIVE_MINUTES = 5 * 60 * 1000

export function useClusterMetrics(clusterId: string, enabled = true, range: TimeRange = '3h') {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'cluster', undefined, range),
    queryFn: () => api.metrics.get(clusterId, { scope: 'cluster', range }),
    enabled: !!clusterId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useBrokerMetrics(clusterId: string, brokerId: string, enabled = true, range: TimeRange = '3h') {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'broker', brokerId, range),
    queryFn: () => api.metrics.get(clusterId, { scope: 'broker', broker_id: brokerId, range }),
    enabled: !!clusterId && !!brokerId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useTopicMetrics(clusterId: string, topicName: string, enabled = true, range: TimeRange = '3h') {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'topic', topicName, range),
    queryFn: () => api.metrics.get(clusterId, { scope: 'topic', topic: topicName, range }),
    enabled: !!clusterId && !!topicName && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useConsumerMetrics(clusterId: string, groupId: string, enabled = true, range: TimeRange = '3h') {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'consumer', groupId, range),
    queryFn: () => api.metrics.get(clusterId, { scope: 'consumer', group: groupId, range }),
    enabled: !!clusterId && !!groupId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}
