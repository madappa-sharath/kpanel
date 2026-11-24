import { describe, expect, test } from 'bun:test'
import type { LagSnapshot } from '../../types/consumer'
import { computeStats, diagnose, evidence } from './lagStats'

interface Phase {
  secs: number
  inRate: number
  outRate: number
  // Seconds between commits; the consumer's progress lands all at once.
  commitEvery?: number
}

// Snapshots every 5 s, the way the server samples.
function verdict(phases: Phase[], startLag = 0) {
  const snaps: LagSnapshot[] = [{ ts: 0, total_lag: startLag, by_topic: {}, produce_rate: null, consume_rate: null, commits: null }]
  let ts = 0
  let lag = startLag
  let uncommitted = 0
  for (const p of phases) {
    for (let s = 5; s <= p.secs; s += 5) {
      ts += 5_000
      lag += p.inRate * 5
      uncommitted = Math.min(uncommitted + p.outRate * 5, lag)
      let out = 0
      if ((ts / 1000) % (p.commitEvery ?? 5) === 0) {
        out = uncommitted
        uncommitted = 0
      }
      lag -= out
      snaps.push({ ts, total_lag: lag, by_topic: {}, produce_rate: p.inRate, consume_rate: out / 5, commits: out > 0 ? 1 : 0 })
    }
  }
  const stats = computeStats(snaps, 60 * 60_000)!
  const d = diagnose(stats)
  return { ...d, facts: Object.fromEntries(evidence(stats, d).map((f) => [f.label, f.value])) }
}

describe('diagnose with a backlog', () => {
  test('consumer stopped, nothing arriving: no progress, no cause', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 30, inRate: 0, outRate: 0 }])
    expect(d.state).toBe('No progress')
    expect(d.trend).toBe('flat')
    expect(d.cause).toBeUndefined()
    expect(d.facts.in).toBe('0/s')
    expect(d.facts.pace).toBeUndefined()
    expect(d.facts['last commit']).toBe('30s ago')
  })

  test('consumer stopped for over a minute: stalled', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 90, inRate: 0, outRate: 0 }])
    expect(d.tone).toBe('bad')
    expect(d.state).toBe('Stalled')
    expect(d.headline).toBe('no commit in 1m 30s')
  })

  test('consumer that commits every 45 s is not flagged between commits', () => {
    for (const secs of [600, 620, 630]) {
      const d = verdict([{ secs, inRate: 0, outRate: 20, commitEvery: 45 }], 50_000)
      expect(d.state).toBe('Draining')
      expect(d.facts['commits every']).toBe('~45s')
    }
  })

  test('first sample with no commit yet: measuring', () => {
    expect(verdict([{ secs: 5, inRate: 0, outRate: 0 }], 1_000).state).toBe('Measuring')
  })

  test('backlog after an idle spell: stall clock starts with the backlog', () => {
    const d = verdict([{ secs: 120, inRate: 0, outRate: 0 }, { secs: 20, inRate: 500, outRate: 0 }])
    expect(d.state).toBe('No progress')
    expect(d.trend).toBe('up')
  })

  test('a single arrival still counts as arriving', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 30, inRate: 0.05, outRate: 0 }])
    expect(d.state).toBe('No progress')
    expect(d.trend).toBe('up')
  })

  test('dump finished, full speed: draining, no cause', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 120, inRate: 0, outRate: 50 }])
    expect(d.state).toBe('Draining')
    expect(d.cause).toBeUndefined()
    expect(d.facts.pace).toBe('100% of p95')
  })

  test('trickle with nothing arriving: draining, no pace or cause', () => {
    const d = verdict([{ secs: 600, inRate: 0, outRate: 0.1, commitEvery: 10 }], 50_000)
    expect(d.state).toBe('Draining')
    expect(d.facts.pace).toBeUndefined()
    expect(d.cause).toBeUndefined()
  })

  test('backlog from an earlier burst, now matching incoming: not shrinking', () => {
    const d = verdict([{ secs: 60, inRate: 200, outRate: 50 }, { secs: 600, inRate: 50, outRate: 50 }])
    expect(d.state).toBe('Not shrinking')
    expect(d.trend).toBe('flat')
  })

  test('full speed while more arrives: cause incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }])
    expect(d.state).toBe('Falling behind')
    expect(d.headline).toBe('+50/s')
    expect(d.cause).toBe('incoming')
  })

  test('slowed down while more arrives: cause consumer', () => {
    const d = verdict([{ secs: 600, inRate: 50, outRate: 50 }, { secs: 60, inRate: 50, outRate: 10 }], 1_000)
    expect(d.state).toBe('Falling behind')
    expect(d.cause).toBe('consumer')
  })
})

describe('diagnose without a backlog', () => {
  test('caught up', () => {
    expect(verdict([{ secs: 300, inRate: 100, outRate: 100 }]).state).toBe('Caught up')
  })

  test('idle', () => {
    const d = verdict([{ secs: 300, inRate: 0, outRate: 0 }])
    expect(d.state).toBe('Idle')
    expect(d.facts.incoming).toBe('none')
  })
})
