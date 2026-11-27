// Converts screenshots from docs/assets/screenshots (written by `make screenshots`)
// into WebP variants in public/screenshots, plus a manifest the Shot component
// reads for sizes. When the source folder is missing, pages render labelled
// placeholders instead (see src/components/Shot.astro).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const WIDTHS = [800, 1400, 2000]

const src = resolve(import.meta.dir, '../../docs/assets/screenshots')
const dest = resolve(import.meta.dir, '../public/screenshots')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

type Entry = { width: number; height: number; widths: number[] }
const manifest: Record<string, Entry> = {}

if (!existsSync(src)) {
  console.log(`copy-screenshots: ${src} not found, using placeholders`)
} else {
  const files = readdirSync(src).filter((f) => f.endsWith('.png'))
  await Promise.all(
    files.map(async (f) => {
      const base = f.replace(/\.png$/, '')
      const img = sharp(join(src, f))
      const { width = 0, height = 0 } = await img.metadata()
      const widths = WIDTHS.filter((w) => w <= width)
      await Promise.all(
        widths.map((w) =>
          img.clone().resize({ width: w }).webp({ quality: 82 }).toFile(join(dest, `${base}-${w}.webp`)),
        ),
      )
      manifest[base] = { width, height, widths }
    }),
  )
  console.log(`copy-screenshots: converted ${files.length} file(s)`)
}

writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2))
