import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateTopic } from '../../hooks/useTopics'
import { useBrokers } from '../../hooks/useBrokers'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface CreateTopicModalProps {
  clusterId: string
  open: boolean
  onClose: () => void
}

export function CreateTopicModal({ clusterId, open, onClose }: CreateTopicModalProps) {
  const navigate = useNavigate()
  const createTopic = useCreateTopic(clusterId)
  const { data: brokers = [] } = useBrokers(clusterId)
  const [name, setName] = useState('')
  const [partitions, setPartitions] = useState('3')
  const [replicationFactor, setReplicationFactor] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const brokerCount = brokers.length

  function resetForm() {
    setName('')
    setPartitions('3')
    setReplicationFactor('1')
    setError(null)
    createTopic.reset()
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    const partitionsValue = Number(partitions)
    const replicationValue = Number(replicationFactor)

    if (!trimmedName) {
      setError('Topic name is required')
      return
    }
    if (!Number.isInteger(partitionsValue) || partitionsValue < 1) {
      setError('Partitions must be an integer >= 1')
      return
    }
    if (!Number.isInteger(replicationValue) || replicationValue < 1) {
      setError('Replication factor must be an integer >= 1')
      return
    }
    if (brokerCount > 0 && replicationValue > brokerCount) {
      setError(`Replication factor cannot exceed broker count (${brokerCount})`)
      return
    }

    setError(null)
    try {
      await createTopic.mutateAsync({
        name: trimmedName,
        partitions: partitionsValue,
        replication_factor: replicationValue,
      })
      handleClose()
      navigate({
        to: '/clusters/$clusterId/topics/$topicName',
        params: { clusterId, topicName: trimmedName },
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Topic</DialogTitle>
          <DialogDescription>
            Create a new Kafka topic with explicit partition and replication settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. orders-events"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Partitions</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={partitions}
                onChange={(e) => setPartitions(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Replication Factor</label>
              <Input
                type="number"
                min={1}
                max={brokerCount > 0 ? brokerCount : undefined}
                step={1}
                value={replicationFactor}
                onChange={(e) => {
                  const next = e.target.value
                  if (brokerCount > 0 && Number(next) > brokerCount) {
                    setReplicationFactor(String(brokerCount))
                    return
                  }
                  setReplicationFactor(next)
                }}
              />
              {brokerCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Available brokers: {brokerCount}</p>
              )}
            </div>
          </div>

          {(error || createTopic.error) && (
            <p className="text-sm text-destructive">{error ?? (createTopic.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createTopic.isPending}>
              {createTopic.isPending ? 'Creating…' : 'Create Topic'}
            </Button>
          </div>
        </div>
     </DialogContent>
    </Dialog>
  )
}
