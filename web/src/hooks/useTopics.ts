import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { CreateTopicRequest, UpdateTopicPartitionsRequest } from '../types/topic'

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

export function useCreateTopic(clusterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTopicRequest) => api.topics.create(clusterId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all(clusterId) })
    },
  })
}

export function useDeleteTopic(clusterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (topicName: string) => api.topics.delete(clusterId, topicName),
    onSuccess: (_data, topicName) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all(clusterId) })
      queryClient.removeQueries({ queryKey: queryKeys.topics.detail(clusterId, topicName) })
    },
  })
}

export function useUpdateTopicPartitions(clusterId: string, topicName: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateTopicPartitionsRequest) =>
      api.topics.updatePartitions(clusterId, topicName, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all(clusterId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(clusterId, topicName) })
    },
  })
}

// Message fetching is user-triggered (not auto-loaded), so TopicMessagesPage
// uses a manual fetch pattern instead of a query hook.
