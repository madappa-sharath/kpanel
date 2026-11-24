import { describe, expect, test } from 'bun:test'
import type { LagSnapshot } from '../../types/consumer'
import { computeStats, diagnose } from './lagStats'

interface Phase {
  secs: number
  inRate: number
  outRate: number
}

// Snapshots every 5 s, with the consumer committing on every sample.
function verdict(phases: Phase[], startLag = 0) {
  const snaps: LagSnapshot[] = [{ ts: 0, total_lag: startLag, by_topic: {}, produce_rate: null, consume_rate: null, commits: null }]
  let ts = 0
  let lag = startLag
  for (const p of phases) {
    for (let s = 5; s <= p.secs; s += 5) {
      ts += 5_000
      const out = Math.min(p.outRate * 5, lag + p.inRate * 5)
      lag += p.inRate * 5 - out
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

  test('dump finished, full speed: backlog is from earlier, not incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }, { secs: 120, inRate: 0, outRate: 50 }])
    expect(d.title).toStartWith('Catching up')
    expect(d.detail).toContain('arrived earlier')
  })

  test('trickle with nothing arriving: catching up, no capacity claim', () => {
    const d = verdict([{ secs: 600, inRate: 0, outRate: 0.1 }], 50_000)
    expect(d.title).toStartWith('Catching up')
    expect(d.detail).not.toContain('incoming')
  })

  test('full speed while more arrives: blames incoming', () => {
    const d = verdict([{ secs: 600, inRate: 100, outRate: 50 }])
    expect(d.title).toStartWith('Falling behind')
    expect(d.detail).toContain('from incoming volume')
  })

  test('slowed down while more arrives: blames the consumer', () => {
    const d = verdict([{ secs: 600, inRate: 50, outRate: 50 }, { secs: 60, inRate: 50, outRate: 10 }], 1_000)
    expect(d.title).toStartWith('Falling behind')
    expect(d.detail).toContain('slower than it has been')
  })
})
