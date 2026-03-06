import { useState } from 'react'
import { useDeleteTopic } from '../../hooks/useTopics'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface DeleteTopicModalProps {
  open: boolean
  clusterId: string
  topicName: string
  onDeleted: () => void
  onClose: () => void
}

export function DeleteTopicModal({
  open,
  clusterId,
  topicName,
  onDeleted,
  onClose,
}: DeleteTopicModalProps) {
  const deleteTopic = useDeleteTopic(clusterId)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setConfirmText('')
    setError(null)
    deleteTopic.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleConfirm() {
    if (confirmText !== topicName) {
      setError('Type the topic name exactly to confirm deletion')
      return
    }

    setError(null)
    try {
      await deleteTopic.mutateAsync(topicName)
      reset()
      onDeleted()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Topic</DialogTitle>
          <DialogDescription>
            This action is destructive. Type <span className="font-mono text-foreground">{topicName}</span> to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={topicName}
            autoFocus
          />

          {(error || deleteTopic.error) && (
            <p className="text-sm text-destructive">{error ?? (deleteTopic.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={deleteTopic.isPending || confirmText !== topicName}
            >
              {deleteTopic.isPending ? 'Deleting…' : 'Delete Topic'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
