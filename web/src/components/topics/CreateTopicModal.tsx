// TODO: Screen-3b — implement as part of Topic List screen.
// Modal for creating a new topic.

interface CreateTopicModalProps {
  clusterId: string
  open: boolean
  onClose: () => void
}

export function CreateTopicModal({ open, onClose }: CreateTopicModalProps) {
  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ width: '100%', maxWidth: 440, borderRadius: 8, border: '1px solid var(--k-border)', background: 'var(--k-surface)', padding: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--k-text)' }}>Create Topic</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--k-muted)' }}>TODO: implement create topic form</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="k-btn">Close</button>
        </div>
      </div>
    </div>
  )
}
