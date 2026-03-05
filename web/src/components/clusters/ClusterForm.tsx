// Add Cluster wizard — 3-step: Platform → Connection → Auth

import { useState } from 'react'
import { ArrowRight, AlertCircle } from 'lucide-react'
import type { Platform, AuthMechanism, AddClusterRequest } from '../../types/cluster'
import { useAddCluster } from '../../hooks/useClusterConnection'
import { slugify } from '../../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Step = 'platform' | 'connection' | 'auth'

interface FormState {
  platform:   Platform
  name:       string
  brokers:    string
  mechanism:  AuthMechanism
  username:   string
  password:   string
  awsProfile: string
  awsRegion:  string
}

const INITIAL: FormState = {
  platform:   'generic',
  name:       '',
  brokers:    '',
  mechanism:  'none',
  username:   '',
  password:   '',
  awsProfile: 'default',
  awsRegion:  'us-east-1',
}

interface ClusterFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function ClusterForm({ onSuccess, onCancel }: ClusterFormProps) {
  const [step, setStep]   = useState<Step>('platform')
  const [form, setForm]   = useState<FormState>(INITIAL)
  const { mutate, isPending, error } = useAddCluster()

  function patch(u: Partial<FormState>) { setForm((s) => ({ ...s, ...u })) }

  function submit() {
    const body: AddClusterRequest = {
      name:     form.name,
      platform: form.platform,
      brokers:  form.brokers.split(',').map((b) => b.trim()).filter(Boolean),
      auth: {
        mechanism:   form.mechanism,
        username:    form.username  || undefined,
        password:    form.password  || undefined,
        aws_profile: form.platform === 'aws' ? form.awsProfile : undefined,
        aws_region:  form.platform === 'aws' ? form.awsRegion  : undefined,
      },
    }
    mutate(body, { onSuccess })
  }

  const STEPS: Step[] = ['platform', 'connection', 'auth']

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
            {i < 2 && <span className="text-muted-foreground/40 text-sm">—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Platform */}
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

      {/* Step 2: Connection */}
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

      {/* Step 3: Auth */}
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
                    <Input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} />
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
              {isPending ? 'Saving…' : 'Save cluster'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
