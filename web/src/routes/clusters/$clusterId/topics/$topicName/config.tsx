// Screen-4c: Topic Configuration
// Key-value config viewer with search, inline editing, export, and tooltips

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTopic } from '../../../../../hooks/useTopics'
import { api } from '../../../../../lib/api'
import { queryKeys } from '../../../../../lib/queryKeys'

const HIGHLIGHTED_KEYS = new Set([
  'cleanup.policy',
  'retention.ms',
  'retention.bytes',
  'min.insync.replicas',
  'compression.type',
  'max.message.bytes',
])

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  'retention.ms': 'How long messages are retained. -1 = unlimited.',
  'retention.bytes': 'Max size of a partition before oldest segments are deleted. -1 = unlimited.',
  'cleanup.policy': 'delete: remove old segments. compact: keep latest value per key.',
  'min.insync.replicas': 'Minimum ISR count required for a produce with acks=all to succeed.',
  'max.message.bytes': 'Maximum size of a single message batch in bytes.',
  'compression.type': 'Compression codec: none, gzip, snappy, lz4, zstd, producer.',
  'segment.bytes': 'Size of a single log segment file.',
  'segment.ms': 'Time before a new log segment is rolled even if not full.',
  'message.timestamp.type': 'CreateTime or LogAppendTime.',
  'unclean.leader.election.enable': 'Allow out-of-sync replicas to become leader.',
  'delete.retention.ms': 'For compacted topics: how long delete tombstones are retained.',
  'min.compaction.lag.ms': 'Minimum time a message remains uncompacted.',
  'max.compaction.lag.ms': 'Maximum time a message can remain uncompacted.',
  'preallocate': 'Whether to preallocate log segment files.',
  'flush.messages': 'Force fsync after N messages.',
}

export function TopicConfigPage() {
  const { clusterId, topicName } = useParams({ strict: false }) as {
    clusterId: string
    topicName: string
  }
  const queryClient = useQueryClient()
  const { data: topic, isLoading, error } = useTopic(clusterId, topicName)
  const [hideDefaults, setHideDefaults] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exportToast, setExportToast] = useState(false)

  if (isLoading) return <div className="k-loading">Loading…</div>
  if (error) return <div className="k-error">{(error as Error).message}</div>
  if (!topic) return null

  const allEntries = Object.entries(topic.config).sort(([a], [b]) => a.localeCompare(b))
  const afterDefaults = hideDefaults ? allEntries.filter(([, v]) => v.source !== 'default') : allEntries
  const entries = searchText
    ? afterDefaults.filter(([k]) => k.toLowerCase().includes(searchText.toLowerCase()))
    : afterDefaults

  const defaultCount = allEntries.filter(([, v]) => v.source === 'default').length
  const nonDefaultEntries = allEntries.filter(([, v]) => v.source !== 'default')

  function startEdit(key: string, currentValue: string) {
    setEditingKey(key)
    setEditValue(currentValue)
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditValue('')
    setSaveError(null)
  }

  async function saveEdit(key: string) {
    setSaving(true)
    setSaveError(null)
    try {
      await api.topics.updateConfig(clusterId, topicName, { [key]: editValue })
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics.detail(clusterId, topicName) })
      setEditingKey(null)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function exportNonDefaults() {
    const obj = Object.fromEntries(nonDefaultEntries.map(([k, v]) => [k, v.value]))
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
    setExportToast(true)
    setTimeout(() => setExportToast(false), 2000)
  }

  return (
    <div className="k-page">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="k-input"
          type="text"
          placeholder="Search keys…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 200 }}
        />
        <span style={{ fontSize: 13, color: 'var(--k-muted)', flex: 1 }}>
          {entries.length} of {allEntries.length} key{allEntries.length !== 1 ? 's' : ''}
          {hideDefaults && defaultCount > 0 && ` · ${defaultCount} default${defaultCount > 1 ? 's' : ''} hidden`}
        </span>
        <button
          onClick={exportNonDefaults}
          disabled={nonDefaultEntries.length === 0}
          className="k-btn"
          style={{ opacity: nonDefaultEntries.length === 0 ? 0.4 : 1 }}
          title="Copy non-default configs as JSON"
        >
          {exportToast ? '✓ Copied!' : 'Export non-defaults'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--k-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={hideDefaults}
            onChange={(e) => setHideDefaults(e.target.checked)}
          />
          Hide defaults
        </label>
      </div>

      {saveError && (
        <p style={{ color: 'var(--k-red)', fontSize: 13, marginBottom: 8 }}>{saveError}</p>
      )}

      <div style={{ border: '1px solid var(--k-border)', borderRadius: 6, overflow: 'hidden' }}>
        {entries.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--k-muted)', fontSize: 14, textAlign: 'center' }}>
            {searchText
              ? `No keys matching "${searchText}"`
              : hideDefaults
              ? 'No overridden keys — all values are broker defaults'
              : 'No configuration returned'}
          </p>
        ) : (
          entries.map(([key, entry]) => {
            const highlighted = HIGHLIGHTED_KEYS.has(key)
            const description = CONFIG_DESCRIPTIONS[key]
            const isEditing = editingKey === key

            return (
              <div
                key={key}
                className="k-hover-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 16px',
                  borderBottom: '1px solid var(--k-border)',
                  gap: 24,
                  background: highlighted ? 'color-mix(in srgb, var(--k-amber) 5%, transparent)' : undefined,
                }}
              >
                <code
                  style={{
                    fontSize: 12,
                    color: highlighted ? 'var(--k-text)' : 'var(--k-muted)',
                    fontWeight: highlighted ? 500 : undefined,
                    width: 280,
                    flexShrink: 0,
                    fontFamily: 'var(--k-font)',
                  }}
                  title={description}
                >
                  {key}
                  {description && (
                    <span style={{ marginLeft: 4, color: 'var(--k-faint)', fontSize: 10 }}>ⓘ</span>
                  )}
                </code>

                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                      className="k-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(key)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      style={{ flex: 1, fontFamily: 'var(--k-font)', fontSize: 13 }}
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(key)}
                      disabled={saving}
                      className="k-btn"
                      style={{ opacity: saving ? 0.4 : 1 }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={cancelEdit} className="k-btn" style={{ color: 'var(--k-muted)' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <code style={{ fontSize: 13, color: 'var(--k-text)', fontFamily: 'var(--k-font)', flex: 1 }}>
                      {entry.value}
                    </code>
                    {entry.source !== 'default' && (
                      <span style={{ fontSize: 11, color: 'var(--k-amber)', background: 'color-mix(in srgb, var(--k-amber) 15%, transparent)', padding: '2px 6px', borderRadius: 3, flexShrink: 0 }}>
                        {entry.source}
                      </span>
                    )}
                    <button
                      onClick={() => startEdit(key, entry.value)}
                      className="k-hover-show"
                      style={{ background: 'none', border: 'none', padding: '2px 6px', cursor: 'pointer', color: 'var(--k-muted)', fontSize: 13, flexShrink: 0 }}
                      title={`Edit ${key}`}
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
