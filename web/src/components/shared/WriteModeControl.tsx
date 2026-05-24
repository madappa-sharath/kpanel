import { Shield, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

interface WriteModeControlProps {
  showLabel?: boolean
  align?: 'start' | 'center' | 'end'
  className?: string
}

interface WriteModeBannerProps {
  className?: string
  description?: string
}

export function WriteModeControl({ showLabel = true, align = 'end', className }: WriteModeControlProps) {
  const writeModeEnabled = useAppStore((s) => s.writeModeEnabled)
  const setWriteModeEnabled = useAppStore((s) => s.setWriteModeEnabled)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={writeModeEnabled ? 'outline' : 'ghost'}
          size={showLabel ? 'sm' : 'icon'}
          className={cn(
            showLabel ? 'h-7 gap-1.5 text-xs' : 'h-7 w-7',
            writeModeEnabled
              ? 'border-amber-600/30 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-950/80'
              : 'text-muted-foreground',
            className,
          )}
          title={writeModeEnabled ? 'Write mode enabled' : 'Read-only mode'}
        >
          {writeModeEnabled ? <ShieldAlert size={13} /> : <Shield size={13} />}
          {showLabel && <span>{writeModeEnabled ? 'Write mode' : 'Read-only'}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="text-xs">
          {writeModeEnabled ? 'Write enabled' : 'Read-only mode'}
        </DropdownMenuLabel>
        <div className="px-2 pb-1 text-xs text-muted-foreground leading-relaxed">
          {writeModeEnabled
            ? 'Write actions are enabled for this browser tab and will survive refreshes.'
            : 'Write actions are locked by default. Enable them for this browser tab when you need to make changes.'}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setWriteModeEnabled(!writeModeEnabled)}>
          {writeModeEnabled ? <Shield size={14} /> : <ShieldAlert size={14} />}
          {writeModeEnabled ? 'Disable write mode' : 'Enable write mode'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WriteModeBanner({
  className,
  description = 'Create, delete, reset, and save controls are available after write mode is enabled.',
}: WriteModeBannerProps) {
  const writeModeEnabled = useAppStore((s) => s.writeModeEnabled)
  const setWriteModeEnabled = useAppStore((s) => s.setWriteModeEnabled)

  if (writeModeEnabled) return null

  return (
    <div
      className={cn(
        'mb-3 flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
        <Shield size={14} className="shrink-0" />
        <span className="font-medium text-foreground">Read-only</span>
        <span className="hidden sm:inline">·</span>
        <span className="min-w-0 truncate">{description}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => setWriteModeEnabled(true)}
      >
        <ShieldAlert size={14} />
        Enable
      </Button>
    </div>
  )
}

export function WriteModeGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const writeModeEnabled = useAppStore((s) => s.writeModeEnabled)
  if (!writeModeEnabled) return <>{fallback}</>
  return <>{children}</>
}
