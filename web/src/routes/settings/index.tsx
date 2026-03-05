// Screen-2: Settings / Preferences

import { PageHeader } from '../../components/shared/PageHeader'
import { Link } from '@tanstack/react-router'

export function SettingsPage() {
  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="Settings" description="App preferences and credential management" />

      <div className="flex flex-col gap-3">
        <Section title="Clusters">
          <p className="text-sm text-muted-foreground">
            Manage clusters on the{' '}
            <Link to="/welcome" className="text-amber-600 dark:text-amber-400 hover:underline">
              welcome screen
            </Link>
            .
          </p>
        </Section>

        <Section title="Credentials">
          <p className="text-sm text-muted-foreground mb-1.5">
            Stored in the system keychain under{' '}
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              kpanel
            </code>
            .
          </p>
          <p className="text-xs text-muted-foreground/60">
            TODO: credential viewer / delete entries
          </p>
        </Section>

        <Section title="About">
          <p className="text-sm text-muted-foreground mb-1">kpanel — lightweight Kafka GUI</p>
          <p className="text-xs text-muted-foreground/60">v0.0.1</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
        {title}
      </h2>
      {children}
    </div>
  )
}
