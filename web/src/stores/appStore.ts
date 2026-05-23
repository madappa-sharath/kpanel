import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

export interface TopicListState {
  search: string
  showInternal: boolean
  page: number
}

export interface GroupListState {
  search: string
  stateFilter: string
  page: number
}

interface AppState {
  activeClusterId: string | null
  theme: Theme
  writeModeEnabled: boolean
  topicListStateByCluster: Record<string, TopicListState>
  groupListStateByCluster: Record<string, GroupListState>
  setActiveCluster: (id: string | null) => void
  setTheme: (theme: Theme) => void
  setWriteModeEnabled: (enabled: boolean) => void
  setTopicListState: (clusterId: string, patch: Partial<TopicListState>) => void
  setGroupListState: (clusterId: string, patch: Partial<GroupListState>) => void
}

const defaultTopicListState: TopicListState = {
  search: '',
  showInternal: false,
  page: 1,
}

const defaultGroupListState: GroupListState = {
  search: '',
  stateFilter: '',
  page: 1,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      theme: 'system',
      writeModeEnabled: false,
      topicListStateByCluster: {},
      groupListStateByCluster: {},
      setActiveCluster: (id) => set({ activeClusterId: id }),
      setTheme: (theme) => set({ theme }),
      setWriteModeEnabled: (enabled) => set({ writeModeEnabled: enabled }),
      setTopicListState: (clusterId, patch) =>
        set((state) => ({
          topicListStateByCluster: {
            ...state.topicListStateByCluster,
            [clusterId]: {
              ...defaultTopicListState,
              ...state.topicListStateByCluster[clusterId],
              ...patch,
            },
          },
        })),
      setGroupListState: (clusterId, patch) =>
        set((state) => ({
          groupListStateByCluster: {
            ...state.groupListStateByCluster,
            [clusterId]: {
              ...defaultGroupListState,
              ...state.groupListStateByCluster[clusterId],
              ...patch,
            },
          },
        })),
    }),
    {
      name: 'kpanel-app',
      partialize: (state) => ({
        activeClusterId: state.activeClusterId,
        theme: state.theme,
      }),
    },
  ),
)
