// Add Cluster wizard — 3-step (add): Platform → Connection → Auth
// Edit mode (cluster prop): flat single-page form with "Save and test"

import { useState } from 'react'
import { ArrowRight, AlertCircle, Check, CheckCircle2, XCircle, Loader2, Info } from 'lucide-react'
import type { Platform, AuthMechanism, AddClusterRequest, Cluster } from '../../types/cluster'
import { useAddCluster, useUpdateCluster } from '../../hooks/useClusterConnection'
import { api } from '../../lib/api'
import { slugify } from '../../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Step = 'platform' | 'connection' | 'auth'

interface FormState {
  platform:       Platform
  name:           string
  brokers:        string
  mechanism:      AuthMechanism
  username:       string
  password:       string
  awsProfile:     string
  awsRegion:      string
  awsClusterName: string
  tlsEnabled:     boolean
  tlsCaCert:      string  // PEM content of newly-uploaded cert; '' = keep existing
}

const INITIAL: FormState = {
  platform:       'generic',
  name:           '',
  brokers:        '',
  mechanism:      'none',
  username:       '',
  password:       '',
  awsProfile:     'default',
  awsRegion:      'us-east-1',
  awsClusterName: '',
  tlsEnabled:     false,
  tlsCaCert:      '',
}

interface ClusterFormProps {
  onSuccess: () => void
  onCancel:  () => void
  cluster?:  Cluster   // when present = edit mode
}

export function ClusterForm({ onSuccess, onCancel, cluster }: ClusterFormProps) {
  const isEdit = !!cluster

  function initialState(): FormState {
    if (!cluster) return INITIAL
    const awsCfg = cluster.platform === 'aws' ? cluster.platformConfig?.aws : undefined
    return {
      platform:       cluster.platform,
      name:           cluster.name,
      brokers:        cluster.brokers.join(', '),
      mechanism:      cluster.platform === 'aws' ? 'aws_iam' : (cluster.auth?.mechanism ?? 'none'),
      username:       '',
      password:       '',
      awsProfile:     awsCfg?.profile     ?? 'default',
      awsRegion:      awsCfg?.region      ?? 'us-east-1',
      awsClusterName: awsCfg?.clusterName ?? '',
      tlsEnabled:     cluster.tls?.enabled ?? false,
      tlsCaCert:      '', // never pre-fill cert content — server keeps existing if blank
    }
  }

  const existingCaCert = isEdit && cluster!.tls?.caCertPath

  const STEPS: Step[] = ['platform', 'connection', 'auth']

  const [step, setStep]   = useState<Step>('platform')
  const [form, setForm]   = useState<FormState>(initialState)
  const [saved, setSaved] = useState(false)

  type TestState =
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ok'; brokerCount: number; identity?: string }
    | { phase: 'error'; message: string }
  const [testState, setTestState] = useState<TestState>({ phase: 'idle' })

  const addMutation    = useAddCluster()
  const updateMutation = useUpdateCluster(cluster?.id ?? '')
  const { mutate, isPending, error } = isEdit ? updateMutation : addMutation

  function patch(u: Partial<FormState>) { setForm((s) => ({ ...s, ...u })) }

  function submit() {
    const body: AddClusterRequest = {
      name:     form.name,
      platform: form.platform,
      brokers:  form.brokers.split(/[,\n]/).map((b) => b.trim()).filter(Boolean),
      auth: {
        mechanism:      form.platform === 'aws' ? 'aws_iam' : form.mechanism,
        username:       form.username  || undefined,
        password:       form.password  || undefined,
        awsProfile:     form.platform === 'aws' ? form.awsProfile                    : undefined,
        awsRegion:      form.platform === 'aws' ? form.awsRegion                     : undefined,
        awsClusterName: form.platform === 'aws' ? (form.awsClusterName || undefined) : undefined,
      },
      tls: form.tlsEnabled
        ? { enabled: true, caCert: form.tlsCaCert || undefined }
        : { enabled: false },
    }

    if (isEdit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mutate as any)(body, {
        onSuccess: async () => {
          setSaved(true)
          setTestState({ phase: 'loading' })
          try {
            const status = await api.connections.status(cluster!.id)
            setSaved(false)
            if (status.connected) {
              setTestState({ phase: 'ok', brokerCount: status.brokerCount ?? 0, identity: status.identity })
            } else {
              setTestState({ phase: 'error', message: status.error ?? 'Could not connect' })
            }
          } catch (e) {
            setSaved(false)
            setTestState({ phase: 'error', message: (e as Error).message })
          }
        },
      })
    } else {
      mutate(body as Parameters<typeof mutate>[0], { onSuccess })
    }
  }

  const platformLabel: Record<Platform, string> = {
    generic:   'Generic Kafka',
    aws:       'AWS MSK',
    confluent: 'Confluent Cloud',
  }

  // ── Edit mode: two side-by-side panels ─────────────────────────────────────
  if (isEdit) {
    const isBusy = isPending || testState.phase === 'loading'
    const lbl = 'text-xs text-muted-foreground uppercase tracking-wide block mb-1.5'

    return (
      <div className="space-y-4">

        {/* Meta row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Platform:</span>
          <Badge variant="outline">{platformLabel[form.platform]}</Badge>
          <code className="text-xs text-muted-foreground ml-auto font-mono">{cluster!.id}</code>
        </div>

        {/* Two panels */}
        <div className="grid grid-cols-2 gap-4 items-start">

          {/* ── Left panel: Connection ── */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</p>

            <div>
              <label className={lbl}>Name</label>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>

            <div>
              <label className={lbl}>Broker addresses</label>
              <textarea
                value={form.brokers}
                onChange={(e) => patch({ brokers: e.target.value })}
                placeholder="broker-1:9092, broker-2:9092"
                rows={5}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background resize-y font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">comma or newline separated · spaces are trimmed</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  id="tls-toggle-edit"
                  type="checkbox"
                  checked={form.tlsEnabled}
                  onChange={(e) => patch({ tlsEnabled: e.target.checked })}
                  className="accent-amber-500"
                />
                <label htmlFor="tls-toggle-edit" className="text-sm cursor-pointer select-none">Enable TLS</label>
              </div>
              {form.tlsEnabled && (
                <div>
                  <label className={lbl}>
                    CA certificate <span className="normal-case text-muted-foreground/70">(optional)</span>
                  </label>
                  {existingCaCert && !form.tlsCaCert && (
                    <p className="text-xs text-muted-foreground mb-1.5">on file — upload a new .pem to replace</p>
                  )}
                  <Input
                    type="file"
                    accept=".pem,.crt,.cer"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) { patch({ tlsCaCert: '' }); return }
                      file.text().then((content) => patch({ tlsCaCert: content }))
                    }}
                    className="cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Right panel: Auth ── */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auth</p>

            {form.platform === 'aws' ? (
              <>
                <div>
                  <label className={lbl}>AWS Profile</label>
                  <Input value={form.awsProfile} onChange={(e) => patch({ awsProfile: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>AWS Region</label>
                  <Input value={form.awsRegion} onChange={(e) => patch({ awsRegion: e.target.value })} />
                </div>
                <div>
                  <label className={lbl}>
                    CloudWatch cluster name <span className="normal-case text-muted-foreground/70">(optional)</span>
                  </label>
                  <Input
                    value={form.awsClusterName}
                    onChange={(e) => patch({ awsClusterName: e.target.value })}
                    placeholder="my-msk-cluster"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required for CloudWatch metrics. Use the plain cluster name from the AWS console.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1.5 pt-2 border-t">
                  <p className="flex items-start gap-1.5">
                    <Info size={12} className="flex-shrink-0 mt-0.5" />
                    <span>MSK brokers come in two flavors depending on how your cluster is configured:</span>
                  </p>
                  <ul className="ml-[1.1rem] space-y-1">
                    <li><span className="text-foreground font-medium">VPC-only (default):</span> port <code className="font-mono">9098</code>, e.g. <code className="font-mono">b-1.cluster….kafka.us-east-1.amazonaws.com:9098</code></li>
                    <li><span className="text-foreground font-medium">Public access:</span> port <code className="font-mono">9198</code>, hostname includes <code className="font-mono">-public</code>, e.g. <code className="font-mono">b-1-public.cluster….amazonaws.com:9198</code></li>
                  </ul>
                  <p className="ml-[1.1rem]">Check <span className="italic">Networking → Public access</span> in the AWS console if unsure.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={lbl}>Auth mechanism</label>
                  <Select value={form.mechanism} onValueChange={(v) => patch({ mechanism: v as AuthMechanism })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="sasl_plain">SASL PLAIN</SelectItem>
                      <SelectItem value="sasl_scram_sha256">SASL SCRAM-SHA-256</SelectItem>
                      <SelectItem value="sasl_scram_sha512">SASL SCRAM-SHA-512</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.mechanism !== 'none' && (
                  <>
                    <div>
                      <label className={lbl}>Username</label>
                      <Input value={form.username} onChange={(e) => patch({ username: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Password</label>
                      <Input
                        type="password"
                        value={form.password}
                        onChange={(e) => patch({ password: e.target.value })}
                        placeholder="leave blank to keep existing"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer: error / test result / actions */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle size={13} />
                {(error as Error).message}
              </div>
            )}
            {testState.phase === 'ok' && (
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-green-600 dark:text-green-400">
                  Connected · {testState.brokerCount} broker{testState.brokerCount !== 1 ? 's' : ''}
                  {testState.identity && (
                    <span className="block text-xs text-muted-foreground font-mono mt-0.5">{testState.identity}</span>
                  )}
                </span>
              </div>
            )}
            {testState.phase === 'error' && (
              <div className="flex items-start gap-2 text-sm">
                <XCircle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-destructive">{testState.message}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={submit} disabled={isBusy || !form.name || !form.brokers}>
              {isPending
                ? 'Saving…'
                : testState.phase === 'loading'
                ? <><Loader2 size={12} className="animate-spin mr-1" />Testing…</>
                : 'Save and test'
              }
            </Button>
          </div>
        </div>

      </div>
    )
  }

  // ── Add mode: 3-step wizard ──────────────────────────────────────────────────
  return (
    <div>
      {/* Step indicator */}
      <div className="flex gap-1.5 mb-5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border',
                step === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : STEPS.indexOf(step) > i
                  ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700'
                  : 'bg-muted text-muted-foreground border-border',
              )}
            >
              {i + 1}
            </div>
            <span className={cn('text-sm', step === s ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40 text-sm">—</span>}
          </div>
        ))}
      </div>

      {/* Step: Platform */}
      {step === 'platform' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {([
              { value: 'generic',   label: 'Generic Kafka',   sub: 'Self-hosted, Redpanda, Aiven, or any Kafka-compatible broker' },
              { value: 'aws',       label: 'AWS MSK',         sub: 'IAM auth + CloudWatch metrics + auto-discovery' },
              { value: 'confluent', label: 'Confluent Cloud', sub: 'Confluent-managed Kafka with API key auth' },
            ] as { value: Platform; label: string; sub: string }[]).map(({ value, label, sub }) => (
              <label
                key={value}
                className={cn(
                  'flex gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                  form.platform === value
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950 dark:border-amber-700'
                    : 'border-border bg-muted/30 hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="platform"
                  value={value}
                  checked={form.platform === value}
                  onChange={() => patch({ platform: value })}
                  className="mt-0.5 flex-shrink-0 accent-amber-500"
                />
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => setStep('connection')}>
              Next <ArrowRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Connection */}
      {step === 'connection' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Name</label>
            <Input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="production-msk"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Broker addresses</label>
            <Input
              value={form.brokers}
              onChange={(e) => patch({ brokers: e.target.value })}
              placeholder="broker-1:9092, broker-2:9092"
            />
            <p className="mt-1 text-xs text-muted-foreground">comma-separated host:port pairs</p>
          </div>

          {/* TLS */}
          <div className="flex items-center gap-2">
            <input
              id="tls-toggle"
              type="checkbox"
              checked={form.tlsEnabled}
              onChange={(e) => patch({ tlsEnabled: e.target.checked })}
              className="accent-amber-500"
            />
            <label htmlFor="tls-toggle" className="text-sm cursor-pointer select-none">Enable TLS</label>
          </div>
          {form.tlsEnabled && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
                CA certificate <span className="normal-case text-muted-foreground/70">(optional)</span>
              </label>
              <Input
                type="file"
                accept=".pem,.crt,.cer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) { patch({ tlsCaCert: '' }); return }
                  file.text().then((content) => patch({ tlsCaCert: content }))
                }}
                className="cursor-pointer"
              />
              {form.tlsCaCert && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  {Math.round(form.tlsCaCert.length / 1024 * 10) / 10} KB ready to upload
                </p>
              )}
            </div>
          )}

          {form.name && (
            <p className="text-xs text-muted-foreground">
              id: <span className="text-amber-600 font-mono">{slugify(form.name)}</span>
              {' '}(generated once, never changes)
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('platform')}>← Back</Button>
            <Button onClick={() => setStep('auth')} disabled={!form.name || !form.brokers}>
              Next <ArrowRight size={12} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Auth */}
      {step === 'auth' && (
        <div className="flex flex-col gap-3">
          {form.platform === 'aws' ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">AWS Profile</label>
                <Input value={form.awsProfile} onChange={(e) => patch({ awsProfile: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">AWS Region</label>
                <Input value={form.awsRegion} onChange={(e) => patch({ awsRegion: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">
                  CloudWatch cluster name <span className="normal-case text-muted-foreground/70">(optional)</span>
                </label>
                <Input
                  value={form.awsClusterName}
                  onChange={(e) => patch({ awsClusterName: e.target.value })}
                  placeholder="my-msk-cluster"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Required for CloudWatch metrics. Use the plain MSK cluster name from the AWS console.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Auth mechanism</label>
                <Select value={form.mechanism} onValueChange={(v) => patch({ mechanism: v as AuthMechanism })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="sasl_plain">SASL PLAIN</SelectItem>
                    <SelectItem value="sasl_scram_sha256">SASL SCRAM-SHA-256</SelectItem>
                    <SelectItem value="sasl_scram_sha512">SASL SCRAM-SHA-512</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.mechanism !== 'none' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Username</label>
                    <Input value={form.username} onChange={(e) => patch({ username: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Password</label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => patch({ password: e.target.value })}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle size={13} />
              {(error as Error).message}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('connection')}>← Back</Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? 'Saving…' : saved ? <><Check size={13} /> Saved!</> : 'Save cluster'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
