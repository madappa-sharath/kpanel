import type { APIRoute } from 'astro'
import { docsNav } from '../docs-nav.mjs'
import { orderedDocs, slugOf, mdUrl, SITE } from '../lib-llms'

// https://llmstxt.org
export const GET: APIRoute = async () => {
  const docs = await orderedDocs()
  const bySlug = new Map(docs.map((d) => [slugOf(d), d]))
  const lines: string[] = [
    '# kpanel',
    '',
    '> kpanel is a local Kafka GUI: a single binary that serves a web UI on your machine. It works with any Kafka-compatible cluster (SASL PLAIN, SCRAM, TLS or no auth), and for AWS MSK it authenticates with AWS_MSK_IAM using your own AWS credentials, discovers clusters, and shows CloudWatch metrics.',
    '',
    'kpanel is open source (MIT) and has no account or server component. Changes to a cluster are locked until write mode is turned on in the UI. The full docs as one file are at ' + SITE + '/llms-full.txt.',
    '',
  ]
  for (const group of docsNav) {
    lines.push(`## ${group.label}`, '')
    for (const [label, slug] of group.items) {
      const d = bySlug.get(slug)
      if (!d) continue
      lines.push(`- [${label}](${mdUrl(slug)}): ${d.data.description ?? ''}`)
    }
    lines.push('')
  }
  lines.push(
    '## Optional',
    '',
    '- [Source code](https://github.com/madappa-sharath/kpanel): Go server and React UI',
    '- [Releases](https://github.com/madappa-sharath/kpanel/releases): binaries for macOS, Linux and Windows',
    '',
  )
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
