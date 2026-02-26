import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useConsumerGroups(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.groups.all(clusterId),
    queryFn: () => api.groups.list(clusterId),
    enabled: !!clusterId,
  })
}

export function useConsumerGroup(clusterId: string, groupId: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(clusterId, groupId),
    queryFn: () => api.groups.get(clusterId, groupId),
    enabled: !!clusterId && !!groupId,
  })
}
