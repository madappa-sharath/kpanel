import { useState } from 'react'
import { AlignLeft, CheckCircle2, Code2, Plus, Send, Trash2, Wand2 } from 'lucide-react'
import { useProduceMessage } from '../../hooks/useTopics'
import { cn } from '#/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import type { ProduceMessageHeader, ProduceMessageResponse } from '../../types/topic'

type ValueFormat = 'text' | 'json'

interface HeaderRow {
  id: number
  key: string
  value: string
}

interface ProduceMessageModalProps {
  open: boolean
  clusterId: string
  topicName: string
  partitions: number[]
  onClose: () => void
}

export function ProduceMessageModal({
  open,
  clusterId,
  topicName,
  partitions,
  onClose,
}: ProduceMessageModalProps) {
  const produceMessage = useProduceMessage(clusterId, topicName)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [format, setFormat] = useState<ValueFormat>('text')
  const [partition, setPartition] = useState('auto')
  const [headers, setHeaders] = useState<HeaderRow[]>([])
  const [nextHeaderId, setNextHeaderId] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProduceMessageResponse | null>(null)
  const sortedPartitions = [...partitions].sort((a, b) => a - b)

  function reset() {
    setKey('')
    setValue('')
    setFormat('text')
    setPartition('auto')
    setHeaders([])
    setNextHeaderId(1)
    setError(null)
    setResult(null)
    produceMessage.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  function updateHeader(id: number, field: 'key' | 'value', next: string) {
    setHeaders((rows) => rows.map((row) => row.id === id ? { ...row, [field]: next } : row))
  }

  function addHeader() {
    setHeaders((rows) => [...rows, { id: nextHeaderId, key: '', value: '' }])
    setNextHeaderId((id) => id + 1)
  }

  function removeHeader(id: number) {
    setHeaders((rows) => rows.filter((row) => row.id !== id))
  }

  function parseValueJSON(): { ok: true; value: unknown } | { ok: false } {
    if (!value.trim()) {
      setError('JSON value is empty')
      return { ok: false }
    }
    try {
      setError(null)
      return { ok: true, value: JSON.parse(value) as unknown }
    } catch (err) {
      setError(`Invalid JSON: ${(err as Error).message}`)
      return { ok: false }
    }
  }

  function formatJSON() {
    const parsed = parseValueJSON()
    if (parsed.ok) setValue(JSON.stringify(parsed.value, null, 2))
  }

  function minifyJSON() {
    const parsed = parseValueJSON()
    if (parsed.ok) setValue(JSON.stringify(parsed.value))
  }

  function buildHeaders(): ProduceMessageHeader[] | null {
    const rows = headers
      .map((header) => ({ key: header.key.trim(), value: header.value }))
      .filter((header) => header.key !== '' || header.value !== '')

    const missingKey = rows.some((header) => header.key === '')
    if (missingKey) {
      setError('Header key is required')
      return null
    }
    return rows
  }

  async function handleSubmit() {
    setError(null)
    setResult(null)

    if (format === 'json' && value.trim() !== '') {
      try {
        JSON.parse(value)
      } catch (err) {
        setError(`Invalid JSON: ${(err as Error).message}`)
        return
      }
    }

    const requestHeaders = buildHeaders()
    if (requestHeaders === null) return

    try {
      const produced = await produceMessage.mutateAsync({
        ...(key.trim() ? { key } : {}),
        value,
        ...(requestHeaders.length > 0 ? { headers: requestHeaders } : {}),
        ...(partition === 'auto' ? {} : { partition: Number(partition) }),
      })
      setResult(produced)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Produce Message</DialogTitle>
          <DialogDescription>
            Send a single Kafka record to <span className="font-mono text-foreground">{topicName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[72vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Key</label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Optional message key"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Partition</label>
              <Select value={partition} onValueChange={setPartition} disabled={sortedPartitions.length === 0}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {sortedPartitions.map((p) => (
                    <SelectItem key={p} value={String(p)}>Partition {p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-xs text-muted-foreground">Value</label>
              <div className="flex items-center gap-1.5">
                <div className="flex overflow-hidden rounded-md border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => setFormat('text')}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 px-3 transition-colors',
                      format === 'text' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('json')}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 border-l border-border px-3 transition-colors',
                      format === 'json' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    JSON
                  </button>
                </div>

                {format === 'json' && (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={formatJSON}>
                      <Wand2 className="h-3.5 w-3.5" />
                      Format
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={minifyJSON}>
                      Minify
                    </Button>
                  </>
                )}
              </div>
            </div>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={format === 'json' ? '{\n  "event": "created"\n}' : 'Message payload'}
              className="min-h-52 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-xs text-muted-foreground">Headers</label>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={addHeader}>
                <Plus className="h-3.5 w-3.5" />
                Header
              </Button>
            </div>

            {headers.length > 0 ? (
              <div className="flex flex-col gap-2">
                {headers.map((header) => (
                  <div key={header.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2">
                    <Input
                      value={header.key}
                      onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                      placeholder="Header key"
                    />
                    <Input
                      value={header.value}
                      onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                      placeholder="Header value"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeHeader(header.id)}
                      title="Remove header"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                No headers
              </div>
            )}
          </div>

          {(error || produceMessage.error) && (
            <p className="text-sm text-destructive">{error ?? (produceMessage.error as Error).message}</p>
          )}

          {result && (
            <div className="flex items-start gap-2 rounded-md border border-green-600/30 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Produced to partition <span className="font-mono">{result.partition}</span> at offset{' '}
                <span className="font-mono">{result.offset}</span>
                <div className="mt-0.5 text-xs text-green-700/80 dark:text-green-300/80">
                  {new Date(result.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>Close</Button>
            <Button onClick={handleSubmit} disabled={produceMessage.isPending}>
              <Send className="h-4 w-4" />
              {produceMessage.isPending ? 'Producing...' : 'Produce'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
