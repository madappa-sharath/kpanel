import type { LagSnapshot } from '../../types/consumer'

const NOW_WINDOW_MS = 30_000
const MAX_NOW_WINDOW_MS = 5 * 60_000
const IDLE_RATE = 0.5
const PACE_TOLERANCE = 0.05
const MIN_PACE_TOLERANCE = 0.2
const MIN_BASELINE_MS = 2 * 60_000
const STALL_MS = 60_000

export interface RateStats {
  now: number
  avg: number
  peak: number
}

// A message wait in ms. atLeast: the message arrived before the sampled
// history (or a gap in it), so the true wait is longer.
export interface Wait {
  ms: number
  atLeast: boolean
}

export interface WindowStats {
  incoming: RateStats
  processing: RateStats
  lag: { now: number; peak: number; delta: number }
  // How long the oldest unprocessed message has been waiting.
  waitNow: Wait | null
  // p95 of how long the messages processed in the window waited.
  waitP95: Wait | null
  commits: { perMinute: number; msgsPerCommit: number | null } | null
  // What "now" averages over: 30 s, or two commit gaps for a consumer that
  // commits less often, so the time between commits doesn't read as zero.
  nowWindowMs: number
  // The consumer's best sustained processing rate this session (p95 of
  // nowWindowMs averages), on the same footing as "now".
  capacity: number | null
  // Time the backlog has gone without the committed offsets moving.
  stalledMs: number
  // Time since the committed offsets last moved; null if they never have.
  sinceCommitMs: number | null
  // Typical time between commits; 0 until there are two.
  commitGapMs: number
  ratedMs: number
}

interface Interval {
  ts: number
  dt: number
  produce: number
  consume: number
  commits: number
}

function intervals(snapshots: LagSnapshot[]): Interval[] {
  const out: Interval[] = []
  for (let i = 1; i < snapshots.length; i++) {
    const s = snapshots[i]
    if (s.produce_rate === null || s.consume_rate === null) continue
    out.push({
      ts: s.ts,
      dt: s.ts - snapshots[i - 1].ts,
      produce: s.produce_rate,
      consume: s.consume_rate,
      commits: s.commits ?? 0,
    })
  }
  return out
}

function weightedAvg(xs: Interval[], pick: (x: Interval) => number) {
  let sum = 0
  let ms = 0
  for (const x of xs) {
    sum += pick(x) * x.dt
    ms += x.dt
  }
  return ms ? sum / ms : 0
}

function p95(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

// Trailing windowMs average ending at each interval, so a value is
// comparable with "now" whatever the commit cadence.
function rollingAvgs(xs: Interval[], windowMs: number, pick: (x: Interval) => number) {
  return xs.map((x, i) => {
    let sum = 0
    let ms = 0
    for (let j = i; j >= 0 && xs[j].ts > x.ts - windowMs; j--) {
      if (j < i && xs[j].ts !== xs[j + 1].ts - xs[j + 1].dt) break
      sum += pick(xs[j]) * xs[j].dt
      ms += xs[j].dt
    }
    return ms ? sum / ms : 0
  })
}

// Median time between samples where the committed offsets moved, ignoring
// pauses long enough to be outages rather than cadence.
function commitGapMs(xs: Interval[]) {
  const progress = xs.filter((x) => x.consume > 0).map((x) => x.ts)
  const gaps: number[] = []
  for (let i = 1; i < progress.length; i++) {
    const gap = progress[i] - progress[i - 1]
    if (gap <= MAX_NOW_WINDOW_MS) gaps.push(gap)
  }
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

function rateStats(win: Interval[], recent: Interval[], pick: (x: Interval) => number): RateStats {
  return {
    now: weightedAvg(recent, pick),
    avg: weightedAvg(win, pick),
    peak: Math.max(0, ...win.map(pick)),
  }
}

// Message waits from offsets alone. Treats the topic as one FIFO queue:
// `arrived` counts messages produced (integrated incoming), `done` counts
// messages processed (arrived minus lag). A message at position n waited from
// when `arrived` passed n until `done` passed it.
interface FlowPoint {
  ts: number
  arrived: number
  done: number
  // Index of the first point of this unbroken run of samples.
  from: number
}

function flow(snapshots: LagSnapshot[]): FlowPoint[] {
  const pts: FlowPoint[] = []
  for (const [i, s] of snapshots.entries()) {
    const prev = pts[i - 1]
    if (!prev || s.produce_rate === null) {
      // Start of a run: everything already waiting arrived before it.
      pts.push({ ts: s.ts, arrived: s.total_lag, done: 0, from: i })
      continue
    }
    const arrived = prev.arrived + (s.produce_rate * (s.ts - prev.ts)) / 1000
    const done = Math.max(prev.done, arrived - s.total_lag)
    pts.push({ ts: s.ts, arrived: Math.max(arrived, done), done, from: prev.from })
  }
  return pts
}

// When message n arrived, or null if before the run began.
function arrivedAt(pts: FlowPoint[], i: number, n: number) {
  const from = pts[i].from
  if (n < pts[from].arrived) return null
  let lo = from
  let hi = i
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].arrived > n) hi = mid
    else lo = mid + 1
  }
  const a = pts[lo - 1] ?? pts[lo]
  const b = pts[lo]
  const span = b.arrived - a.arrived
  return span > 0 ? a.ts + ((n - a.arrived) / span) * (b.ts - a.ts) : b.ts
}

function waitOf(pts: FlowPoint[], i: number, n: number, doneAt: number): Wait {
  const t = arrivedAt(pts, i, n)
  return t === null ? { ms: doneAt - pts[pts[i].from].ts, atLeast: true } : { ms: Math.max(0, doneAt - t), atLeast: false }
}

function waitNow(pts: FlowPoint[]): Wait | null {
  const i = pts.length - 1
  const p = pts[i]
  if (!p) return null
  if (p.arrived - p.done < 0.5) return { ms: 0, atLeast: false }
  return waitOf(pts, i, p.done, p.ts)
}

// p95 over messages, not samples: each interval's waits count once per
// message processed in it.
function waitP95(pts: FlowPoint[], since: number): Wait | null {
  const waits: { w: Wait; n: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    const n = pts[i].done - pts[i - 1].done
    if (pts[i].ts <= since || pts[i].from !== pts[i - 1].from || n <= 0) continue
    waits.push({ w: waitOf(pts, i, pts[i - 1].done + n / 2, pts[i].ts), n })
  }
  if (!waits.length) return null
  waits.sort((a, b) => a.w.ms - b.w.ms)
  const total = waits.reduce((a, x) => a + x.n, 0)
  let seen = 0
  for (const x of waits) {
    seen += x.n
    if (seen >= total * 0.95) return x.w
  }
  return waits[waits.length - 1].w
}

export function computeStats(snapshots: LagSnapshot[], windowMs: number): WindowStats | null {
  const last = snapshots[snapshots.length - 1]
  if (!last || last.produce_rate === null || last.consume_rate === null) return null
  const all = intervals(snapshots)
  const gapMs = commitGapMs(all)
  const nowWindowMs = Math.min(MAX_NOW_WINDOW_MS, Math.max(NOW_WINDOW_MS, 2 * gapMs))
  const win = all.filter((x) => x.ts > last.ts - windowMs)
  const recent = all.filter((x) => x.ts > last.ts - nowWindowMs)
  if (!recent.length) return null

  const winSnaps = snapshots.filter((s) => s.ts > last.ts - windowMs)
  const totalMs = win.reduce((a, x) => a + x.dt, 0)
  const commits = win.reduce((a, x) => a + x.commits, 0)
  const consumed = win.reduce((a, x) => a + x.consume * (x.dt / 1000), 0)
  const allMs = all.reduce((a, x) => a + x.dt, 0)
  const lastProgress = [...all].reverse().find((x) => x.consume > 0)
  // The stall clock starts when the backlog appeared, so a rewind after an
  // idle spell isn't reported as stalled for the whole idle time.
  let backlogFrom = snapshots.length - 1
  while (backlogFrom > 0 && snapshots[backlogFrom - 1].total_lag > 0) backlogFrom--
  const backlogTs = snapshots[backlogFrom].ts
  const pts = flow(snapshots)

  return {
    incoming: rateStats(win, recent, (x) => x.produce),
    processing: rateStats(win, recent, (x) => x.consume),
    lag: {
      now: last.total_lag,
      peak: Math.max(...winSnaps.map((s) => s.total_lag)),
      delta: last.total_lag - winSnaps[0].total_lag,
    },
    waitNow: waitNow(pts),
    waitP95: waitP95(pts, last.ts - windowMs),
    commits: totalMs ? { perMinute: commits / (totalMs / 60_000), msgsPerCommit: commits ? consumed / commits : null } : null,
    nowWindowMs,
    capacity: allMs >= MIN_BASELINE_MS ? p95(rollingAvgs(all, nowWindowMs, (x) => x.consume)) : null,
    stalledMs: last.total_lag > 0 ? last.ts - Math.max(backlogTs, lastProgress?.ts ?? 0) : 0,
    sinceCommitMs: lastProgress ? last.ts - lastProgress.ts : null,
    commitGapMs: gapMs,
    ratedMs: allMs,
  }
}

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'
export type Trend = 'up' | 'down' | 'flat'
export type Cause = 'incoming' | 'consumer'

export interface Diagnosis {
  tone: Tone
  state: string
  // The one number that matters for this state.
  headline: string
  trend?: Trend
  // Set only when the consumer's own baseline can separate the two.
  cause?: Cause
}

export function diagnose(stats: WindowStats): Diagnosis {
  const inRate = stats.incoming.now
  const outRate = stats.processing.now
  const lag = stats.lag.now
  const noCommit = `no commit in ${fmtDuration(stats.stalledMs / 1000)}`
  // Red only when the backlog is growing; an old backlog on a group nobody is
  // feeding is worth a look, not an alarm.
  const stuckTone: Tone = inRate > 0 ? 'bad' : 'warn'

  if (lag > 0 && stats.stalledMs >= Math.max(STALL_MS, 2 * stats.nowWindowMs)) {
    return { tone: stuckTone, state: 'Stalled', headline: noCommit, trend: inRate > 0 ? 'up' : 'flat' }
  }
  if (lag === 0 && inRate < IDLE_RATE && outRate < IDLE_RATE) {
    return { tone: 'idle', state: 'Idle', headline: 'lag 0' }
  }
  if (lag > 0 && outRate === 0) {
    if (stats.ratedMs < stats.nowWindowMs) {
      return { tone: 'idle', state: 'Measuring', headline: 'waiting for first commit' }
    }
    return { tone: stuckTone, state: 'No progress', headline: noCommit, trend: inRate > 0 ? 'up' : 'flat' }
  }

  const net = outRate - inRate
  // With nothing arriving, any processing shrinks the backlog.
  const tolerance = inRate === 0 ? 0 : Math.max(Math.max(inRate, outRate) * PACE_TOLERANCE, MIN_PACE_TOLERANCE)
  if (lag === 0) return { tone: 'ok', state: 'Caught up', headline: 'lag 0' }
  // A busy consumer always trails by whatever arrived since its last commit.
  // That's fine as long as nothing waits long and it isn't growing.
  const w = stats.waitNow
  if (w && !w.atLeast && w.ms <= stats.nowWindowMs && net >= -tolerance) {
    return { tone: 'ok', state: 'Keeping up', headline: `${fmtWait(w)} behind`, trend: 'flat' }
  }
  if (Math.abs(net) <= tolerance) {
    return { tone: 'warn', state: 'Not shrinking', headline: 'net ≈ 0', trend: 'flat', cause: cause(stats) }
  }
  if (net > 0) {
    return { tone: 'ok', state: 'Draining', headline: `clears ~${fmtEta(lag / net)}`, trend: 'down' }
  }
  return { tone: 'warn', state: 'Falling behind', headline: `+${fmtRate(-net)}`, trend: 'up', cause: cause(stats) }
}

const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, idle: 3 }
const STATE_RANK = ['Stalled', 'No progress', 'Falling behind', 'Not shrinking', 'Draining', 'Keeping up', 'Measuring', 'Caught up', 'Idle']

export interface TopicVerdict {
  topic: string
  stats: WindowStats
  diagnosis: Diagnosis
}

// One snapshot series per topic, from the per-topic lag and rates.
export function topicSnapshots(snapshots: LagSnapshot[], topic: string): LagSnapshot[] {
  return snapshots.map((s) => {
    const r = s.topic_rates?.[topic]
    return {
      ts: s.ts,
      total_lag: s.by_topic[topic] ?? 0,
      by_topic: {},
      produce_rate: r ? r.produce_rate : null,
      consume_rate: r ? r.consume_rate : null,
      commits: r ? r.commits : null,
    }
  })
}

// Each topic's verdict, worst first, so one stuck topic can't hide behind
// a busy one in the group totals.
export function topicVerdicts(snapshots: LagSnapshot[], windowMs: number): TopicVerdict[] {
  const last = snapshots[snapshots.length - 1]
  if (!last) return []
  const topics = new Set([...Object.keys(last.by_topic), ...Object.keys(last.topic_rates ?? {})])
  const out: TopicVerdict[] = []
  for (const topic of topics) {
    const stats = computeStats(topicSnapshots(snapshots, topic), windowMs)
    if (stats) out.push({ topic, stats, diagnosis: diagnose(stats) })
  }
  return out.sort(
    (a, b) =>
      TONE_RANK[a.diagnosis.tone] - TONE_RANK[b.diagnosis.tone] ||
      STATE_RANK.indexOf(a.diagnosis.state) - STATE_RANK.indexOf(b.diagnosis.state) ||
      b.stats.lag.now - a.stats.lag.now ||
      a.topic.localeCompare(b.topic),
  )
}

// Current processing as a share of the consumer's best sustained rate; null
// without a baseline worth comparing against.
function pacePct(stats: WindowStats) {
  const cap = stats.capacity
  if (cap === null || cap < IDLE_RATE) return null
  return Math.round((stats.processing.now / cap) * 100)
}

// At its usual top pace and still not gaining: more is arriving than it can
// handle. Well below it: the consumer got slower.
function cause(stats: WindowStats): Cause | undefined {
  const pct = pacePct(stats)
  if (pct === null) return undefined
  if (pct >= 85) return 'incoming'
  if (pct < 60) return 'consumer'
  return undefined
}

export interface Fact {
  label: string
  value: string
  tone?: Tone
}

export const ARROWS: Record<Trend, string> = { up: '↑', down: '↓', flat: '→' }

// The evidence behind a verdict, so it can be checked at a glance.
export function evidence(stats: WindowStats, d: Diagnosis): Fact[] {
  const lag = stats.lag.now
  const facts: Fact[] = []
  if (lag > 0 && d.state !== 'Caught up') facts.push({ label: 'backlog', value: `${fmtCount(lag)}${d.trend ? ` ${ARROWS[d.trend]}` : ''}` })
  if (d.state === 'Idle') {
    facts.push({ label: 'incoming', value: 'none' })
    return facts
  }
  if (lag > 0 && stats.waitNow) facts.push({ label: 'oldest waiting', value: fmtWait(stats.waitNow) })
  if (stats.waitP95 && stats.waitP95.ms > 0) facts.push({ label: 'p95 wait', value: fmtWait(stats.waitP95) })
  facts.push({ label: 'in', value: fmtRate(stats.incoming.now) }, { label: 'out', value: fmtRate(stats.processing.now) })
  if (d.cause && stats.capacity) facts.push({ label: 'best out', value: fmtRate(stats.capacity) })
  if (d.cause) facts.push({ label: 'cause', value: d.cause, tone: 'warn' })
  if (lag > 0 && stats.sinceCommitMs !== null && (d.state === 'Stalled' || d.state === 'No progress')) {
    facts.push({ label: 'last commit', value: `${fmtDuration(stats.sinceCommitMs / 1000)} ago` })
  }
  if (stats.commitGapMs > 10_000) facts.push({ label: 'commits every', value: `~${fmtDuration(stats.commitGapMs / 1000)}` })
  return facts
}

export function fmtWait(w: Wait) {
  return `${w.atLeast ? '>' : ''}${fmtDuration(w.ms / 1000)}`
}

export function fmtRate(v: number) {
  if (v === 0) return '0/s'
  if (v > 0 && v < 0.1) return '<0.1/s'
  return `${fmtCount(v, v < 10 ? 1 : 0)}/s`
}

export function fmtCount(v: number, digits = 0) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(digits)
}

// An estimate, so whole minutes once it's over a minute.
export function fmtEta(seconds: number) {
  return fmtDuration(seconds < 60 ? seconds : Math.ceil(seconds / 60) * 60)
}

export function fmtDuration(seconds: number) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 600) {
    const m = Math.floor(seconds / 60)
    const sec = Math.round(seconds % 60)
    return sec ? `${m}m ${sec}s` : `${m}m`
  }
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`
  if (seconds >= 48 * 3600) return `${Math.round(seconds / 86_400)}d`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export interface ChartRow {
  ts: number
  total_lag: number | null
  produce_rate: number | null
  consume_rate: number | null
  // Nested so a topic name can't collide with the fields above.
  topics: Record<string, number>
}

export const CHART_SMOOTHING_MS = 15_000

// Trailing average, so commits that land just either side of a sample don't
// show as a drop to zero followed by a spike.
function smoothed(snapshots: LagSnapshot[], i: number, pick: (s: LagSnapshot) => number | null) {
  const end = snapshots[i].ts
  let sum = 0
  let ms = 0
  for (let j = i; j > 0 && snapshots[j].ts > end - CHART_SMOOTHING_MS; j--) {
    const v = pick(snapshots[j])
    if (v === null) break
    const dt = snapshots[j].ts - snapshots[j - 1].ts
    sum += v * dt
    ms += dt
  }
  return ms ? sum / ms : pick(snapshots[i])
}

// Rows for both charts. A null row inside each gap breaks the lines instead of
// drawing a straight line across time nobody sampled.
export function chartRows(snapshots: LagSnapshot[], topics: string[], intervalMs: number) {
  const rows: ChartRow[] = []
  const gaps: { from: number; to: number }[] = []
  let prev: LagSnapshot | undefined
  for (const [i, s] of snapshots.entries()) {
    if (prev && s.ts - prev.ts > 3 * intervalMs) {
      gaps.push({ from: prev.ts, to: s.ts })
      rows.push({ ts: prev.ts + 1, total_lag: null, produce_rate: null, consume_rate: null, topics: {} })
    }
    const row: ChartRow = {
      ts: s.ts,
      total_lag: s.total_lag,
      produce_rate: s.produce_rate === null ? null : smoothed(snapshots, i, (x) => x.produce_rate),
      consume_rate: s.consume_rate === null ? null : smoothed(snapshots, i, (x) => x.consume_rate),
      topics: Object.fromEntries(topics.map((t) => [t, s.by_topic[t] ?? 0])),
    }
    rows.push(row)
    prev = s
  }
  return { rows, gaps }
}
