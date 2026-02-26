// Add Cluster wizard — 3-step: Platform → Connection → Auth

import { useState } from 'react'
import { ArrowRight, AlertCircle } from 'lucide-react'
import type { Platform, AuthMechanism, AddClusterRequest } from '../../types/cluster'
import { useAddCluster } from '../../hooks/useClusterConnection'
import { slugify } from '../../lib/utils'

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

const LABEL_STYLE: React.CSSProperties = {
  display:       'block',
  fontSize:      12,
  fontFamily:    'var(--k-font)',
  color:         'var(--k-muted)',
  marginBottom:  6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontFamily: 'var(--k-font)',
                background: step === s
                  ? 'var(--k-amber)'
                  : STEPS.indexOf(step) > i
                  ? 'var(--k-green-dim)'
                  : 'var(--k-surface-3)',
                color: step === s ? '#000' : 'var(--k-muted)',
                border: '1px solid',
                borderColor: step === s ? 'var(--k-amber)' : 'var(--k-border-2)',
              }}
            >
              {i + 1}
            </div>
            <span style={{ fontSize: 13, color: step === s ? 'var(--k-text)' : 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>
              {s}
            </span>
            {i < 2 && <span style={{ color: 'var(--k-border-3)', fontSize: 13 }}>—</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Platform */}
      {step === 'platform' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              { value: 'generic',   label: 'Generic Kafka',   sub: 'Self-hosted, Redpanda, Aiven, or any Kafka-compatible broker' },
              { value: 'aws',       label: 'AWS MSK',         sub: 'IAM auth + CloudWatch metrics + auto-discovery' },
              { value: 'confluent', label: 'Confluent Cloud', sub: 'Confluent-managed Kafka with API key auth' },
            ] as { value: Platform; label: string; sub: string }[]).map(({ value, label, sub }) => (
              <label
                key={value}
                style={{
                  display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 6,
                  border: '1px solid',
                  borderColor: form.platform === value ? 'var(--k-amber-border)' : 'var(--k-border-2)',
                  background:  form.platform === value ? 'var(--k-amber-dim)'    : 'var(--k-surface-3)',
                  cursor: 'pointer', transition: 'all 120ms ease',
                }}
              >
                <input
                  type="radio"
                  name="platform"
                  value={value}
                  checked={form.platform === value}
                  onChange={() => patch({ platform: value })}
                  style={{ accentColor: 'var(--k-amber)', marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--k-text)', fontFamily: 'var(--k-font)', marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>
                    {sub}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="k-btn k-btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="k-btn k-btn-primary" onClick={() => setStep('connection')}>
              Next <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Connection */}
      {step === 'connection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LABEL_STYLE}>Name</label>
            <input
              className="k-input"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="production-msk"
              autoFocus
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Broker addresses</label>
            <input
              className="k-input"
              value={form.brokers}
              onChange={(e) => patch({ brokers: e.target.value })}
              placeholder="broker-1:9092, broker-2:9092"
            />
            <p style={{ marginTop: 5, fontSize: 12, color: 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>
              comma-separated host:port pairs
            </p>
          </div>
          {form.name && (
            <p style={{ fontSize: 12, color: 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>
              id: <span style={{ color: 'var(--k-amber)' }}>{slugify(form.name)}</span>
              {' '}(generated once, never changes)
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="k-btn k-btn-ghost" onClick={() => setStep('platform')}>← Back</button>
            <button
              className="k-btn k-btn-primary"
              onClick={() => setStep('auth')}
              disabled={!form.name || !form.brokers}
            >
              Next <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Auth */}
      {step === 'auth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {form.platform === 'aws' ? (
            <>
              <div>
                <label style={LABEL_STYLE}>AWS Profile</label>
                <input className="k-input" value={form.awsProfile} onChange={(e) => patch({ awsProfile: e.target.value })} />
              </div>
              <div>
                <label style={LABEL_STYLE}>AWS Region</label>
                <input className="k-input" value={form.awsRegion} onChange={(e) => patch({ awsRegion: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={LABEL_STYLE}>Auth mechanism</label>
                <select className="k-input" value={form.mechanism} onChange={(e) => patch({ mechanism: e.target.value as AuthMechanism })}>
                  <option value="none">None</option>
                  <option value="sasl_plain">SASL PLAIN</option>
                  <option value="sasl_scram_sha256">SASL SCRAM-SHA-256</option>
                  <option value="sasl_scram_sha512">SASL SCRAM-SHA-512</option>
                </select>
              </div>
              {form.mechanism !== 'none' && (
                <>
                  <div>
                    <label style={LABEL_STYLE}>Username</label>
                    <input className="k-input" value={form.username} onChange={(e) => patch({ username: e.target.value })} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Password</label>
                    <input className="k-input" type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} />
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 4,
              background: 'var(--k-red-dim)', border: '1px solid rgba(217,82,82,0.2)',
              color: 'var(--k-red)', fontSize: 13, fontFamily: 'var(--k-font)',
            }}>
              <AlertCircle size={13} />
              {(error as Error).message}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="k-btn k-btn-ghost" onClick={() => setStep('connection')}>← Back</button>
            <button className="k-btn k-btn-primary" onClick={submit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save cluster'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
