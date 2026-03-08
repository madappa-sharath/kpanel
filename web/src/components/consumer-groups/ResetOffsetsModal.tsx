// Screen-8: Reset Offsets modal

import { useState } from 'react'
import { useConsumerGroup, useResetOffsets } from '../../hooks/useConsumerGroups'
import { formatNumber } from '../../lib/utils'
import type { GroupOffset, ResetOffsetsDiff, ResetOffsetsResult } from '../../types/consumer'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

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
  const [topic, setTopic] = useState('')
  const [strategy, setStrategy] = useState<Strategy>('latest')
  const [timestampMs, setTimestampMs] = useState('')
  const [datetimeLocal, setDatetimeLocal] = useState('')
  const [exactOffset, setExactOffset] = useState('')
  const [force, setForce] = useState(false)
  const [preview, setPreview] = useState<ResetOffsetsResult | null>(null)

  const topics = Array.from(new Set((group?.offsets ?? []).map((o) => o.topic))).sort()
  const activeMembers = group?.members.length ?? 0

  const scope = 'topic' as const

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
    const result = await resetMutation.mutateAsync(body)
    setPreview(result)
    setStep('preview')
  }

  async function handleApply() {
    const body = buildBody(false)
    await resetMutation.mutateAsync(body)
    setStep('done')
  }

  function buildBody(dryRun: boolean) {
    return {
      scope,
      strategy,
      dry_run: dryRun,
      force,
      ...(scope === 'topic' ? { topic } : {}),
      ...(strategy === 'timestamp' && timestampMs ? { timestamp_ms: Number(timestampMs) } : {}),
      ...(strategy === 'offset' && exactOffset ? { offset: Number(exactOffset) } : {}),
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reset Offsets — {groupId}</DialogTitle>
          <DialogDescription>
            Moves committed offsets — consumers will re-read messages from the new position.
          </DialogDescription>
        </DialogHeader>

        {/* Active member warning */}
        {activeMembers > 0 && step === 'configure' && (
          <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <p className="font-medium">⚠ {activeMembers} active member{activeMembers !== 1 ? 's' : ''} — stop the consumer group first.</p>
            <p className="mt-1 text-destructive/80">Running consumers will re-commit their own offsets within seconds and silently undo this reset. The only reliable way to reset offsets is when the group has no active members.</p>
            <label className="flex items-center gap-1.5 mt-2 text-foreground cursor-pointer">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              I understand, the reset may be overwritten
            </label>
          </div>
        )}

        {step === 'configure' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Topic</label>
              <Select value={topic || '_'} onValueChange={(v) => setTopic(v === '_' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select topic…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">Select topic…</SelectItem>
                  {topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <span className="text-xs text-muted-foreground mb-1.5 block">Strategy</span>
              <div className="flex gap-2 flex-wrap">
                {(['earliest', 'latest', 'timestamp', 'offset'] as Strategy[]).map((s) => (
                  <Button key={s} size="sm" variant={strategy === s ? 'default' : 'outline'} onClick={() => setStrategy(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            {strategy === 'timestamp' && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Date &amp; Time</label>
                  <Input
                    type="datetime-local"
                    value={datetimeLocal}
                    onChange={(e) => {
                      setDatetimeLocal(e.target.value)
                      if (e.target.value) {
                        setTimestampMs(String(new Date(e.target.value).getTime()))
                      } else {
                        setTimestampMs('')
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Unix ms <span className="text-muted-foreground/60">(auto-filled from above)</span></label>
                  <Input
                    type="number"
                    value={timestampMs}
                    onChange={(e) => {
                      setTimestampMs(e.target.value)
                      if (e.target.value) {
                        const d = new Date(Number(e.target.value))
                        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                        setDatetimeLocal(local)
                      } else {
                        setDatetimeLocal('')
                      }
                    }}
                    placeholder="e.g. 1700000000000"
                  />
                </div>
              </div>
            )}

            {strategy === 'offset' && (
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Exact offset</label>
                  <Input type="number" value={exactOffset} onChange={(e) => setExactOffset(e.target.value)} placeholder="e.g. 12345" />
                </div>
                <OffsetExceedsLogEndWarning
                  offsets={group?.offsets ?? []}
                  scope={scope}
                  topic={topic}
                  exactOffset={exactOffset}
                />
                <OffsetReferenceTable offsets={group?.offsets ?? []} scope={scope} topic={topic} />
              </div>
            )}

            {resetMutation.error && (
              <p className="text-sm text-destructive">{(resetMutation.error as Error).message}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handlePreview}
                disabled={resetMutation.isPending || !topic || (activeMembers > 0 && !force)}
              >
                {resetMutation.isPending ? 'Loading…' : 'Preview →'}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3">
            {preview.active_members > 0 && (
              <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                ⚠ {preview.active_members} active member{preview.active_members !== 1 ? 's' : ''} — running consumers will likely re-commit their own offsets and undo this reset within seconds.
              </div>
            )}
            {preview.diff.length === 0 ? (
              <div className="px-3 py-3 rounded-md bg-muted border text-sm text-muted-foreground">
                All partitions are already at the requested position — no change needed.
                This typically means the topic has no retained messages before the current committed offset.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Preview — {preview.diff.length} partition{preview.diff.length !== 1 ? 's' : ''} will change
                </p>
                <DiffTable diff={preview.diff} />
              </>
            )}
            {resetMutation.error && (
              <p className="text-sm text-destructive">{(resetMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={reset}>← Back</Button>
              {preview.diff.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleApply}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? 'Applying…' : `Apply to ${preview.diff.length} partition${preview.diff.length !== 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <p className="text-sm font-medium mb-1">✓ Offsets reset successfully</p>
            <p className="text-sm text-muted-foreground mb-4">Consumers will resume from the new positions.</p>
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OffsetExceedsLogEndWarning({ offsets, scope, topic, exactOffset }: { offsets: GroupOffset[]; scope: 'all' | 'topic'; topic: string; exactOffset: string }) {
  if (!exactOffset) return null
  const val = Number(exactOffset)
  if (isNaN(val)) return null

  const relevant = scope === 'topic' && topic ? offsets.filter((o) => o.topic === topic) : offsets
  const maxLogEnd = relevant.length > 0 ? Math.max(...relevant.map((o) => o.log_end_offset)) : -1
  if (maxLogEnd < 0 || val <= maxLogEnd) return null

  return (
    <p className="text-xs text-amber-600 dark:text-amber-400">
      ⚠ Offset {val.toLocaleString()} exceeds the current log end ({maxLogEnd.toLocaleString()}). The consumer will wait at this position with no messages to read until new messages are produced.
    </p>
  )
}

function OffsetReferenceTable({ offsets, scope, topic }: { offsets: GroupOffset[]; scope: 'all' | 'topic'; topic: string }) {
  if (offsets.length === 0) return null

  if (scope === 'topic' && topic) {
    const partitions = offsets.filter((o) => o.topic === topic).sort((a, b) => a.partition - b.partition)
    if (partitions.length === 0) return null
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Current offset ranges (for reference)</p>
        <div className="rounded-md border overflow-hidden text-xs">
          <div className="grid px-3 py-1.5 bg-muted/50 text-muted-foreground" style={{ gridTemplateColumns: '40px 1fr 1fr' }}>
            <span>P#</span><span>Committed</span><span>Log End</span>
          </div>
          {partitions.map((o) => (
            <div key={o.partition} className="grid px-3 py-1.5 border-t font-mono" style={{ gridTemplateColumns: '40px 1fr 1fr' }}>
              <span className="text-muted-foreground">{o.partition}</span>
              <span>{formatNumber(o.committed_offset)}</span>
              <span>{formatNumber(o.log_end_offset)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // scope === 'all': show per-topic min start / max log end
  const topicMap = new Map<string, { minCommitted: number; maxLogEnd: number }>()
  for (const o of offsets) {
    const existing = topicMap.get(o.topic)
    if (!existing) {
      topicMap.set(o.topic, { minCommitted: o.committed_offset, maxLogEnd: o.log_end_offset })
    } else {
      topicMap.set(o.topic, {
        minCommitted: Math.min(existing.minCommitted, o.committed_offset),
        maxLogEnd: Math.max(existing.maxLogEnd, o.log_end_offset),
      })
    }
  }
  const rows = Array.from(topicMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">Current offset ranges (for reference)</p>
      <div className="rounded-md border overflow-hidden text-xs max-h-40 overflow-y-auto">
        <div className="grid px-3 py-1.5 bg-muted/50 text-muted-foreground" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
          <span>Topic</span><span>Min Committed</span><span>Max Log End</span>
        </div>
        {rows.map(([t, { minCommitted, maxLogEnd }]) => (
          <div key={t} className="grid px-3 py-1.5 border-t font-mono" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
            <span className="truncate text-muted-foreground">{t}</span>
            <span>{formatNumber(minCommitted)}</span>
            <span>{formatNumber(maxLogEnd)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiffTable({ diff }: { diff: ResetOffsetsDiff[] }) {
  return (
    <div className="rounded-md border max-h-64 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead>P#</TableHead>
            <TableHead>Old</TableHead>
            <TableHead>New</TableHead>
            <TableHead>Delta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {diff.map((row) => (
            <TableRow key={`${row.topic}-${row.partition}`}>
              <TableCell className="font-mono text-xs">{row.topic}</TableCell>
              <TableCell>{row.partition}</TableCell>
              <TableCell className="text-muted-foreground">{formatNumber(row.old_offset)}</TableCell>
              <TableCell>{formatNumber(row.new_offset)}</TableCell>
              <TableCell className={cn(row.delta < 0 ? 'text-amber-600' : 'text-green-600')}>
                {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
