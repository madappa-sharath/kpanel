import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useClusters() {
  return useQuery({
    queryKey: queryKeys.connections.all(),
    queryFn: api.connections.list,
  })
}

export function useClusterSession(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.connections.session(clusterId),
    queryFn: () => api.connections.session(clusterId),
    enabled: !!clusterId,
    retry: false,
    refetchInterval: 60_000, // poll every 60s to catch expired SSO sessions
  })
}

export function useConnectionStatus(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.connections.status(clusterId),
    queryFn: () => api.connections.status(clusterId),
    enabled: !!clusterId,
    retry: false,
    refetchInterval: 30_000,
  })
}

export function useClusterOverview(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.connections.overview(clusterId),
    queryFn: () => api.connections.overview(clusterId),
    enabled: !!clusterId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  })
}
