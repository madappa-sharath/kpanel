// Screen-8: Reset Offsets modal
// 3-step flow: configure → preview diff → confirm apply

import { useState } from 'react'
import { useConsumerGroup, useResetOffsets } from '../../hooks/useConsumerGroups'
import { formatNumber } from '../../lib/utils'
import type { ResetOffsetsDiff, ResetOffsetsResult } from '../../types/consumer'

interface ResetOffsetsModalProps {
  open: boolean
  clusterId: string
  groupId: string
  onClose: () => void
}

type Strategy = 'earliest' | 'latest' | 'timestamp' | 'offset'

type Step = 'configure' | 'preview' | 'done'

export function ResetOffsetsModal({ open, clusterId, groupId, onClose }: ResetOffsetsModalProps) {
  const { data: group } = useConsumerGroup(clusterId, groupId)
  const resetMutation = useResetOffsets(clusterId, groupId)

  const [step, setStep] = useState<Step>('configure')
  const [scope, setScope] = useState<'all' | 'topic'>('all')
  const [topic, setTopic] = useState('')
  const [strategy, setStrategy] = useState<Strategy>('latest')
  const [timestampMs, setTimestampMs] = useState('')
  const [exactOffset, setExactOffset] = useState('')
  const [force, setForce] = useState(false)
  const [preview, setPreview] = useState<ResetOffsetsResult | null>(null)

  const topics = Array.from(new Set((group?.offsets ?? []).map((o) => o.topic))).sort()
  const activeMembers = group?.members.length ?? 0

  function reset() {
    setStep('configure')
    setPreview(null)
    resetMutation.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handlePreview() {
    const body = buildBody(true)
    if (!body) return
    const result = await resetMutation.mutateAsync(body)
    setPreview(result)
    setStep('preview')
  }

  async function handleApply() {
    const body = buildBody(false)
    if (!body) return
    await resetMutation.mutateAsync(body)
    setStep('done')
  }

  function buildBody(dryRun: boolean) {
    const base = {
      scope,
      strategy,
      dry_run: dryRun,
      force,
      ...(scope === 'topic' ? { topic } : {}),
      ...(strategy === 'timestamp' && timestampMs ? { timestamp_ms: Number(timestampMs) } : {}),
      ...(strategy === 'offset' && exactOffset ? { offset: Number(exactOffset) } : {}),
    }
    return base
  }

  if (!open) return null

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
  }
  const modalStyle: React.CSSProperties = {
    width: '100%', maxWidth: 560, maxHeight: '80vh', overflow: 'auto',
    borderRadius: 8, border: '1px solid var(--k-border)',
    background: 'var(--k-surface)', padding: 24,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--k-muted)', display: 'block', marginBottom: 4 }
  const fieldStyle: React.CSSProperties = { marginBottom: 14 }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--k-text)' }}>
          Reset Offsets — {groupId}
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--k-muted)' }}>
          Moves committed offsets — consumers will re-read messages from the new position.
        </p>

        {/* Active member warning */}
        {activeMembers > 0 && step === 'configure' && (
          <div style={{ padding: '8px 12px', marginBottom: 14, borderRadius: 4, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: 'var(--k-red)' }}>
            ⚠ {activeMembers} active member{activeMembers !== 1 ? 's' : ''} — resetting offsets on a live group may cause duplicate processing.
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: 'var(--k-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              I understand, proceed anyway
            </label>
          </div>
        )}

        {step === 'configure' && (
          <>
            <div style={fieldStyle}>
              <span style={labelStyle}>Scope</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'topic'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={scope === s ? 'k-btn' : 'k-btn-link'}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >
                    {s === 'all' ? 'All topics' : 'Single topic'}
                  </button>
                ))}
              </div>
            </div>

            {scope === 'topic' && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Topic</label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="k-input"
                  style={{ width: '100%' }}
                >
                  <option value="">Select topic…</option>
                  {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            <div style={fieldStyle}>
              <span style={labelStyle}>Strategy</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['earliest', 'latest', 'timestamp', 'offset'] as Strategy[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStrategy(s)}
                    className={strategy === s ? 'k-btn' : 'k-btn-link'}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {strategy === 'timestamp' && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Timestamp (Unix ms)</label>
                <input
                  type="number"
                  value={timestampMs}
                  onChange={(e) => setTimestampMs(e.target.value)}
                  placeholder="e.g. 1700000000000"
                  className="k-input"
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {strategy === 'offset' && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Exact offset</label>
                <input
                  type="number"
                  value={exactOffset}
                  onChange={(e) => setExactOffset(e.target.value)}
                  placeholder="e.g. 12345"
                  className="k-input"
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {resetMutation.error && (
              <p style={{ fontSize: 12, color: 'var(--k-red)', margin: '0 0 12px' }}>
                {(resetMutation.error as Error).message}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={handleClose} className="k-btn-link" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
              <button
                onClick={handlePreview}
                disabled={resetMutation.isPending || (scope === 'topic' && !topic) || (activeMembers > 0 && !force)}
                className="k-btn"
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                {resetMutation.isPending ? 'Loading…' : 'Preview →'}
              </button>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            {preview.active_members > 0 && (
              <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 4, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, color: 'var(--k-amber)' }}>
                ⚠ {preview.active_members} active member{preview.active_members !== 1 ? 's' : ''} at time of check
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--k-muted)', margin: '0 0 10px' }}>
              Preview — {preview.diff.length} partition{preview.diff.length !== 1 ? 's' : ''} will change
            </p>
            <DiffTable diff={preview.diff} />
            {resetMutation.error && (
              <p style={{ fontSize: 12, color: 'var(--k-red)', margin: '8px 0 0' }}>
                {(resetMutation.error as Error).message}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={reset} className="k-btn-link" style={{ padding: '6px 12px', fontSize: 13 }}>← Back</button>
              <button
                onClick={handleApply}
                disabled={resetMutation.isPending || preview.diff.length === 0}
                className="k-btn"
                style={{ padding: '6px 14px', fontSize: 13, background: 'var(--k-red)', borderColor: 'var(--k-red)' }}
              >
                {resetMutation.isPending ? 'Applying…' : `Apply to ${preview.diff.length} partition${preview.diff.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 14, color: 'var(--k-text)', margin: '0 0 4px' }}>✓ Offsets reset successfully</p>
            <p style={{ fontSize: 12, color: 'var(--k-muted)', margin: '0 0 16px' }}>Consumers will resume from the new positions.</p>
            <button onClick={handleClose} className="k-btn" style={{ padding: '6px 16px', fontSize: 13 }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

function DiffTable({ diff }: { diff: ResetOffsetsDiff[] }) {
  return (
    <div style={{ border: '1px solid var(--k-border)', borderRadius: 4, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
      <table className="k-table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Topic</th>
            <th>P#</th>
            <th>Old</th>
            <th>New</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((row) => (
            <tr key={`${row.topic}-${row.partition}`}>
              <td style={{ fontFamily: 'var(--k-font)' }}>{row.topic}</td>
              <td>{row.partition}</td>
              <td style={{ color: 'var(--k-muted)' }}>{formatNumber(row.old_offset)}</td>
              <td>{formatNumber(row.new_offset)}</td>
              <td style={{ color: row.delta < 0 ? 'var(--k-amber)' : 'var(--k-green)' }}>
                {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
