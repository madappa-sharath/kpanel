// Screen-10: ACL list — Kafka ACL bindings with filters, create and delete.

import { useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Plus, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { EmptyState } from '../../../../components/shared/EmptyState'
import { DataTable, type Column } from '../../../../components/shared/DataTable'
import { ConfirmModal } from '../../../../components/shared/ConfirmModal'
import { WriteModeBanner, WriteModeGate } from '../../../../components/shared/WriteModeControl'
import { CreateAclModal } from '../../../../components/acls/CreateAclModal'
import { IamAclNotice } from '../../../../components/acls/IamAclNotice'
import { useAcls, useDeleteAcls } from '../../../../hooks/useAcls'
import { useClusters } from '../../../../hooks/useCluster'
import { ApiError } from '../../../../lib/api'
import {
  RESOURCE_TYPES,
  bindingAppliesTo,
  bindingKey,
  operationLabel,
  parseResourceRef,
  resourceTypeLabel,
} from '../../../../lib/acls'
import type { AclBinding } from '../../../../types/acl'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

type AclRow = AclBinding & { key: string }

const ALL = '__all__'

function describeBinding(b: AclBinding): string {
  const name = b.pattern_type === 'prefixed' ? `names starting with "${b.resource_name}"` : `"${b.resource_name}"`
  const host = b.host === '*' ? '' : ` from ${b.host}`
  return `${b.permission === 'deny' ? 'Deny' : 'Allow'} ${b.principal} ${operationLabel(b.operation)} on ${resourceTypeLabel(b.resource_type).toLowerCase()} ${name}${host}`
}

function AclErrorState({ error }: { error: Error }) {
  const code = error instanceof ApiError ? error.code : undefined
  if (code === 'security_disabled') {
    return (
      <EmptyState
        icon={<ShieldOff size={32} />}
        title="No authorizer configured"
        description="This cluster does not enforce ACLs. Set authorizer.class.name on the brokers (StandardAuthorizer for KRaft, AclAuthorizer for ZooKeeper) to manage ACLs."
      />
    )
  }
  if (code === 'unauthorized') {
    return (
      <EmptyState
        icon={<ShieldOff size={32} />}
        title="Not allowed to view ACLs"
        description="This connection's principal needs Describe on the cluster to list ACLs, and Alter to create or delete them. Connect as a super user or grant those operations."
      />
    )
  }
  return <p className="text-destructive">{error.message}</p>
}

export function AclsPage() {
  const { clusterId } = useParams({ strict: false }) as { clusterId: string }
  const { resource } = useSearch({ strict: false }) as { resource?: string }
  const navigate = useNavigate()
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)
  const iamManaged = cluster?.auth?.mechanism === 'aws_iam'

  const { data: acls, isLoading, error } = useAcls(clusterId, !!cluster && !iamManaged)
  const deleteAcls = useDeleteAcls(clusterId)

  const [search, setSearch] = useState('')
  const [principal, setPrincipal] = useState(ALL)
  const [resourceType, setResourceType] = useState(ALL)
  const [permission, setPermission] = useState(ALL)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AclBinding | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const resourceRef = parseResourceRef(resource)
  const all = acls ?? []
  const principals = [...new Set(all.map((a) => a.principal))].sort()
  const q = search.trim().toLowerCase()
  const rows: AclRow[] = all
    .filter((a) => !resourceRef || bindingAppliesTo(a, resourceRef))
    .filter((a) => principal === ALL || a.principal === principal)
    .filter((a) => resourceType === ALL || a.resource_type === resourceType)
    .filter((a) => permission === ALL || a.permission === permission)
    .filter((a) => !q || a.principal.toLowerCase().includes(q) || a.resource_name.toLowerCase().includes(q))
    .map((a) => ({ ...a, key: bindingKey(a) }))

  function clearResource() {
    navigate({ to: '/clusters/$clusterId/acls', params: { clusterId }, search: { resource: undefined } })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    setDeleteError(null)
    try {
      const { results } = await deleteAcls.mutateAsync([target])
      const r = results[0]
      if (r?.error) setDeleteError(r.error)
      else if (!r?.deleted) setDeleteError('No matching ACL was found; it may already have been deleted.')
    } catch (err) {
      setDeleteError((err as Error).message)
    }
  }

  const columns: Column<AclRow>[] = [
    { key: 'principal', header: 'Principal', render: (r) => <span className="font-mono text-xs">{r.principal}</span> },
    {
      key: 'permission',
      header: 'Permission',
      render: (r) =>
        r.permission === 'deny' ? (
          <Badge variant="destructive">Deny</Badge>
        ) : (
          <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950 dark:text-green-400">
            Allow
          </Badge>
        ),
    },
    { key: 'operation', header: 'Operation', render: (r) => operationLabel(r.operation) },
    { key: 'resource_type', header: 'Resource type', render: (r) => resourceTypeLabel(r.resource_type) },
    {
      key: 'resource_name',
      header: 'Resource',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-xs">{r.resource_name}</span>
          {r.pattern_type === 'prefixed' && <Badge variant="outline" className="text-xs">prefix</Badge>}
        </span>
      ),
    },
    { key: 'host', header: 'Host', render: (r) => <span className="font-mono text-xs">{r.host}</span> },
    {
      key: 'key',
      header: '',
      align: 'right',
      width: '3rem',
      render: (r) => (
        <WriteModeGate>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Delete ACL"
            onClick={() => setPendingDelete(r)}
          >
            <Trash2 size={14} />
          </Button>
        </WriteModeGate>
      ),
    },
  ]

  const filtered = rows.length !== all.length
  const description = iamManaged
    ? 'Access for IAM clients is defined in AWS IAM policies'
    : acls
    ? `${all.length} binding${all.length === 1 ? '' : 's'}${filtered ? ` · ${rows.length} shown` : ''}`
    : 'Kafka ACLs: principal, resource, operation'

  return (
    <div className="p-6">
      <PageHeader title="Access Control" description={description}>
        {!iamManaged && (
          <WriteModeGate>
            <Button onClick={() => setCreateOpen(true)} disabled={!acls}>
              <Plus />
              Create ACLs
            </Button>
          </WriteModeGate>
        )}
      </PageHeader>

      {iamManaged ? (
        <IamAclNotice clusterArn={cluster?.platformConfig?.aws?.clusterArn} />
      ) : (
        <>
          <WriteModeBanner description="Enable write mode to create and delete ACLs." />

          {resourceRef && (
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span>ACLs that apply to {resourceTypeLabel(resourceRef.type).toLowerCase()}</span>
              <span className="font-mono text-xs text-foreground">{resourceRef.name}</span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={clearResource}>
                <X size={13} />
                Clear
              </Button>
            </div>
          )}

          {acls && all.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Input
                type="search"
                placeholder="Search principal or resource…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={principal} onValueChange={setPrincipal}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All principals</SelectItem>
                  {principals.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              {!resourceRef && (
                <Select value={resourceType} onValueChange={setResourceType}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All resource types</SelectItem>
                    {RESOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={permission} onValueChange={setPermission}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Allow and deny</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {deleteError && <p className="mb-3 text-sm text-destructive">{deleteError}</p>}

          {isLoading && <p className="text-muted-foreground">Loading ACLs…</p>}
          {error && <AclErrorState error={error as Error} />}
          {acls && all.length === 0 && (
            <EmptyState
              icon={<ShieldCheck size={32} />}
              title="No ACLs"
              description="The cluster has an authorizer but no ACL bindings. Only super users can access resources until bindings are added."
            />
          )}
          {acls && all.length > 0 && (
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(r) => r.key}
              emptyMessage="No ACLs match these filters"
            />
          )}
        </>
      )}

      {createOpen && (
        <CreateAclModal
          clusterId={clusterId}
          initialTopic={resourceRef?.type === 'topic' ? resourceRef.name : undefined}
          initialGroup={resourceRef?.type === 'group' ? resourceRef.name : undefined}
          onClose={() => setCreateOpen(false)}
        />
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete ACL"
        description={pendingDelete ? `${describeBinding(pendingDelete)}. Clients that rely on this binding lose that access.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
