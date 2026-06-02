// Inline banner — shown when AWS SSO session is expired for the active cluster.

import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useClusterSession } from '../../hooks/useCluster'
import { useCopyToClipboard } from '#/hooks/useCopyToClipboard'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'

interface AWSAuthAlertProps {
  clusterId: string
  awsProfile: string
}

export function AWSAuthAlert({ clusterId, awsProfile }: AWSAuthAlertProps) {
  const { data: session, refetch, isFetching } = useClusterSession(clusterId)
  const { copy, isCopied } = useCopyToClipboard()

  if (!session || session.valid) return null

  const cmd = `aws sso login --profile ${awsProfile}`

  return (
    <div className="px-6 pt-4">
      <Alert className="min-w-0 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-amber-700 dark:text-amber-300 text-sm">
              AWS SSO session expired for profile <code className="font-mono">{awsProfile}</code>
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Run: <code className="break-all font-mono text-foreground">{cmd}</code>
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => copy(cmd)} className="h-7 gap-1">
              {isCopied() ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
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
    </div>
  )
}
