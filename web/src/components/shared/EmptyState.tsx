interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 16px', textAlign: 'center' }}>
      {icon && <div style={{ marginBottom: 16, color: 'var(--k-faint)' }}>{icon}</div>}
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--k-text)' }}>{title}</p>
      {description && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--k-muted)', maxWidth: 320 }}>{description}</p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
