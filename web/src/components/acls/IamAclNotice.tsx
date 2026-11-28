import { ExternalLink, KeyRound } from 'lucide-react'
import { MSK_IAM_DOCS_URL, iamPresets, type MskClusterRef } from '../../lib/acls'

interface IamAclNoticeProps {
  cluster?: MskClusterRef
}

/** Shown instead of the ACL table for connections that use AWS IAM auth. */
export function IamAclNotice({ cluster }: IamAclNoticeProps) {
  const presets = iamPresets(cluster)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-md border bg-card p-4">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Access is managed by AWS IAM</p>
          <p className="mt-1 text-muted-foreground">
            This connection authenticates with IAM. MSK authorizes IAM clients through IAM policies
            attached to their role or user, and does not evaluate Kafka ACLs for them. Grant access by
            adding the actions below to the client's IAM policy.
          </p>
          <a
            href={MSK_IAM_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:text-primary/80"
          >
            AWS: IAM access control use cases
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {presets.map((preset) => (
        <div key={preset.label} className="rounded-md border bg-card p-4">
          <p className="text-sm font-medium text-foreground">{preset.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
          <div className="mt-3 flex flex-col gap-2">
            {preset.statements.map((s) => (
              <div key={s.resource} className="rounded border bg-background p-2 font-mono text-xs">
                <p className="text-foreground">{s.actions.join(', ')}</p>
                <p className="mt-1 break-all text-muted-foreground">{s.resource}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
