import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Cloud, Copy, RefreshCw } from 'lucide-react'
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
  // null = user hasn't typed yet, use AWS-resolved region; string = user override
  const [regionOverride, setRegionOverride] = useState<string | null>(null)
  // null = use env-derived AWS_PROFILE; string = user picked from dropdown
  const [profileOverride, setProfileOverride] = useState<string | null>(null)
  const [profilePickerOpen, setProfilePickerOpen] = useState(false)
  const [accessMode, setAccessMode] = useState<Record<string, 'private' | 'public'>>({})
  const [importError, setImportError] = useState<string | null>(null)
  const { copy, isCopied } = useCopyToClipboard()
  const queryClient = useQueryClient()

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

  function handleProfileChange(profile: string) {
    setProfileOverride(profile)
    setProfilePickerOpen(false)
    // Reset region override so the new profile's home region takes effect.
    setRegionOverride(null)
    setImportError(null)
    // Drop every cached discovery, not just this profile's. The key is scoped by
    // profile and region, so a stale entry would otherwise reappear verbatim when
    // the user switches back, hiding clusters added or removed in the meantime.
    queryClient.removeQueries({ queryKey: ['msk', 'clusters'] })
  }

  function getAccess(arn: string) {
    return accessMode[arn] ?? 'private'
  }

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
            aria-label="AWS profile"
            className={cn(
              'font-mono justify-between gap-1.5',
              compact ? 'h-6 px-1.5 text-xs' : 'h-7 w-36 text-xs',
            )}
            onClick={(e) => e.stopPropagation()}
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
      <div className="rounded-md border border-border bg-card px-4 py-2.5 flex items-center gap-2" aria-hidden="true">
        <Skeleton className="size-3.5 rounded-full flex-shrink-0" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="ml-auto h-3 w-28" />
      </div>
    )
  }

  // No AWS on this machine at all, or the context request failed outright and
  // there are no profiles to switch to.
  if (!ctx || (!ctx.valid && !ctx.recovery && profiles.length === 0)) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS MSK</span>
        <span className="text-xs text-muted-foreground/60">No AWS credentials on this machine</span>
        <div className="ml-auto">
          <RecheckButton isChecking={isChecking} onRecheck={() => recheck()} />
        </div>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-2.5 flex items-center gap-2">
        <Cloud size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">AWS MSK</span>
        <ProfileSelector compact />
        <span className="text-xs text-muted-foreground/60 truncate">
          {ctx.valid ? ctx.account : 'credentials inactive'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-xs"
          onClick={() => setExpanded(true)}
        >
          Discover clusters
        </Button>
      </div>
    )
  }

  const canDiscover = ctx.valid && !!region && !isDiscovering

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            AWS MSK
          </h2>
          <div className="flex items-center gap-1">
            <RecheckButton isChecking={isChecking} onRecheck={() => recheck()} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              Collapse
            </Button>
          </div>
        </div>

        {/* Disabled rather than hidden, so the controls keep their position
            across every credential state. */}
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Profile">
            <ProfileSelector />
          </Field>
          <Field label="Region">
            <Input
              value={region}
              onChange={(e) => setRegionOverride(e.target.value)}
              placeholder="us-east-1"
              disabled={!ctx.valid}
              className="h-7 w-32 font-mono text-xs"
              aria-label="AWS region"
            />
          </Field>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => discover()}
            disabled={!canDiscover}
          >
            {isDiscovering
              ? <><RefreshCw size={12} className="animate-spin" /> Discovering…</>
              : 'Discover'}
          </Button>
        </div>

        {ctx.valid ? (
          <p className="text-xs text-muted-foreground">
            Account <span className="font-mono text-foreground">{ctx.account}</span>
            {' · lists clusters this profile can see in the region above'}
          </p>
        ) : ctx.recovery ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 flex-wrap">
            <span>
              Session expired for <span className="font-mono">{ctx.profile}</span> — run
            </span>
            <code className="font-mono text-foreground bg-muted rounded px-1 py-0.5">
              {ctx.recovery}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(ctx.recovery!)}
              className="h-5 gap-1 px-1 text-xs"
            >
              {isCopied() ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </Button>
          </p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No valid credentials for <span className="font-mono">{ctx.profile}</span>
            {profiles.length > 0 && ' — pick another profile above'}
          </p>
        )}

        {hasDiscovered && !isDiscovering && mskClusters?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No MSK clusters in <span className="font-mono">{region}</span> for this profile.
          </p>
        )}

        {importError && <p className="text-xs text-destructive">{importError}</p>}
      </div>

      {mskClusters && mskClusters.length > 0 && (
        <div className="border-t border-border">
          {mskClusters.map((c) => {
            const hasPublic = c.publicBrokers && c.publicBrokers.length > 0
            const access = getAccess(c.arn)
            const isThisImporting = isImporting && importingArgs?.arn === c.arn
            const brokerCount = access === 'public' ? c.publicBrokers.length : c.brokers.length

            return (
              <div key={c.arn} className="px-4 py-3 border-b last:border-b-0 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
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

                {hasPublic && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Connect via</span>
                    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 gap-0.5">
                      {([
                        { mode: 'private', label: 'VPC' },
                        { mode: 'public', label: 'Public' },
                      ] as const).map(({ mode, label }) => (
                        <Button
                          key={mode}
                          variant="ghost"
                          size="sm"
                          aria-pressed={access === mode}
                          onClick={() => setAccessMode((s) => ({ ...s, [c.arn]: mode }))}
                          className={cn(
                            'h-6 px-3 text-xs font-medium rounded',
                            access === mode
                              ? 'bg-background text-foreground shadow-sm hover:bg-background'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </Button>
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
  )
}

function RecheckButton({ isChecking, onRecheck }: { isChecking: boolean; onRecheck: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={onRecheck}
      disabled={isChecking}
    >
      <RefreshCw size={10} className={isChecking ? 'animate-spin' : ''} />
      {isChecking ? 'Checking…' : 'Recheck'}
    </Button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}
