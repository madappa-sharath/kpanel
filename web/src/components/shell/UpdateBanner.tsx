import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowUpCircle, Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data } = useQuery({
    queryKey: queryKeys.version.info(),
    queryFn: api.version.get,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchInterval: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  if (!data?.updateAvailable || dismissed) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(data.installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border-b border-border bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 flex items-center gap-3 text-sm shrink-0">
      <ArrowUpCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />

      <span className="text-amber-900 dark:text-amber-200 font-medium">
        kpanel {data.latest} available
      </span>
      <span className="text-amber-700 dark:text-amber-400 text-xs">
        (you have {data.current})
      </span>

      {data.latestReleaseURL && (
        <a
          href={data.releasesURL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 flex items-center gap-1 text-xs underline underline-offset-2"
        >
          Release notes
          <ExternalLink className="size-3" />
        </a>
      )}

      <div className="ml-auto flex items-center gap-2">
        <code className="text-xs font-mono bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
          {data.installCmd}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
          onClick={handleCopy}
          title="Copy install command"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
