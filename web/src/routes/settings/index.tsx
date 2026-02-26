// Screen-2: Settings / Preferences

import { PageHeader } from '../../components/shared/PageHeader'
import { Link } from '@tanstack/react-router'

export function SettingsPage() {
  return (
    <div className="k-page" style={{ maxWidth: 600 }}>
      <PageHeader title="Settings" description="App preferences and credential management" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Section title="Clusters">
          <p style={{ margin: 0, color: 'var(--k-muted)', fontSize: 14 }}>
            Manage clusters on the{' '}
            <Link to="/welcome" style={{ color: 'var(--k-amber)', textDecoration: 'none' }}>
              welcome screen
            </Link>
            .
          </p>
        </Section>

        <Section title="Credentials">
          <p style={{ margin: '0 0 6px', color: 'var(--k-muted)', fontSize: 14 }}>
            Stored in the system keychain under{' '}
            <code style={{ color: 'var(--k-text)', background: 'var(--k-surface-3)', padding: '1px 6px', borderRadius: 3, fontSize: 12, fontFamily: 'var(--k-font)' }}>
              kpanel
            </code>
            .
          </p>
          <p style={{ margin: 0, color: 'var(--k-faint)', fontSize: 12 }}>
            TODO: credential viewer / delete entries
          </p>
        </Section>

        <Section title="About">
          <p style={{ margin: '0 0 4px', color: 'var(--k-muted)', fontSize: 14 }}>kpanel — lightweight Kafka GUI</p>
          <p style={{ margin: 0, color: 'var(--k-faint)', fontSize: 12 }}>v0.0.1</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--k-border)',
      borderRadius: 6,
      padding: '14px 16px',
      background: 'var(--k-surface)',
    }}>
      <h2 style={{
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--k-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        fontFamily: 'var(--k-font)',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}
