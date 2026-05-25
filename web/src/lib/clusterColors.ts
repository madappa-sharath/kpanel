import type { ClusterColor } from '../types/cluster'

export const CLUSTER_COLORS: { value: ClusterColor; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'zinc', label: 'Zinc' },
]

export const clusterColorStyles: Record<ClusterColor, { dot: string; header: string; ring: string }> = {
  none: {
    dot: 'bg-transparent',
    header: 'border-t-transparent',
    ring: 'ring-muted-foreground/30',
  },
  red: {
    dot: 'bg-red-500',
    header: 'border-t-red-500',
    ring: 'ring-red-500',
  },
  orange: {
    dot: 'bg-orange-500',
    header: 'border-t-orange-500',
    ring: 'ring-orange-500',
  },
  amber: {
    dot: 'bg-amber-500',
    header: 'border-t-amber-500',
    ring: 'ring-amber-500',
  },
  green: {
    dot: 'bg-green-500',
    header: 'border-t-green-500',
    ring: 'ring-green-500',
  },
  blue: {
    dot: 'bg-blue-500',
    header: 'border-t-blue-500',
    ring: 'ring-blue-500',
  },
  violet: {
    dot: 'bg-violet-500',
    header: 'border-t-violet-500',
    ring: 'ring-violet-500',
  },
  zinc: {
    dot: 'bg-zinc-500',
    header: 'border-t-zinc-500',
    ring: 'ring-zinc-500',
  },
}

export function normalizeClusterColor(color: ClusterColor | undefined): ClusterColor {
  return color ?? 'none'
}
