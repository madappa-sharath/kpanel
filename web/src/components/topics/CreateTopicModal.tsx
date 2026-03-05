// TODO: Screen-3b — implement as part of Topic List screen.
// Modal for creating a new topic.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface CreateTopicModalProps {
  clusterId: string
  open: boolean
  onClose: () => void
}

export function CreateTopicModal({ open, onClose }: CreateTopicModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Topic</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">TODO: implement create topic form</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
