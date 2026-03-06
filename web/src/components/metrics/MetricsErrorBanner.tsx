import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, XCircle } from 'lucide-react'

function isPermissionError(msg: string): boolean {
  return (
    msg.includes('AccessDeniedException') ||
    msg.includes('not authorized') ||
    msg.includes('AccessDenied')
  )
}

interface MetricsErrorBannerProps {
  error: Error | null | undefined
}

export function MetricsErrorBanner({ error }: MetricsErrorBannerProps) {
  if (!error) return null

  const msg = error.message
  const permission = isPermissionError(msg)
  const displayMsg = msg.startsWith('cloudwatch: ') ? msg.slice('cloudwatch: '.length) : msg

  if (permission) {
    return (
      <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-500/30 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>CloudWatch access denied</AlertTitle>
        <AlertDescription>
          The AWS profile for this cluster doesn&apos;t have{' '}
          <code className="font-mono text-xs">cloudwatch:GetMetricData</code> permission. Ask your
          admin to grant it on resource <code className="font-mono text-xs">*</code> for the{' '}
          <code className="font-mono text-xs">AWS/Kafka</code> namespace.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <XCircle className="h-4 w-4" />
      <AlertTitle>CloudWatch error</AlertTitle>
      <AlertDescription>{displayMsg}</AlertDescription>
    </Alert>
  )
}
