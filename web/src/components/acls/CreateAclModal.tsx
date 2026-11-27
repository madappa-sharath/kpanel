import { useState } from 'react'
import { useCreateAcls } from '../../hooks/useAcls'
import {
  OPERATIONS,
  RESOURCE_TYPES,
  bindingKey,
  consumerBindings,
  normalizePrincipal,
  operationLabel,
  producerBindings,
  resourceTypeLabel,
} from '../../lib/acls'
import type { AclBinding, AclOperation, AclPatternType, AclPermission, AclResourceType } from '../../types/acl'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

type Mode = 'producer' | 'consumer' | 'custom'

interface CreateAclModalProps {
  clusterId: string
  /** Prefills the resource fields, e.g. when opened from a topic's ACL view. */
  initialTopic?: string
  initialGroup?: string
  onClose: () => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

export function CreateAclModal({ clusterId, initialTopic = '', initialGroup = '', onClose }: CreateAclModalProps) {
  const createAcls = useCreateAcls(clusterId)
  const [mode, setMode] = useState<Mode>(initialGroup && !initialTopic ? 'consumer' : 'producer')
  const [principal, setPrincipal] = useState('')
  const [host, setHost] = useState('*')
  const [pattern, setPattern] = useState<AclPatternType>('literal')
  const [topic, setTopic] = useState(initialTopic)
  const [group, setGroup] = useState(initialGroup)
  const [transactionalId, setTransactionalId] = useState('')
  const [resourceType, setResourceType] = useState<AclResourceType>(initialGroup && !initialTopic ? 'group' : 'topic')
  const [resourceName, setResourceName] = useState(initialTopic || initialGroup)
  const [operation, setOperation] = useState<AclOperation>('read')
  const [permission, setPermission] = useState<AclPermission>('allow')
  const [failed, setFailed] = useState<{ binding: AclBinding; error: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  const missing =
    !normalizePrincipal(principal) ? 'Principal is required'
    : mode === 'producer' && !topic.trim() ? 'Topic is required'
    : mode === 'consumer' && (!topic.trim() || !group.trim()) ? 'Topic and group are required'
    : mode === 'custom' && resourceType !== 'cluster' && !resourceName.trim() ? 'Resource name is required'
    : null

  const bindings: AclBinding[] = missing ? [] :
    mode === 'producer' ? producerBindings({ principal, host, pattern, topic, transactionalId })
    : mode === 'consumer' ? consumerBindings({ principal, host, pattern, topic, group })
    : [{
        principal: normalizePrincipal(principal),
        host: host.trim() || '*',
        resource_type: resourceType,
        resource_name: resourceType === 'cluster' ? 'kafka-cluster' : resourceName.trim(),
        pattern_type: resourceType === 'cluster' ? 'literal' : pattern,
        operation,
        permission,
      }]

  async function handleSubmit() {
    if (missing) {
      setError(missing)
      return
    }
    setError(null)
    setFailed([])
    try {
      const { results } = await createAcls.mutateAsync(bindings)
      const errors = results.filter((r) => r.error).map((r) => ({ binding: r, error: r.error! }))
      if (errors.length === 0) {
        onClose()
        return
      }
      setFailed(errors)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const patternSelect = (
    <Select value={pattern} onValueChange={(v) => setPattern(v as AclPatternType)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="literal">Exact name</SelectItem>
        <SelectItem value="prefixed">Name prefix</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create ACLs</DialogTitle>
          <DialogDescription>
            Presets expand into the bindings a client needs for existing topics and groups. Review them before creating.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="producer" className="flex-1">Producer</TabsTrigger>
              <TabsTrigger value="consumer" className="flex-1">Consumer</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Principal" hint='A bare name becomes "User:<name>".'>
              <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="User:alice" autoFocus />
            </Field>
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="*" />
            </Field>
          </div>

          {mode === 'producer' && (
            <>
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <Field label="Topic">
                  <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="orders" />
                </Field>
                <Field label="Match">{patternSelect}</Field>
              </div>
              <Field label="Transactional ID (optional)" hint="Only for transactional producers.">
                <Input value={transactionalId} onChange={(e) => setTransactionalId(e.target.value)} placeholder="orders-tx" />
              </Field>
            </>
          )}

          {mode === 'consumer' && (
            <div className="grid grid-cols-[1fr_1fr_8rem] gap-3">
              <Field label="Topic">
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="orders" />
              </Field>
              <Field label="Consumer group">
                <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="orders-processor" />
              </Field>
              <Field label="Match">{patternSelect}</Field>
            </div>
          )}

          {mode === 'custom' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Resource type">
                  <Select value={resourceType} onValueChange={(v) => setResourceType(v as AclResourceType)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {resourceType === 'cluster' ? (
                  <Field label="Resource name">
                    <Input value="kafka-cluster" disabled />
                  </Field>
                ) : (
                  <Field label="Resource name" hint='"*" with an exact match covers every name.'>
                    <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} placeholder="orders" />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Match">
                  {resourceType === 'cluster' ? (
                    <Select value="literal" disabled>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="literal">Exact name</SelectItem></SelectContent>
                    </Select>
                  ) : patternSelect}
                </Field>
                <Field label="Operation">
                  <Select value={operation} onValueChange={(v) => setOperation(v as AclOperation)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATIONS.map((op) => <SelectItem key={op} value={op}>{operationLabel(op)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Permission">
                  <Select value={permission} onValueChange={(v) => setPermission(v as AclPermission)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="deny">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </>
          )}

          <div className="rounded-md border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-2">
              {bindings.length > 0 ? `${bindings.length} binding${bindings.length > 1 ? 's' : ''} will be created` : 'Bindings preview'}
            </p>
            {bindings.length === 0 ? (
              <p className="text-xs text-muted-foreground">{missing}</p>
            ) : (
              <ul className="flex flex-col gap-1 font-mono text-xs">
                {bindings.map((b) => (
                  <li key={bindingKey(b)} className="truncate">
                    <span className={b.permission === 'deny' ? 'text-destructive' : 'text-green-600 dark:text-green-400'}>
                      {b.permission.toUpperCase()}
                    </span>{' '}
                    {b.principal} {operationLabel(b.operation)} {resourceTypeLabel(b.resource_type).toLowerCase()}{' '}
                    {b.resource_name}{b.pattern_type === 'prefixed' ? '*' : ''}
                    {b.host !== '*' && <span className="text-muted-foreground"> from {b.host}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {failed.length > 0 && (
            <div className="text-sm text-destructive">
              <p>{failed.length} of {bindings.length} bindings failed:</p>
              <ul className="mt-1 font-mono text-xs">
                {failed.map((f) => (
                  <li key={bindingKey(f.binding)}>{operationLabel(f.binding.operation)} {f.binding.resource_name}: {f.error}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{failed.length > 0 ? 'Close' : 'Cancel'}</Button>
            <Button onClick={handleSubmit} disabled={createAcls.isPending || bindings.length === 0}>
              {createAcls.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
