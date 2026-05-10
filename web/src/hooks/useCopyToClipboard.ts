import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_KEY = '__default__'

export function useCopyToClipboard(timeout = 1500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const copy = useCallback(async (text: string, key: string = DEFAULT_KEY) => {
    try {
      await navigator.clipboard.writeText(text)
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopiedKey(key)
      timerRef.current = setTimeout(() => setCopiedKey(null), timeout)
    } catch {
      // clipboard API may be unavailable in insecure contexts; fail silently
    }
  }, [timeout])

  const isCopied = useCallback(
    (key: string = DEFAULT_KEY) => copiedKey === key,
    [copiedKey],
  )

  return { copy, isCopied, copiedKey }
}
