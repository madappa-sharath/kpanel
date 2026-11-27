import { getCollection, type CollectionEntry } from 'astro:content'
import { docsNav, docPath } from './docs-nav.mjs'

export const SITE = 'https://kpanel.sharath.xyz'

export type Doc = CollectionEntry<'docs'>

/** Slug of a docs entry relative to /docs/ ("index" for the docs home). */
export function slugOf(entry: Doc): string {
  const id = entry.id.replace(/^docs\/?/, '')
  return id === '' ? 'index' : id
}

/** Docs entries in sidebar order. */
export async function orderedDocs(): Promise<Doc[]> {
  const all = await getCollection('docs')
  const bySlug = new Map(all.map((e) => [slugOf(e), e]))
  const out: Doc[] = []
  for (const group of docsNav) {
    for (const [, slug] of group.items) {
      const e = bySlug.get(slug)
      if (e) out.push(e)
    }
  }
  return out
}

export const pageUrl = (slug: string) => SITE + docPath(slug)
export const mdUrl = (slug: string) => `${SITE}/docs/${slug}.md`

/** Markdown body with site-relative links made absolute. */
export function absoluteBody(body: string): string {
  return body.replace(/\]\(\/(?!\/)/g, `](${SITE}/`).trim()
}

/** One page as standalone Markdown. */
export function pageMarkdown(entry: Doc): string {
  const slug = slugOf(entry)
  return `# ${entry.data.title}\n\n> ${entry.data.description ?? ''}\n\nSource: ${pageUrl(slug)}\n\n${absoluteBody(entry.body ?? '')}\n`
}
