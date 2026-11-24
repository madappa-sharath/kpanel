import type { LagSnapshot } from '../../types/consumer'

const NOW_WINDOW_MS = 30_000
const IDLE_RATE = 0.5
const PACE_TOLERANCE = 0.05
const MIN_PACE_TOLERANCE = 0.2
const MIN_BASELINE_MS = 2 * 60_000
const STALL_MS = 60_000

export interface RateStats {
  now: number
  avg: number
  p95: number
  peak: number
}

export interface WindowStats {
  incoming: RateStats
  processing: RateStats
  lag: { now: number; peak: number; delta: number }
  commits: { perMinute: number; msgsPerCommit: number | null } | null
  // p95 of 30 s processing averages over everything retained: the consumer's
  // observed capacity, on the same footing as "now".
  capacity: number | null
  // Time since the committed offsets last moved; null if they never have.
  sinceProgressMs: number | null
  historyMs: number
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

// Trailing NOW_WINDOW_MS average ending at each interval, so a value is
// comparable with "now" whatever the commit cadence.
function rollingAvgs(xs: Interval[], pick: (x: Interval) => number) {
  return xs.map((x, i) => {
    let sum = 0
    let ms = 0
    for (let j = i; j >= 0 && xs[j].ts > x.ts - NOW_WINDOW_MS; j--) {
      if (j < i && xs[j].ts !== xs[j + 1].ts - xs[j + 1].dt) break
      sum += pick(xs[j]) * xs[j].dt
      ms += xs[j].dt
    }
    return ms ? sum / ms : 0
  })
}

function rateStats(win: Interval[], recent: Interval[], pick: (x: Interval) => number): RateStats {
  const values = win.map(pick)
  return {
    now: weightedAvg(recent, pick),
    avg: weightedAvg(win, pick),
    p95: p95(values),
    peak: Math.max(0, ...values),
  }
}

export function computeStats(snapshots: LagSnapshot[], windowMs: number): WindowStats | null {
  const last = snapshots[snapshots.length - 1]
  if (!last || last.produce_rate === null || last.consume_rate === null) return null
  const all = intervals(snapshots)
  const win = all.filter((x) => x.ts > last.ts - windowMs)
  const recent = win.filter((x) => x.ts > last.ts - NOW_WINDOW_MS)
  if (!recent.length) return null

  const winSnaps = snapshots.filter((s) => s.ts > last.ts - windowMs)
  const totalMs = win.reduce((a, x) => a + x.dt, 0)
  const commits = win.reduce((a, x) => a + x.commits, 0)
  const consumed = win.reduce((a, x) => a + x.consume * (x.dt / 1000), 0)
  const allMs = all.reduce((a, x) => a + x.dt, 0)
  const lastProgress = [...all].reverse().find((x) => x.consume > 0)

  return {
    incoming: rateStats(win, recent, (x) => x.produce),
    processing: rateStats(win, recent, (x) => x.consume),
    lag: {
      now: last.total_lag,
      peak: Math.max(...winSnaps.map((s) => s.total_lag)),
      delta: last.total_lag - winSnaps[0].total_lag,
    },
    commits: totalMs ? { perMinute: commits / (totalMs / 60_000), msgsPerCommit: commits ? consumed / commits : null } : null,
    capacity: allMs >= MIN_BASELINE_MS ? p95(rollingAvgs(all, (x) => x.consume)) : null,
    sinceProgressMs: lastProgress ? last.ts - lastProgress.ts : null,
    historyMs: last.ts - snapshots[0].ts,
  }
}

export type Tone = 'ok' | 'warn' | 'bad' | 'idle'

export interface Diagnosis {
  tone: Tone
  title: string
  detail?: string
}

export function diagnose(stats: WindowStats): Diagnosis {
  const inRate = stats.incoming.now
  const outRate = stats.processing.now
  const lag = stats.lag.now

  const stalledMs = stats.sinceProgressMs ?? stats.historyMs
  if (lag > 0 && stalledMs >= STALL_MS) {
    return {
      tone: 'bad',
      title: `Stalled — ${fmtCount(lag)} waiting, no commits for ${fmtDuration(stalledMs / 1000)}`,
      detail: 'Check that the consumers are running and committing.',
    }
  }
  if (lag === 0 && inRate < IDLE_RATE && outRate < IDLE_RATE) {
    return { tone: 'idle', title: 'Idle — caught up, nothing arriving' }
  }

  if (lag > 0 && outRate === 0) {
    return {
      tone: 'warn',
      title: `No progress — ${fmtCount(lag)} waiting, nothing processed in the last 30 s`,
      detail:
        inRate < IDLE_RATE
          ? 'Nothing is arriving, so the lag is messages already in the topic that the consumer hasn’t worked through.'
          : `${fmtRate(inRate)} is still arriving, so the backlog is growing.`,
    }
  }

  const net = outRate - inRate
  // With nothing arriving, any processing shrinks the backlog.
  const tolerance = inRate < IDLE_RATE ? 0 : Math.max(Math.max(inRate, outRate) * PACE_TOLERANCE, MIN_PACE_TOLERANCE)
  if (Math.abs(net) <= tolerance) {
    return lag === 0
      ? { tone: 'ok', title: 'Keeping up — processing as fast as messages arrive' }
      : { tone: 'warn', title: `Holding steady — ${fmtCount(lag)} behind, not shrinking`, detail: capacityDetail(stats) }
  }
  if (lag === 0) return { tone: 'ok', title: 'Keeping up — no backlog' }
  if (net > 0) {
    return {
      tone: 'ok',
      title: `Catching up by ${fmtRate(net)} — clears in ~${fmtDuration(lag / net)}`,
      detail: capacityDetail(stats),
    }
  }
  return {
    tone: 'warn',
    title: `Falling behind by ${fmtRate(-net)} — incoming is ${fmtRatio(inRate / outRate)} processing`,
    detail: capacityDetail(stats),
  }
}

// Compares current processing with the consumer's own observed p95, which is
// what separates "more is arriving" from "we got slower". Only meaningful
// while there is a backlog; otherwise the consumer just matches incoming.
function capacityDetail(stats: WindowStats) {
  const cap = stats.capacity
  if (cap === null) return 'Needs a few minutes of history to compare against the consumer’s normal pace.'
  if (cap < IDLE_RATE) return 'The consumer hasn’t processed at a steady rate this session, so there’s no normal pace to compare against.'
  const pct = Math.round((stats.processing.now / cap) * 100)
  const of = `Processing at ${pct}% of its fastest 30 s pace this session (p95, ${fmtRate(cap)})`
  if (pct >= 85) {
    return stats.incoming.now >= IDLE_RATE && stats.processing.now <= stats.incoming.now
      ? `${of}: the consumer is at full speed, so the backlog is from incoming volume.`
      : `${of}: the consumer is at full speed, working through messages that arrived earlier.`
  }
  if (pct < 60) return `${of}: the consumer looks slower than it has been.`
  return `${of}.`
}

export function fmtRate(v: number) {
  return `${fmtCount(v, v < 10 ? 1 : 0)}/s`
}

export function fmtCount(v: number, digits = 0) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(digits)
}

function fmtRatio(r: number) {
  if (r >= 100) return 'over 100×'
  return `${r >= 10 ? Math.round(r) : r.toFixed(1)}×`
}

export function fmtDuration(seconds: number) {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
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
