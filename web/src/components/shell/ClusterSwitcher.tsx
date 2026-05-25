import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useClusters } from '../../hooks/useCluster'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command'
import { cn } from '../../lib/utils'
import { clusterColorStyles, normalizeClusterColor } from '../../lib/clusterColors'
import type { ClusterColor } from '../../types/cluster'

export function ClusterSwitcher() {
  const { data: clusters }    = useClusters()
  const activeClusterId       = useAppStore((s) => s.activeClusterId)
  const setActiveCluster      = useAppStore((s) => s.setActiveCluster)
  const navigate              = useNavigate()
  const [open, setOpen]       = useState(false)

  const active = clusters?.find((c) => c.id === activeClusterId)
  const activeColor = normalizeClusterColor(active?.color)

  function handleSelect(id: string) {
    if (!id) return
    setActiveCluster(id)
    setOpen(false)
    navigate({ to: '/clusters/$clusterId', params: { clusterId: id } })
  }

  if (!clusters || clusters.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">no clusters</span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="h-8 max-w-56 justify-between gap-2 px-2 text-sm font-medium"
        >
          <span className="flex min-w-0 items-center gap-2">
            {activeColor !== 'none' && (
              <ClusterColorDot color={activeColor} />
            )}
            <span className={cn('truncate', !active && 'text-muted-foreground')}>
              {active?.name ?? 'select cluster...'}
            </span>
          </span>
          <ChevronsUpDown size={12} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search clusters..." />
          <CommandList>
            <CommandEmpty>No clusters found.</CommandEmpty>
            <CommandGroup>
              {clusters.map((c) => (
                <ClusterItem
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  color={normalizeClusterColor(c.color)}
                  active={activeClusterId === c.id}
                  onSelect={handleSelect}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ClusterItem({
  id,
  name,
  color,
  active,
  onSelect,
}: {
  id: string
  name: string
  color: ClusterColor
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <CommandItem
      value={`${name} ${id}`}
      onSelect={() => onSelect(id)}
      className="gap-2"
    >
      {color !== 'none' && (
        <ClusterColorDot color={color} />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Check
        size={13}
        className={cn('text-foreground', active ? 'opacity-100' : 'opacity-0')}
      />
    </CommandItem>
  )
}

function ClusterColorDot({ color }: { color: ClusterColor }) {
  return (
    <span className="relative inline-flex size-2 flex-shrink-0 items-center justify-center">
      <span className={cn('relative inline-flex size-2 rounded-full', clusterColorStyles[color].dot)} />
    </span>
  )
}
