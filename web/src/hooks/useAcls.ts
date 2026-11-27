import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { AclBinding } from '../types/acl'

export function useAcls(clusterId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.acls.all(clusterId),
    queryFn: () => api.acls.list(clusterId),
    enabled: !!clusterId && enabled,
    // Classified failures (no authorizer, not authorized) will not change on retry.
    retry: (count, err) => !(err instanceof ApiError && err.code) && count < 2,
  })
}

export function useCreateAcls(clusterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bindings: AclBinding[]) => api.acls.create(clusterId, bindings),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.acls.all(clusterId) })
    },
  })
}

export function useDeleteAcls(clusterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bindings: AclBinding[]) => api.acls.delete(clusterId, bindings),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.acls.all(clusterId) })
    },
  })
}
