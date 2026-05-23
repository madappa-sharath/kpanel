import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface AppState {
  activeClusterId: string | null
  theme: Theme
  writeModeEnabled: boolean
  setActiveCluster: (id: string | null) => void
  setTheme: (theme: Theme) => void
  setWriteModeEnabled: (enabled: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      theme: 'system',
      writeModeEnabled: false,
      setActiveCluster: (id) => set({ activeClusterId: id }),
      setTheme: (theme) => set({ theme }),
      setWriteModeEnabled: (enabled) => set({ writeModeEnabled: enabled }),
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
