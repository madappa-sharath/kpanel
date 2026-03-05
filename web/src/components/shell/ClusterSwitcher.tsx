import { useNavigate } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useClusters } from '../../hooks/useCluster'
import { useAppStore } from '../../stores/appStore'

export function ClusterSwitcher() {
  const { data: clusters }    = useClusters()
  const activeClusterId       = useAppStore((s) => s.activeClusterId)
  const setActiveCluster      = useAppStore((s) => s.setActiveCluster)
  const navigate              = useNavigate()

  const active = clusters?.find((c) => c.id === activeClusterId)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) return
    setActiveCluster(id)
    navigate({ to: '/clusters/$clusterId', params: { clusterId: id } })
  }

  if (!clusters || clusters.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">no clusters</span>
    )
  }

  return (
    <div className="relative flex items-center">
      <select
        value={activeClusterId ?? ''}
        onChange={handleChange}
        className="appearance-none bg-transparent border-none text-sm font-medium text-foreground pr-4 cursor-pointer outline-none"
        style={{ color: active ? undefined : 'var(--muted-foreground)' }}
      >
        {!active && (
          <option value="">select cluster…</option>
        )}
        {clusters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-0 text-muted-foreground pointer-events-none" />
    </div>
  )
}
