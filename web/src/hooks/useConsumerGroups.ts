import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { ResetOffsetsRequest } from '../types/consumer'

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

export function useLagHistory(clusterId: string, groupId: string) {
  return useQuery({
    queryKey: queryKeys.groups.lagHistory(clusterId, groupId),
    queryFn: () => api.groups.lagHistory(clusterId, groupId),
    enabled: !!clusterId && !!groupId,
    refetchInterval: 15_000,
  })
}

export function useResetOffsets(clusterId: string, groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ResetOffsetsRequest) =>
      api.groups.resetOffsets(clusterId, groupId, body),
    onSuccess: (_data, variables) => {
      if (!variables.dry_run) {
        // Invalidate group detail so offsets refresh after a real reset
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(clusterId, groupId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.groups.lagHistory(clusterId, groupId) })
      }
    },
  })
}
