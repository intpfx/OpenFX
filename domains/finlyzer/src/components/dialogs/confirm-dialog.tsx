import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ConfirmDialog({
  open,
  title,
  description,
  dangerous,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  dangerous: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={dangerous ? 'destructive' : 'default'}
            onClick={async () => {
              onOpenChange(false)
              await onConfirm()
            }}
          >
            确认{dangerous ? '删除' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}