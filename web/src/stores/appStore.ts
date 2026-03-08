import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface AppState {
  activeClusterId: string | null
  theme: Theme
  setActiveCluster: (id: string | null) => void
  setTheme: (theme: Theme) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      theme: 'system',
      setActiveCluster: (id) => set({ activeClusterId: id }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'kpanel-app' },
  ),
)
