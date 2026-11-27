import type { APIRoute } from 'astro'
import { orderedDocs, pageMarkdown } from '../lib-llms'

export const GET: APIRoute = async () => {
  const docs = await orderedDocs()
  const header =
    '# kpanel documentation\n\n> The full kpanel docs as Markdown. kpanel is a local Kafka GUI with AWS MSK IAM auth. Site: https://kpanel.sharath.xyz\n'
  const body = docs.map(pageMarkdown).join('\n---\n\n')
  return new Response(`${header}\n${body}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
