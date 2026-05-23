// AWS context card — shows active profile, credential status, and MSK discovery.

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, ChevronsUpDown, Cloud, Copy, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { cn } from '../../lib/utils'
import { useCopyToClipboard } from '#/hooks/useCopyToClipboard'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'

interface AWSContextCardProps {
  defaultExpanded?: boolean
}

export function AWSContextCard({ defaultExpanded = false }: AWSContextCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [guideActive, setGuideActive] = useState(false)
  const [guideStep, setGuideStep] = useState(1)
  const [hasSeenGuide, setHasSeenGuide] = useState(true)
  // null = user hasn't typed yet, use AWS-resolved region; string = user override
  const [regionOverride, setRegionOverride] = useState<string | null>(null)
  // null = use env-derived AWS_PROFILE; string = user picked from dropdown
  const [profileOverride, setProfileOverride] = useState<string | null>(null)
  const [profilePickerOpen, setProfilePickerOpen] = useState(false)
  const { copy, isCopied } = useCopyToClipboard()
  const queryClient = useQueryClient()
  const guideStorageKey = 'kpanel.aws-discovery-guide-seen'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = window.localStorage.getItem(guideStorageKey) === '1'
    setHasSeenGuide(seen)
  }, [])

  function handleExpand() {
    setExpanded(true)
    if (!hasSeenGuide) {
      setGuideActive(true)
      setGuideStep(1)
    }
  }

  function finishGuide() {
    setGuideActive(false)
    setHasSeenGuide(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(guideStorageKey, '1')
    }
  }

  function dismissGuide() {
    setGuideActive(false)
  }

  // Profiles defined in ~/.aws/config — empty when the file doesn't exist.
  const { data: profilesData } = useQuery({
    queryKey: queryKeys.aws.profiles(),
    queryFn: () => api.aws.profiles(),
    retry: false,
    staleTime: Infinity,
  })
  const profiles = profilesData?.profiles ?? []

  const { data: ctx, isLoading, isFetching: isChecking, refetch: recheck } = useQuery({
    queryKey: queryKeys.aws.context(profileOverride ?? undefined),
    queryFn: () => api.aws.context(profileOverride ?? undefined),
    retry: false,
    staleTime: 60_000,
  })

  // Derive region: user override takes precedence, otherwise use AWS-resolved value.
  // The resolved region also follows the picked profile (server returns the profile's region).
  const region = regionOverride ?? ctx?.region ?? ''
  const effectiveProfile = profileOverride ?? undefined

  const {
    data: mskClusters,
    isFetching: isDiscovering,
    refetch: discover,
    isFetched: hasDiscovered,
  } = useQuery({
    queryKey: queryKeys.msk.clusters(region, effectiveProfile),
    queryFn: () => api.msk.discover(region, effectiveProfile),
    enabled: false,
    retry: false,
  })

  function handleProfileChange(profile: string) {
    setProfileOverride(profile)
    setProfilePickerOpen(false)
    // Reset region override so the new profile's home region takes effect.
    setRegionOverride(null)
    // Clear any prior discovery results — they belong to the previous profile.
    queryClient.removeQueries({ queryKey: ['msk', 'clusters'] })
    if (guideActive && guideStep === 1) setGuideStep(2)
  }

  // Per-cluster access mode selection: 'private' | 'public'
  const [accessMode, setAccessMode] = useState<Record<string, 'private' | 'public'>>({})
  function getAccess(arn: string) { return accessMode[arn] ?? 'private' }

  const [importError, setImportError] = useState<string | null>(null)

  const { mutate: importCluster, isPending: isImporting, variables: importingArgs } = useMutation({
    mutationFn: ({ arn, access }: { arn: string; access: 'private' | 'public' }) =>
      api.msk.import(arn, access, effectiveProfile),
    onSuccess: () => {
      setImportError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() })
    },
    onError: (err: Error) => {
      setImportError(err.message)
    },
  })

  // Renders the profile selector. When ~/.aws/config has no profiles to choose
  // from, falls back to a static badge so users still see what they're using.
  function ProfileSelector({ compact = false }: { compact?: boolean }) {
    const current = ctx?.profile ?? '—'
    if (profiles.length === 0) {
      return (
        <Badge variant="outline" className={cn('font-mono', compact ? 'text-xs px-1.5 py-0' : 'text-xs')}>
          {current}
        </Badge>
      )
    }
    return (
      <Popover open={profilePickerOpen} onOpenChange={setProfilePickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={profilePickerOpen}
            className={cn(
              'font-mono justify-between gap-1.5',
              compact ? 'h-6 px-1.5 text-xs' : 'h-7 text-xs',
            )}
            onClick={(e) => {
              // In compact (collapsed) view we don't want the click to bubble
              // to "Discover clusters" expand button; nothing else relies on
              // it but be defensive.
              e.stopPropagation()
            }}
          >
            <span className="truncate">{current}</span>
            <ChevronsUpDown className="opacity-50 flex-shrink-0" size={11} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search profile…" className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No matching profile.</CommandEmpty>
              <CommandGroup>
                {profiles.map((p) => (
                  <CommandItem
                    key={p}
                    value={p}
                    onSelect={() => handleProfileChange(p)}
                    className="font-mono text-xs"
                  >
                    <Check
                      size={12}
                      className={cn('mr-2', current === p ? 'opacity-100' : 'opacity-0')}
                    />
                    {p}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-md border bg-card px-4 py-2.5 flex items-center gap-2" aria-hidden="true">
        <Skeleton className="size-3.5 rounded-full flex-shrink-0" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="ml-auto h-3 w-28" />
      </div>
    )
  }

  // Fall back to a minimal stub when the context request totally failed (server
  // down) or when there are no creds AND no profiles to pick from. When the
  // user has profiles defined in ~/.aws/config we want the picker to be
  // reachable even from a broken default — e.g. env points at "default" but
  // config only has named profiles like "msk"/"cloudflare".
  if (!ctx || (!ctx.valid && !ctx.recovery && profiles.length === 0)) {
    return (
      <div className="rounded-md border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS MSK helper (optional)</span>
        <span className="text-xs text-muted-foreground/60">No AWS credentials detected on this machine</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1.5 text-xs"
          onClick={() => recheck()}
          disabled={isChecking}
        >
          {isChecking
            ? <><RefreshCw size={11} className="animate-spin" /> Checking…</>
            : <><RefreshCw size={11} /> Recheck</>
          }
        </Button>
      </div>
    )
  }

  // Collapsed compact row
  if (!expanded) {
    return (
      <div className="rounded-md border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS MSK helper (optional)</span>
        <ProfileSelector compact />
        {ctx.account && (
          <span className="text-xs text-muted-foreground/60">{ctx.account}</span>
        )}
        <button
          onClick={handleExpand}
          className="ml-auto text-xs text-amber-600 hover:text-amber-500 flex items-center gap-0.5 transition-colors"
        >
          {ctx.valid ? 'Discover MSK clusters' : 'Select profile'} <ChevronRight size={12} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AWS MSK (Optional)</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground/60 hover:text-muted-foreground"
            onClick={() => recheck()}
            disabled={isChecking}
          >
            <RefreshCw size={10} className={isChecking ? 'animate-spin' : ''} />
            {isChecking ? 'Checking…' : 'Recheck'}
          </Button>
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            collapse
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Uses your current AWS profile and region on this machine. It does not scan all AWS accounts automatically.
      </p>

      {guideActive && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/30 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground mb-1">Guided setup ({guideStep}/3)</p>
          {guideStep === 1 && <p className="text-xs text-muted-foreground">Choose the AWS profile that can access your MSK cluster.</p>}
          {guideStep === 2 && <p className="text-xs text-muted-foreground">Confirm the region where your cluster is running.</p>}
          {guideStep === 3 && <p className="text-xs text-muted-foreground">Click Discover to list clusters visible to this profile, then import one.</p>}
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={dismissGuide}>Skip</Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={guideStep === 1}
              onClick={() => setGuideStep((s) => Math.max(1, s - 1))}
            >
              Back
            </Button>
            {guideStep < 3 ? (
              <Button size="sm" className="h-7 text-xs" onClick={() => setGuideStep((s) => Math.min(3, s + 1))}>
                Next
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={finishGuide}>
                Done
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Invalid session, no SSO recovery — most common cause is the
          env-derived profile not existing in ~/.aws/config. Make the next step
          obvious: pick one of the available profiles. */}
      {!ctx.valid && !ctx.recovery && profiles.length > 0 && (
        <div className={cn('mb-3 rounded-md border border-dashed bg-muted/30 px-3 py-3 space-y-2', guideActive && guideStep === 1 && 'border-amber-500/60 ring-1 ring-amber-500/40')}>
          <div className="flex items-start gap-2">
            <Cloud size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                Select an AWS profile to discover MSK clusters
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profiles.length === 1
                  ? `Found 1 profile in ~/.aws/config.`
                  : `Found ${profiles.length} profiles in ~/.aws/config.`}{' '}
                Pick one to check credentials and list clusters visible to that profile.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pl-6">
            <span className="text-xs text-muted-foreground">Profile:</span>
            <ProfileSelector />
            <ChevronRight size={12} className="text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60">
              region and Discover appear after a valid profile is picked
            </span>
          </div>
        </div>
      )}

      {/* SSO-expired / recoverable invalid session — show profile picker so
          users can switch out of the broken profile if they want. */}
      {!ctx.valid && ctx.recovery && profiles.length > 0 && (
        <div className={cn('flex items-center gap-2 mb-3 flex-wrap', guideActive && guideStep === 1 && 'rounded-md border border-amber-500/60 bg-amber-50/30 dark:bg-amber-950/20 px-2 py-2')}>
          <span className="text-xs text-muted-foreground">Profile:</span>
          <ProfileSelector />
        </div>
      )}

      {/* Expired / invalid session warning */}
      {!ctx.valid && ctx.recovery && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                AWS session expired for profile{' '}
                <code className="font-mono">{ctx.profile}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run:{' '}
                <code className="font-mono text-foreground">{ctx.recovery}</code>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(ctx.recovery!)}
                className="h-6 gap-1 mt-1 px-0 text-xs"
              >
                {isCopied()
                  ? <><Check size={11} /> Copied</>
                  : <><Copy size={11} /> Copy command</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Valid session info + region picker + discover button */}
      {ctx.valid && (
        <div className="mb-3 space-y-2">
          <div className={cn('flex items-center gap-2 flex-wrap', guideActive && guideStep === 1 && 'rounded-md border border-amber-500/60 bg-amber-50/30 dark:bg-amber-950/20 px-2 py-2')}>
            <ProfileSelector />
            {ctx.account && (
              <span className="text-xs text-muted-foreground">{ctx.account}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={region}
              onChange={(e) => {
                setRegionOverride(e.target.value)
                if (guideActive && guideStep === 2) setGuideStep(3)
              }}
              placeholder="us-east-1"
              className={cn('h-7 w-36 font-mono text-xs', guideActive && guideStep === 2 && 'border-amber-500/60 ring-1 ring-amber-500/40')}
              aria-label="AWS region"
            />
            <Button
              variant="outline"
              size="sm"
              className={cn('h-7 gap-1.5', guideActive && guideStep === 3 && 'border-amber-500/60 ring-1 ring-amber-500/40')}
              onClick={() => {
                if (guideActive && guideStep < 3) setGuideStep(3)
                discover()
              }}
              disabled={isDiscovering || !region}
            >
              {isDiscovering
                ? <><RefreshCw size={12} className="animate-spin" /> Discovering…</>
                : 'Discover in region'
              }
            </Button>
          </div>
        </div>
      )}

      {/* Discovery results */}
      {hasDiscovered && !isDiscovering && mskClusters && mskClusters.length === 0 && (
        <p className="text-sm text-muted-foreground">No MSK clusters found for this profile in {region}.</p>
      )}

      {importError && (
        <p className="text-xs text-destructive mb-3">{importError}</p>
      )}

        {mskClusters && mskClusters.length > 0 && (
          <div className="-mx-4 -mb-4 border-t">
            {mskClusters.map((c) => {
            const hasPublic = c.publicBrokers && c.publicBrokers.length > 0
            const access = getAccess(c.arn)
            const isThisImporting = isImporting && importingArgs?.arn === c.arn
            const brokerCount = access === 'public' ? c.publicBrokers.length : c.brokers.length

            return (
              <div key={c.arn} className="px-4 py-3 border-b last:border-b-0 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.region} · {brokerCount} broker{brokerCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">{c.state}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-shrink-0"
                    disabled={isThisImporting}
                    onClick={() => importCluster({ arn: c.arn, access })}
                  >
                    {isThisImporting ? 'Importing…' : 'Import'}
                  </Button>
                </div>

                {/* Access mode selector — only shown when public brokers are available */}
                {hasPublic && (
                  <div className="flex items-center gap-2 ml-0.5">
                    <span className="text-xs text-muted-foreground">Connect via:</span>
                    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 gap-0.5">
                      {([
                        { mode: 'private', label: 'VPC (private)' },
                        { mode: 'public',  label: 'Public access' },
                      ] as const).map(({ mode, label }) => (
                        <button
                          key={mode}
                          onClick={() => setAccessMode((s) => ({ ...s, [c.arn]: mode }))}
                          className={`text-xs px-3 py-1 rounded transition-all cursor-pointer select-none font-medium ${
                            access === mode
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-sm ring-1 ring-amber-500/30'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
            })}
          </div>
        )}
      </div>

    </>
  )
}
