import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useAppStore } from '../stores/appStore'
import type { AddClusterRequest } from '../types/cluster'

export function useAddCluster() {
  const qc = useQueryClient()
  const setActive = useAppStore((s) => s.setActiveCluster)

  return useMutation({
    mutationFn: (body: AddClusterRequest) => api.connections.add(body),
    onSuccess: (cluster) => {
      qc.invalidateQueries({ queryKey: queryKeys.connections.all() })
      setActive(cluster.id)
    },
  })
}

export function useDeleteCluster() {
  const qc = useQueryClient()
  const activeClusterId = useAppStore((s) => s.activeClusterId)
  const setActive = useAppStore((s) => s.setActiveCluster)

  return useMutation({
    mutationFn: (id: string) => api.connections.delete(id),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: queryKeys.connections.all() })
      if (activeClusterId === deletedId) setActive(null)
    },
  })
}
