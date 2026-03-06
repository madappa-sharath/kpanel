import { useState } from 'react'
import { useUpdateTopicPartitions } from '../../hooks/useTopics'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface IncreasePartitionsModalProps {
  open: boolean
  clusterId: string
  topicName: string
  currentPartitions: number
  onClose: () => void
}

export function IncreasePartitionsModal({
  open,
  clusterId,
  topicName,
  currentPartitions,
  onClose,
}: IncreasePartitionsModalProps) {
  const updatePartitions = useUpdateTopicPartitions(clusterId, topicName)
  const [targetPartitions, setTargetPartitions] = useState(String(currentPartitions + 1))
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTargetPartitions(String(currentPartitions + 1))
    setError(null)
    updatePartitions.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    const next = Number(targetPartitions)
    if (!Number.isInteger(next) || next < 1) {
      setError('Partitions must be an integer >= 1')
      return
    }
    if (next <= currentPartitions) {
      setError(`Target must be greater than current count (${currentPartitions})`)
      return
    }

    setError(null)
    try {
      await updatePartitions.mutateAsync({ partitions: next })
      handleClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Increase Partitions</DialogTitle>
          <DialogDescription>
            Kafka only supports increasing partition count. Current partitions: {currentPartitions}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Target total partitions</label>
            <Input
              type="number"
              min={currentPartitions + 1}
              step={1}
              value={targetPartitions}
              onChange={(e) => setTargetPartitions(e.target.value)}
              autoFocus
            />
          </div>

          {(error || updatePartitions.error) && (
            <p className="text-sm text-destructive">{error ?? (updatePartitions.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={updatePartitions.isPending}>
              {updatePartitions.isPending ? 'Updating…' : 'Increase'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
