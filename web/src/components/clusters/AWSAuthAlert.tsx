// Inline banner — shown when AWS SSO session is expired for the active cluster.

import { AlertTriangle, Copy } from 'lucide-react'
import { useClusterSession } from '../../hooks/useCluster'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AWSAuthAlertProps {
  clusterId: string
  awsProfile: string
}

export function AWSAuthAlert({ clusterId, awsProfile }: AWSAuthAlertProps) {
  const { data: session, refetch, isFetching } = useClusterSession(clusterId)

  if (!session || session.valid) return null

  const cmd = `aws sso login --profile ${awsProfile}`

  return (
    <Alert className="mx-6 mt-4 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex items-start justify-between gap-3">
        <div>
          <p className="text-amber-700 dark:text-amber-300 text-sm">
            AWS SSO session expired for profile <code className="font-mono">{awsProfile}</code>
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Run: <code className="font-mono text-foreground">{cmd}</code>
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(cmd)} className="h-7 gap-1">
            <Copy size={12} /> Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7"
          >
            {isFetching ? 'Checking…' : 'Retry'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
