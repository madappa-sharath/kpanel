import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { useAppStore } from './stores/appStore'
import './index.css'

const queryClient = new QueryClient()

// Apply theme class to <html> and keep it in sync
function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

// Initialize theme from persisted store before first render
const stored = useAppStore.getState().theme
applyTheme(stored)

// Listen for system preference changes
const systemMedia = window.matchMedia('(prefers-color-scheme: dark)')
systemMedia.addEventListener('change', () => {
  const current = useAppStore.getState().theme
  if (current === 'system') applyTheme('system')
})

// Re-apply whenever the store changes
useAppStore.subscribe((state) => {
  applyTheme(state.theme)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
