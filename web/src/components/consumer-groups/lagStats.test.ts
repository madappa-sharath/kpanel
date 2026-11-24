import { describe, expect, test } from 'bun:test'
import type { LagSnapshot } from '../../types/consumer'
import { computeStats, diagnose } from './lagStats'

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
  return diagnose(computeStats(snaps, 60 * 60_000)!)
}

describe('diagnose with a backlog', () => {
  test('consumer stopped, nothing arriving: no progress, not incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 30, inRate: 0, outRate: 0 }])
    expect(d.title).toStartWith('No progress')
    expect(d.detail).toContain('Nothing is arriving')
  })

  test('consumer stopped for over a minute: stalled', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 90, inRate: 0, outRate: 0 }])
    expect(d.tone).toBe('bad')
    expect(d.title).toStartWith('Stalled')
  })

  test('consumer that commits every 45 s is not flagged between commits', () => {
    for (const secs of [600, 620, 630]) {
      const d = verdict([{ secs, inRate: 0, outRate: 20, commitEvery: 45 }], 50_000)
      expect(d.title).toStartWith('Catching up')
    }
  })

  test('first sample with no commit yet: measuring', () => {
    expect(verdict([{ secs: 5, inRate: 0, outRate: 0 }], 1_000).title).toStartWith('Measuring')
  })

  test('backlog after an idle spell: stall clock starts with the backlog', () => {
    const d = verdict([{ secs: 120, inRate: 0, outRate: 0 }, { secs: 20, inRate: 500, outRate: 0 }])
    expect(d.title).toStartWith('No progress')
  })

  test('a single arrival is not reported as nothing arriving', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 30, inRate: 0.05, outRate: 0 }])
    expect(d.title).toStartWith('No progress')
    expect(d.detail).toContain('still arriving')
  })

  test('dump finished, full speed: backlog is from earlier, not incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 120, inRate: 0, outRate: 50 }])
    expect(d.title).toStartWith('Catching up')
    expect(d.detail).toContain('arrived earlier')
  })

  test('trickle with nothing arriving: catching up, no capacity claim', () => {
    const d = verdict([{ secs: 600, inRate: 0, outRate: 0.1, commitEvery: 10 }], 50_000)
    expect(d.title).toStartWith('Catching up')
    expect(d.detail).toContain('no normal pace to compare against')
  })

  test('backlog from an earlier burst, now matching incoming: not blamed on incoming', () => {
    const d = verdict([{ secs: 60, inRate: 200, outRate: 50 }, { secs: 600, inRate: 50, outRate: 50 }])
    expect(d.title).toStartWith('Holding steady')
    expect(d.detail).toContain('only matching incoming')
  })

  test('full speed while more arrives: blames incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }])
    expect(d.title).toStartWith('Falling behind')
    expect(d.detail).toContain('more is arriving than it can handle')
  })

  test('slowed down while more arrives: blames the consumer', () => {
    const d = verdict([{ secs: 600, inRate: 50, outRate: 50 }, { secs: 60, inRate: 50, outRate: 10 }], 1_000)
    expect(d.title).toStartWith('Falling behind')
    expect(d.detail).toContain('slower than it has been')
  })
})
