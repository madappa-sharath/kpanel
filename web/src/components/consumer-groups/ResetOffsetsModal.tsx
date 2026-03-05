// Screen-8: Reset Offsets modal

import { useState } from 'react'
import { useConsumerGroup, useResetOffsets } from '../../hooks/useConsumerGroups'
import { formatNumber } from '../../lib/utils'
import type { ResetOffsetsDiff, ResetOffsetsResult } from '../../types/consumer'
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
            ⚠ {activeMembers} active member{activeMembers !== 1 ? 's' : ''} — resetting offsets on a live group may cause duplicate processing.
            <label className="flex items-center gap-1.5 mt-1.5 text-foreground cursor-pointer">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              I understand, proceed anyway
            </label>
          </div>
        )}

        {step === 'configure' && (
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-muted-foreground mb-1.5 block">Scope</span>
              <div className="flex gap-2">
                {(['all', 'topic'] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={scope === s ? 'default' : 'outline'}
                    onClick={() => setScope(s)}
                  >
                    {s === 'all' ? 'All topics' : 'Single topic'}
                  </Button>
                ))}
              </div>
            </div>

            {scope === 'topic' && (
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
            )}

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
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Timestamp (Unix ms)</label>
                <Input type="number" value={timestampMs} onChange={(e) => setTimestampMs(e.target.value)} placeholder="e.g. 1700000000000" />
              </div>
            )}

            {strategy === 'offset' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Exact offset</label>
                <Input type="number" value={exactOffset} onChange={(e) => setExactOffset(e.target.value)} placeholder="e.g. 12345" />
              </div>
            )}

            {resetMutation.error && (
              <p className="text-sm text-destructive">{(resetMutation.error as Error).message}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handlePreview}
                disabled={resetMutation.isPending || (scope === 'topic' && !topic) || (activeMembers > 0 && !force)}
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
                ⚠ {preview.active_members} active member{preview.active_members !== 1 ? 's' : ''} at time of check
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Preview — {preview.diff.length} partition{preview.diff.length !== 1 ? 's' : ''} will change
            </p>
            <DiffTable diff={preview.diff} />
            {resetMutation.error && (
              <p className="text-sm text-destructive">{(resetMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={reset}>← Back</Button>
              <Button
                variant="destructive"
                onClick={handleApply}
                disabled={resetMutation.isPending || preview.diff.length === 0}
              >
                {resetMutation.isPending ? 'Applying…' : `Apply to ${preview.diff.length} partition${preview.diff.length !== 1 ? 's' : ''}`}
              </Button>
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
