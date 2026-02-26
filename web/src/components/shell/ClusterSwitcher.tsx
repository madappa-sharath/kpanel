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
      <span style={{ color: 'var(--k-muted)', fontSize: 11, fontFamily: 'var(--k-font)' }}>
        no clusters
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        value={activeClusterId ?? ''}
        onChange={handleChange}
        style={{
          appearance:  'none',
          background:  'transparent',
          border:      'none',
          fontFamily:  'var(--k-font)',
          fontSize:    13,
          fontWeight:  500,
          color:       active ? 'var(--k-text)' : 'var(--k-muted)',
          paddingRight: 18,
          cursor:      'pointer',
          outline:     'none',
        }}
      >
        {!active && (
          <option value="">select cluster…</option>
        )}
        {clusters.map((c) => (
          <option key={c.id} value={c.id} style={{ background: '#111', color: '#DAD5CF' }}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        style={{
          position:       'absolute',
          right:          0,
          color:          'var(--k-muted)',
          pointerEvents:  'none',
        }}
      />
    </div>
  )
}
