import { defineRouteMiddleware } from '@astrojs/starlight/route-data'

const SITE = 'https://kpanel.sharath.xyz'

type HeadTag = { tag: string; attrs?: Record<string, string | boolean | undefined>; content?: string }

/** Questions and answers from a Markdown page laid out as "## Question" + answer paragraphs. */
function faqItems(body: string): { q: string; a: string }[] {
  const items: { q: string; a: string }[] = []
  for (const block of body.split(/^## /m).slice(1)) {
    const [q, ...rest] = block.split('\n')
    const a = rest
      .join('\n')
      .trim()
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
    if (q && a) items.push({ q: q.trim(), a })
  }
  return items
}

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute
  const data = route.entry.data as { title: string; description?: string; seoTitle?: string }
  const head = route.head as HeadTag[]
  const title = data.seoTitle ?? data.title

  // Use `seoTitle` for <title> and og:title when set, so the sidebar and H1 stay short.
  for (const tag of head) {
    if (tag.tag === 'title') tag.content = title
    if (tag.tag === 'meta' && tag.attrs?.property === 'og:title') tag.attrs.content = title
  }

  // Starlight emits no twitter:title or twitter:description.
  head.push({ tag: 'meta', attrs: { name: 'twitter:title', content: title } })
  if (data.description) head.push({ tag: 'meta', attrs: { name: 'twitter:description', content: data.description } })

  if (route.entry.id === 'docs/faq') {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url: `${SITE}/docs/faq/`,
      mainEntity: faqItems(route.entry.body ?? '').map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    }
    head.push({ tag: 'script', attrs: { type: 'application/ld+json' }, content: JSON.stringify(jsonLd) })
  }
})
