// Drives a running kpanel with Playwright and writes the docs screenshots and
// demo recording. run.sh sets up Kafka, the seed data and the server first;
// see that file for the environment this expects.

import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { KPANEL_URL: BASE, OUT_DIR: OUT, TRAFFIC_CMD, FFMPEG } = process.env as Record<string, string>
if (!BASE || !OUT || !TRAFFIC_CMD || !FFMPEG) throw new Error('run this through run.sh')
const CLUSTER = 'prod-eu-west'
// Live traffic runs this long before the lag pages are captured. The server
// samples lag every 5s, so this sets how much history the charts show.
const WARMUP_MS = 150_000

const SHOTS = join(OUT, 'screenshots')
const VIEWPORT = { width: 1440, height: 900 }
const DEMO_VIEWPORT = { width: 1280, height: 800 }
const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]

const url = (path: string) => `${BASE}/clusters/${CLUSTER}${path}`

async function newContext(
  browser: Browser,
  theme: Theme,
  opts: { viewport?: typeof VIEWPORT; scale?: number; writeMode?: boolean; cursor?: boolean } = {},
) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? VIEWPORT,
    deviceScaleFactor: opts.scale ?? 2,
    colorScheme: theme,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(
    ({ theme, cluster, writeMode }) => {
      localStorage.setItem('kpanel-app', JSON.stringify({ state: { theme, activeClusterId: cluster }, version: 0 }))
      if (writeMode) sessionStorage.setItem('kpanel-write-mode', 'enabled')
      else sessionStorage.removeItem('kpanel-write-mode')
    },
    { theme, cluster: CLUSTER, writeMode: !!opts.writeMode },
  )
  if (opts.cursor) await ctx.addInitScript(fakeCursor)
  // Schemas and ACLs are not finished, so keep them out of the docs images.
  await ctx.addInitScript(() => {
    const add = () => {
      const style = document.createElement('style')
      style.textContent = 'a[href$="/schemas"], a[href$="/acls"] { display: none !important; }'
      document.head.appendChild(style)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  })
  // Pin the version endpoint so the update banner never shows and the output
  // does not depend on what is on GitHub today.
  await ctx.route('**/api/version', (route) =>
    route.fulfill({
      json: {
        current: 'v0.0.0',
        updateAvailable: false,
        releasesURL: 'https://github.com/madappa-sharath/kpanel/releases',
        platform: 'linux',
        arch: 'amd64',
      },
    }),
  )
  return ctx
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  // Let charts and fonts finish their first paint.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

async function shot(page: Page, name: string, theme: Theme) {
  await settle(page)
  const path = join(SHOTS, `${name}-${theme}.png`)
  await page.screenshot({ path, animations: 'disabled', caret: 'hide' })
  console.log(`  ${path.slice(OUT.length + 1)}`)
}

// --- static screenshots: seed data only, no live traffic ---

async function staticShots(browser: Browser, theme: Theme) {
  const ctx = await newContext(browser, theme)
  const page = await ctx.newPage()

  await page.goto(url('/'))
  await page.getByText('Partition health', { exact: false }).first().waitFor()
  await shot(page, 'dashboard', theme)

  await page.goto(url('/topics'))
  await page.getByRole('cell', { name: 'app-logs', exact: true }).waitFor()
  await shot(page, 'topics', theme)

  await page.goto(url('/topics/orders/partitions'))
  await page.getByRole('table').first().waitFor()
  await shot(page, 'topic-partitions', theme)

  await page.goto(url('/topics/orders/messages'))
  await page.getByRole('button', { name: 'Fetch', exact: true }).click()
  const rows = page.getByRole('listbox', { name: 'Messages' }).getByRole('option')
  await rows.nth(2).click()
  await shot(page, 'messages', theme)

  await page.goto(url('/topics/orders/search'))
  await page.getByPlaceholder(/Find text anywhere/).fill('totals.grandTotal > 300')
  await page.keyboard.press('Enter')
  await page.getByRole('listbox', { name: 'Messages' }).getByRole('option').first().waitFor()
  await page.getByRole('listbox', { name: 'Messages' }).getByRole('option').first().click()
  await shot(page, 'search', theme)

  await page.goto(url('/brokers'))
  await page.getByText('localhost:19092').first().waitFor()
  await shot(page, 'brokers', theme)

  await ctx.close()

  // Producing needs write mode, which is off by default.
  const wctx = await newContext(browser, theme, { writeMode: true })
  const wpage = await wctx.newPage()
  await wpage.goto(url('/topics/orders'))
  await wpage.getByRole('button', { name: 'Produce' }).click()
  const dialog = wpage.getByRole('dialog')
  await dialog.getByPlaceholder('Optional message key').fill('ord_20571144')
  await dialog.getByRole('button', { name: 'JSON', exact: true }).click()
  await dialog.locator('textarea').fill(
    JSON.stringify(
      {
        orderId: 'ord_20571144',
        customerId: 'cus_128734',
        status: 'created',
        currency: 'USD',
        items: [{ sku: 'HD-2210-GRY-L', qty: 1, unitPrice: 89 }],
        totals: { subtotal: 89, shipping: 0, tax: 7.12, grandTotal: 96.12 },
      },
      null,
      2,
    ),
  )
  await dialog.getByRole('button', { name: 'Header', exact: true }).click()
  await dialog.getByPlaceholder('Header key').fill('source')
  await dialog.getByPlaceholder('Header value').fill('support-replay')
  await dialog.locator('textarea').evaluate((el) => (el.scrollTop = 0))
  await wpage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await shot(wpage, 'produce-message', theme)
  await wctx.close()

  // Connection wizard, second step.
  const cctx = await newContext(browser, theme)
  const cpage = await cctx.newPage()
  await cpage.goto(`${BASE}/welcome`)
  await cpage.getByRole('button', { name: 'Add Kafka cluster' }).click()
  await cpage.getByRole('button', { name: /Next/ }).click()
  await cpage.getByPlaceholder('production-msk').fill('staging-us-east')
  await cpage
    .getByPlaceholder('broker-1:9092, broker-2:9092')
    .fill('kafka-1.staging.internal:9093, kafka-2.staging.internal:9093, kafka-3.staging.internal:9093')
  await cpage.getByText('Enable TLS').click()
  await cpage.mouse.move(0, 0)
  await shot(cpage, 'connection-setup', theme)
  await cctx.close()
}

// --- live pages: need producers and consumers running ---

async function liveShots(browser: Browser, theme: Theme) {
  const ctx = await newContext(browser, theme)
  const page = await ctx.newPage()

  await page.goto(url('/consumer-groups'))
  await page.getByText('clickstream-etl').first().waitFor()
  await shot(page, 'consumer-groups', theme)

  await page.goto(url('/consumer-groups/clickstream-etl/lag'))
  await page.getByRole('button', { name: '15m', exact: true }).click()
  await page.getByText('Throughput', { exact: false }).first().waitFor()
  await shot(page, 'consumer-group-lag', theme)

  await ctx.close()
}

// --- demo recording ---

// A visible pointer, since headless screenshots do not draw one.
function fakeCursor() {
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div')
    el.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    Object.assign(el.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
      transform: 'translate(-100px,-100px)',
    })
    document.body.appendChild(el)
    const pos = sessionStorage.getItem('demo-cursor')
    if (pos) el.style.transform = pos
    addEventListener('mousemove', (e) => {
      el.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`
      sessionStorage.setItem('demo-cursor', el.style.transform)
    }, true)
  })
}

// Glide the pointer to the target, then click it.
async function click(page: Page, target: Locator, pause = 500) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) throw new Error('target has no bounding box')
  const x = box.x + Math.min(box.width / 2, 60)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.click(x, y)
  await page.waitForTimeout(pause)
}

async function type(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 70 })
}

async function recordDemo(browser: Browser) {
  const ctx = await newContext(browser, 'light', { viewport: DEMO_VIEWPORT, scale: 1, cursor: true })
  const page = await ctx.newPage()
  await page.goto(url('/topics'))
  await page.getByRole('cell', { name: 'app-logs', exact: true }).waitFor()
  await settle(page)
  await page.mouse.move(640, 400)

  const frames: { data: Buffer; ts: number }[] = []
  const cdp = await ctx.newCDPSession(page)
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: Buffer.from(f.data, 'base64'), ts: f.metadata.timestamp ?? Date.now() / 1000 })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  await page.waitForTimeout(800)

  // Open a topic.
  await click(page, page.getByPlaceholder(/^Search topics/), 200)
  await type(page, 'user-ev')
  await page.waitForTimeout(400)
  await click(page, page.getByRole('cell', { name: 'user-events', exact: true }), 1200)

  // Browse its latest messages.
  await click(page, page.getByRole('tab', { name: 'Messages' }), 600)
  await click(page, page.getByRole('button', { name: 'Fetch', exact: true }), 1000)
  await click(page, page.getByRole('listbox', { name: 'Messages' }).getByRole('option').nth(1), 1800)

  // Search by a JSON field.
  await click(page, page.getByRole('tab', { name: 'Search' }), 600)
  await click(page, page.getByPlaceholder(/Find text anywhere/), 200)
  await type(page, 'type == "purchase"')
  await page.keyboard.press('Enter')
  await page.getByRole('listbox', { name: 'Messages' }).getByRole('option').first().waitFor()
  await page.waitForTimeout(800)
  await click(page, page.getByRole('listbox', { name: 'Messages' }).getByRole('option').first(), 1800)

  // Check the lag of the group that reads this topic.
  await click(page, page.getByRole('link', { name: 'Consumer Groups' }).first(), 1000)
  await click(page, page.getByText('clickstream-etl', { exact: true }).first(), 800)
  await click(page, page.getByRole('tab', { name: 'Lag' }), 600)
  await click(page, page.getByRole('button', { name: '15m', exact: true }), 3000)

  await cdp.send('Page.stopScreencast')
  await ctx.close()
  await encodeDemo(frames)
}

async function encodeDemo(frames: { data: Buffer; ts: number }[]) {
  if (frames.length < 2) throw new Error('screencast produced no frames')
  const dir = await mkdtemp(join(tmpdir(), 'kpanel-demo-'))
  try {
    const lines: string[] = []
    for (let i = 0; i < frames.length; i++) {
      const file = join(dir, `${String(i).padStart(5, '0')}.png`)
      await writeFile(file, frames[i].data)
      const dur = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1.5
      lines.push(`file '${file}'`, `duration ${Math.max(dur, 0.001).toFixed(3)}`)
    }
    // The concat demuxer ignores the last duration unless the file repeats.
    lines.push(`file '${join(dir, `${String(frames.length - 1).padStart(5, '0')}.png`)}'`)
    const list = join(dir, 'frames.txt')
    await writeFile(list, lines.join('\n'))

    const input = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list]
    await ffmpeg([...input, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
      '-movflags', '+faststart', '-an', join(OUT, 'demo.mp4')])
    await ffmpeg([...input, '-vf',
      'fps=12,scale=1024:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      join(OUT, 'demo.gif')])
    console.log('  demo.mp4\n  demo.gif')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function ffmpeg(args: string[]) {
  const p = Bun.spawn([FFMPEG, ...args], { stdout: 'inherit', stderr: 'inherit' })
  if ((await p.exited) !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}

// --- main ---

await mkdir(SHOTS, { recursive: true })
const browser = await chromium.launch()
let traffic: ReturnType<typeof Bun.spawn> | undefined
try {
  for (const theme of THEMES) {
    console.log(`static pages (${theme})`)
    await staticShots(browser, theme)
  }

  console.log(`running live traffic for ${WARMUP_MS / 1000}s`)
  traffic = Bun.spawn(['sh', '-c', `exec ${TRAFFIC_CMD}`], { stdout: 'ignore', stderr: 'ignore' })
  // Viewing a group's lag history starts the server sampling it.
  await fetch(`${BASE}/api/connections/${CLUSTER}/groups/clickstream-etl/lag-history`)
  await Bun.sleep(WARMUP_MS)

  for (const theme of THEMES) {
    console.log(`live pages (${theme})`)
    await liveShots(browser, theme)
  }
  console.log('demo')
  await recordDemo(browser)
} finally {
  traffic?.kill()
  await browser.close()
}
