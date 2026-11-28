import { Link } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { useAcls } from '../../hooks/useAcls'
import { useClusters } from '../../hooks/useCluster'
import { Button } from '#/components/ui/button'

interface AclsLinkProps {
  clusterId: string
  /** Resource filter for the ACLs page, e.g. "topic:orders". */
  resource: string
  className?: string
}

/**
 * Links to the ACLs that apply to a resource. Rendered only when the cluster
 * lists ACLs; clusters without an authorizer, IAM connections and principals
 * that cannot describe ACLs get no link.
 */
export function AclsLink({ clusterId, resource, className }: AclsLinkProps) {
  const { data: clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === clusterId)
  const { data: acls } = useAcls(clusterId, !!cluster && cluster.auth?.mechanism !== 'aws_iam')
  if (!acls) return null

  return (
    <Button variant="ghost" size="sm" className={className} asChild>
      <Link to="/clusters/$clusterId/acls" params={{ clusterId }} search={{ resource }}>
        <ShieldCheck className="h-4 w-4" />
        ACLs
      </Link>
    </Button>
  )
}
