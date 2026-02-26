import { useEffect } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         50,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width:        '100%',
          maxWidth:     380,
          background:   'var(--k-surface)',
          border:       '1px solid var(--k-border-2)',
          borderRadius: 8,
          padding:      '20px 20px 16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          style={{
            margin:     '0 0 6px',
            fontFamily: 'var(--k-font)',
            fontSize:   13,
            fontWeight: 500,
            color:      'var(--k-text)',
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin:     '0 0 18px',
            fontFamily: 'var(--k-font)',
            fontSize:   12,
            color:      'var(--k-muted)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="k-btn k-btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button
            className={`k-btn ${destructive ? 'k-btn-danger' : 'k-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
