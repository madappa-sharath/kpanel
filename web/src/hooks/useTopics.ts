import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useTopics(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.topics.all(clusterId),
    queryFn: () => api.topics.list(clusterId),
    enabled: !!clusterId,
  })
}

export function useTopic(clusterId: string, topicName: string) {
  return useQuery({
    queryKey: queryKeys.topics.detail(clusterId, topicName),
    queryFn: () => api.topics.get(clusterId, topicName),
    enabled: !!clusterId && !!topicName,
  })
}

// Message fetching is user-triggered (not auto-loaded), so TopicMessagesPage
// uses a manual fetch pattern instead of a query hook.
