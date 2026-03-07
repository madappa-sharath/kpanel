import { useParams, Link } from '@tanstack/react-router'
import { Moon, Sun, Monitor, BarChart2 } from 'lucide-react'
import { useClusters, useConnectionStatus } from '../../hooks/useCluster'
import { useAppStore } from '../../stores/appStore'
import { ClusterSwitcher } from './ClusterSwitcher'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

type Theme = 'light' | 'dark' | 'system'

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system']

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'dark') return <Moon size={14} />
  if (theme === 'light') return <Sun size={14} />
  return <Monitor size={14} />
}

export function Header() {
  const params          = useParams({ strict: false }) as { clusterId?: string; topicName?: string; groupId?: string }
  const activeClusterId = useAppStore((s) => s.activeClusterId)
  const theme           = useAppStore((s) => s.theme)
  const setTheme        = useAppStore((s) => s.setTheme)
  const clusterId       = params.clusterId ?? activeClusterId
  const { data: clusters } = useClusters()
  const { data: status, isLoading } = useConnectionStatus(clusterId ?? '')

  const cluster = clusters?.find((c) => c.id === clusterId)

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  return (
    <header
      className="bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0"
      style={{ height: 'var(--header-h)' }}
    >
      {/* Cluster switcher */}
      <ClusterSwitcher />

      {/* Breadcrumb */}
      {cluster && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <span className="text-border">/</span>
          {params.topicName && (
            <>
              <Link
                to="/clusters/$clusterId/topics"
                params={{ clusterId: clusterId! }}
                className="text-muted-foreground no-underline hover:text-foreground transition-colors"
              >
                topics
              </Link>
              <span className="text-border">/</span>
              <span className="text-foreground">{params.topicName}</span>
            </>
          )}
          {params.groupId && (
            <>
              <Link
                to="/clusters/$clusterId/consumer-groups"
                params={{ clusterId: clusterId! }}
                className="text-muted-foreground no-underline hover:text-foreground transition-colors"
              >
                groups
              </Link>
              <span className="text-border">/</span>
              <span className="text-foreground">{params.groupId}</span>
            </>
          )}
        </div>
      )}

      {/* Metrics link — AWS MSK only */}
      {cluster?.platform === 'aws' && clusterId && (
        <Link
          to="/clusters/$clusterId/metrics"
          params={{ clusterId }}
          className="no-underline"
        >
          {({ isActive }) => (
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors',
              isActive
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
            )}>
              <BarChart2 size={13} />
              Metrics
            </div>
          )}
        </Link>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Connection status */}
      {clusterId && (
        <Badge
          variant="outline"
          title={status?.identity ?? undefined}
          className={cn(
            'gap-1.5 text-xs',
            (isLoading || status === undefined)
              ? 'text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950 dark:text-amber-400'
              : status.connected
              ? 'text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950 dark:text-green-400'
              : 'text-destructive border-destructive/30 bg-destructive/10',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              (isLoading || status === undefined)
                ? 'bg-amber-500 animate-pulse'
                : status.connected
                ? 'bg-green-500 animate-pulse'
                : 'bg-destructive',
            )}
          />
          {(isLoading || status === undefined)
            ? 'checking'
            : status.connected
            ? 'connected'
            : 'disconnected'}
        </Badge>
      )}

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={cycleTheme}
        title={`Theme: ${theme}`}
        className="h-7 w-7"
      >
        <ThemeIcon theme={theme} />
      </Button>
    </header>
  )
}
