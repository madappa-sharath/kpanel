// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config'
import starlight from '@astrojs/starlight'
import sitemap from '@astrojs/sitemap'
import { docsNav, docPath } from './src/docs-nav.mjs'

export const SITE = 'https://kpanel.sharath.xyz'
const REPO = 'https://github.com/madappa-sharath/kpanel'

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'kpanel',
      description:
        'kpanel is a local Kafka GUI and Kafka desktop client. One binary, AWS MSK IAM auth with your own credentials, works with any Kafka cluster.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      editLink: { baseUrl: `${REPO}/edit/main/site/` },
      lastUpdated: false,
      pagination: true,
      customCss: [
        '@fontsource/ibm-plex-sans/400.css',
        '@fontsource/ibm-plex-sans/500.css',
        '@fontsource/ibm-plex-sans/600.css',
        '@fontsource/ibm-plex-mono/400.css',
        '@fontsource/ibm-plex-mono/500.css',
        './src/styles/docs.css',
      ],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'kpanel: a local Kafka GUI that signs in to AWS MSK as you' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${SITE}/og.png` } },
        { tag: 'link', attrs: { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: '/llms.txt' } },
      ],
      sidebar: docsNav.map((group) => ({
        label: group.label,
        items: group.items.map(([label, slug]) => ({ label, link: docPath(slug) })),
      })),
      routeMiddleware: './src/routeData.ts',
    }),
    sitemap(),
  ],
})
