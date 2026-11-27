import type { APIRoute, GetStaticPaths } from 'astro'
import { orderedDocs, pageMarkdown, slugOf, type Doc } from '../../lib-llms'

// Each docs page as plain Markdown at /docs/<slug>.md, linked from llms.txt.
export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await orderedDocs()
  return docs.map((entry) => ({ params: { slug: slugOf(entry) }, props: { entry } }))
}

export const GET: APIRoute = ({ props }) =>
  new Response(pageMarkdown((props as { entry: Doc }).entry), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
