// Screen-4c: Topic Configuration

import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTopic } from '../../../../../hooks/useTopics'
import { api } from '../../../../../lib/api'
import { queryKeys } from '../../../../../lib/queryKeys'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (error) return <div className="p-6 text-destructive">{(error as Error).message}</div>
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
    <div className="p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <Input
          type="text"
          placeholder="Search keys…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-48"
        />
        <span className="text-sm text-muted-foreground flex-1">
          {entries.length} of {allEntries.length} key{allEntries.length !== 1 ? 's' : ''}
          {hideDefaults && defaultCount > 0 && ` · ${defaultCount} default${defaultCount > 1 ? 's' : ''} hidden`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={exportNonDefaults}
          disabled={nonDefaultEntries.length === 0}
          title="Copy non-default configs as JSON"
        >
          {exportToast ? '✓ Copied!' : 'Export non-defaults'}
        </Button>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDefaults}
            onChange={(e) => setHideDefaults(e.target.checked)}
          />
          Hide defaults
        </label>
      </div>

      {saveError && (
        <p className="text-destructive text-sm mb-2">{saveError}</p>
      )}

      <div className="rounded-md border">
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
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
                className={cn(
                  'flex items-center px-4 py-2.5 border-b last:border-b-0 gap-6 hover:bg-muted/40 transition-colors',
                  highlighted && 'bg-amber-50/50 dark:bg-amber-950/20',
                )}
              >
                <code
                  className={cn(
                    'text-xs w-72 flex-shrink-0 font-mono',
                    highlighted ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                  title={description}
                >
                  {key}
                  {description && <span className="ml-1 text-muted-foreground/40 text-xs">ⓘ</span>}
                </code>

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(key)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="flex-1 font-mono text-sm"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => saveEdit(key)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <code className="text-sm font-mono flex-1">{entry.value}</code>
                    {entry.source !== 'default' && (
                      <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 flex-shrink-0">
                        {entry.source}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(key, entry.value)}
                      className="flex-shrink-0 h-7 px-2 opacity-0 group-hover:opacity-100 text-muted-foreground"
                      title={`Edit ${key}`}
                    >
                      ✎
                    </Button>
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
