import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

const FIVE_MINUTES = 5 * 60 * 1000

export function useClusterMetrics(clusterId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'cluster'),
    queryFn: () => api.metrics.get(clusterId, { scope: 'cluster' }),
    enabled: !!clusterId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useBrokerMetrics(clusterId: string, brokerId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'broker', brokerId),
    queryFn: () => api.metrics.get(clusterId, { scope: 'broker', broker_id: brokerId }),
    enabled: !!clusterId && !!brokerId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useTopicMetrics(clusterId: string, topicName: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'topic', topicName),
    queryFn: () => api.metrics.get(clusterId, { scope: 'topic', topic: topicName }),
    enabled: !!clusterId && !!topicName && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}

export function useConsumerMetrics(clusterId: string, groupId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.metrics.byScope(clusterId, 'consumer', groupId),
    queryFn: () => api.metrics.get(clusterId, { scope: 'consumer', group: groupId }),
    enabled: !!clusterId && !!groupId && enabled,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  })
}
