// TODO: Screen-8 — implement as part of Consumer Group Detail screen.
// Strategies: earliest, latest, timestamp, specific offset.

interface ResetOffsetsModalProps {
  open: boolean
  clusterId: string
  groupId: string
  topicName?: string // narrow to specific topic if provided
  onClose: () => void
}

export function ResetOffsetsModal({ open, groupId, onClose }: ResetOffsetsModalProps) {
  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 8, border: '1px solid var(--k-border)', background: 'var(--k-surface)', padding: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--k-text)' }}>Reset Offsets — {groupId}</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--k-muted)' }}>TODO: implement offset reset strategies</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="k-btn">Close</button>
        </div>
      </div>
    </div>
  )
}
