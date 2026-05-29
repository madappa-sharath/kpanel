import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

const WRITE_MODE_SESSION_KEY = 'kpanel-write-mode'

function getInitialWriteMode() {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(WRITE_MODE_SESSION_KEY) === 'enabled'
}

function persistWriteMode(enabled: boolean) {
  if (typeof window === 'undefined') return
  if (enabled) {
    window.sessionStorage.setItem(WRITE_MODE_SESSION_KEY, 'enabled')
    return
  }
  window.sessionStorage.removeItem(WRITE_MODE_SESSION_KEY)
}

export interface TopicListState {
  search: string
  showInternal: boolean
  page: number
}

export interface GroupListState {
  search: string
  stateFilter: string
  sortBy: 'lag-desc' | 'lag-asc' | 'group-id'
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
  sortBy: 'lag-desc',
  page: 1,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      theme: 'system',
      writeModeEnabled: getInitialWriteMode(),
      topicListStateByCluster: {},
      groupListStateByCluster: {},
      setActiveCluster: (id) => set({ activeClusterId: id }),
      setTheme: (theme) => set({ theme }),
      setWriteModeEnabled: (enabled) => {
        persistWriteMode(enabled)
        set({ writeModeEnabled: enabled })
      },
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
