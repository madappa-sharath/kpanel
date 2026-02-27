import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useBrokers(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.brokers.all(clusterId),
    queryFn: () => api.brokers.list(clusterId),
    enabled: !!clusterId,
  })
}
