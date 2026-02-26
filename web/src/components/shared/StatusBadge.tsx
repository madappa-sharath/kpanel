type Variant = 'ok' | 'warn' | 'error' | 'neutral' | 'msk'

const CLASS: Record<Variant, string> = {
  ok:      'k-badge k-badge-green',
  warn:    'k-badge k-badge-amber',
  error:   'k-badge k-badge-red',
  neutral: 'k-badge k-badge-muted',
  msk:     'k-badge k-badge-amber',
}

interface StatusBadgeProps {
  variant: Variant
  label: string
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return <span className={CLASS[variant]}>{label}</span>
}

export function groupStateVariant(state: string): Variant {
  if (state === 'Stable') return 'ok'
  if (state === 'Empty')  return 'neutral'
  if (state === 'Dead')   return 'error'
  return 'warn'
}
