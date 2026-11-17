import { describe, expect, it } from 'vitest'
import { WALKERS, duckAt, fishAt, walkerAt } from './wildlife'

describe('wildlife', () => {
  it('walkers cross the whole map, now and then, alternating direction', () => {
    const cols = 90
    for (const w of WALKERS) {
      const seen: (1 | -1)[] = []
      let present = 0
      let total = 0
      for (let t = 0; t < w.period * 4; t += 0.25) {
        total++
        const pose = walkerAt(w, t, cols)
        if (!pose) continue
        present++
        expect(pose.x).toBeGreaterThanOrEqual(-2.01)
        expect(pose.x).toBeLessThanOrEqual(cols + 2.01)
        if (seen[seen.length - 1] !== pose.dir) seen.push(pose.dir)
      }
      expect(present).toBeGreaterThan(0)
      expect(present).toBeLessThan(total) // sometimes the trail is empty
      expect(seen.length).toBeGreaterThan(1)
    }
  })

  it('ducks stay on the pond', () => {
    const pond = { x: 25, y: 20 }
    for (let t = 0; t < 120; t += 0.5) {
      for (const i of [0, 1]) {
        const d = duckAt(i, t, pond)
        expect(Math.abs(d.x / 16 - pond.x)).toBeLessThanOrEqual(2.5)
        expect(Math.abs(d.y / 16 - pond.y)).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('fish jump out of the water and fall back in', () => {
    const pond = { x: 25, y: 20 }
    let jumped = false
    for (let t = 0; t < 40; t += 0.05) {
      const f = fishAt(0, t, pond)
      if (f && f.ripple < 0) {
        jumped = true
        expect(f.y).toBeLessThanOrEqual(pond.y * 16 + 10)
      }
    }
    expect(jumped).toBe(true)
  })
})
