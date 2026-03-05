import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface AppState {
  activeClusterId: string | null
  sidebarCollapsed: boolean
  theme: Theme
  setActiveCluster: (id: string | null) => void
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      sidebarCollapsed: false,
      theme: 'system',
      setActiveCluster: (id) => set({ activeClusterId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'kpanel-app' },
  ),
)
