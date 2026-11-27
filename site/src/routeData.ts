import { defineRouteMiddleware } from '@astrojs/starlight/route-data'

// Use the page's `seoTitle` for <title> and og:title when it has one, so the
// sidebar and H1 can stay short.
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute
  const seoTitle = (route.entry.data as { seoTitle?: string }).seoTitle
  if (!seoTitle) return
  for (const tag of route.head) {
    if (tag.tag === 'title') tag.content = seoTitle
    if (tag.tag === 'meta' && (tag.attrs?.property === 'og:title' || tag.attrs?.name === 'twitter:title')) {
      tag.attrs.content = seoTitle
    }
  }
})
