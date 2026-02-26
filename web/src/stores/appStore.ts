import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  activeClusterId: string | null
  sidebarCollapsed: boolean
  setActiveCluster: (id: string | null) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      sidebarCollapsed: false,
      setActiveCluster: (id) => set({ activeClusterId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'kpanel-app' },
  ),
)
