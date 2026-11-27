// Generates public/og.png (1200x630), the OpenGraph/Twitter card image.
// Run with `bun run og` after changing the text below, and commit the result.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const root = resolve(import.meta.dir, '..')
const font = (pkg: string, file: string) =>
  readFileSync(resolve(root, 'node_modules/@fontsource', pkg, 'files', file))

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({
  type,
  props: { style, children },
})

const tree = h(
  'div',
  {
    width: 1200,
    height: 630,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '72px 80px',
    background: '#09090b',
    color: '#fafafa',
    fontFamily: 'Plex Sans',
  },
  [
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
     h('div', { display: 'flex', alignItems: 'center', gap: 20 }, [
      h(
        'div',
        {
          width: 64,
          height: 64,
          borderRadius: 12,
          background: '#f59e0b',
          color: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Plex Mono',
          fontSize: 42,
          fontWeight: 600,
        },
        'k',
      ),
      h('div', { fontSize: 40, fontWeight: 600, letterSpacing: -0.5 }, 'kpanel'),
     ]),
     h('div', { fontFamily: 'Plex Mono', fontSize: 24, color: '#71717a' }, 'kpanel.sharath.xyz'),
    ]),
    h('div', { display: 'flex', flexDirection: 'column', gap: 20 }, [
      h('div', { fontSize: 66, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 900 }, 'A local Kafka GUI that signs in to AWS MSK as you'),
      h(
        'div',
        { fontSize: 30, color: '#a1a1aa', lineHeight: 1.35, maxWidth: 960 },
        'Finds your MSK clusters and shows their CloudWatch metrics. One binary. Works with any Kafka cluster.',
      ),
    ]),
  ],
)

const svg = await satori(tree as never, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Plex Sans', data: font('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Plex Sans', data: font('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff'), weight: 600, style: 'normal' },
    { name: 'Plex Mono', data: font('ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Plex Mono', data: font('ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff'), weight: 600, style: 'normal' },
  ],
})

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
writeFileSync(resolve(root, 'public/og.png'), png)
console.log(`og: wrote public/og.png (${png.length} bytes)`)
