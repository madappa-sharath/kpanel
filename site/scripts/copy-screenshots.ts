// Copies screenshots from docs/assets/screenshots (written by `make screenshots`)
// into public/screenshots so the site can serve them. When the source folder is
// missing, pages render labelled placeholders instead (see src/components/Shot.astro).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const src = resolve(import.meta.dir, '../../docs/assets/screenshots')
const dest = resolve(import.meta.dir, '../public/screenshots')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

if (!existsSync(src)) {
  console.log(`copy-screenshots: ${src} not found, using placeholders`)
  process.exit(0)
}

let n = 0
for (const f of readdirSync(src)) {
  if (!/\.(png|webp|jpg)$/i.test(f)) continue
  cpSync(join(src, f), join(dest, f))
  n++
}
console.log(`copy-screenshots: copied ${n} file(s)`)
