import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Variant = 'ok' | 'warn' | 'error' | 'neutral' | 'msk'

const CLASS: Record<Variant, string> = {
  ok:      'text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950 dark:text-green-400',
  warn:    'text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
  error:   'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'text-muted-foreground',
  msk:     'text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
}

interface StatusBadgeProps {
  variant: Variant
  label: string
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(CLASS[variant])}>
      {label}
    </Badge>
  )
}

export function groupStateVariant(state: string): Variant {
  if (state === 'Stable') return 'ok'
  if (state === 'Empty')  return 'neutral'
  if (state === 'Dead')   return 'error'
  return 'warn'
}
