import { describe, expect, it } from 'vitest'
import { nightLevel } from './daylight'

const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 17, h, m, s)

describe('nightLevel', () => {
  it('is full day until 18:30 and full night in the small hours', () => {
    for (const [h, m] of [[6, 0], [8, 0], [12, 0], [18, 0], [18, 30]] as const) expect(nightLevel(at(h, m))).toBe(0)
    for (const [h, m] of [[19, 0], [21, 0], [0, 0], [3, 0], [5, 0]] as const) expect(nightLevel(at(h, m))).toBe(1)
  })

  it('darkens over a few minutes from 18:30 and brightens until 06:00', () => {
    expect(nightLevel(at(18, 32, 30))).toBeCloseTo(0.5, 5)
    expect(nightLevel(at(18, 35))).toBe(1)
    expect(nightLevel(at(5, 57, 30))).toBeCloseTo(0.5, 5)
    expect(nightLevel(at(5, 55))).toBe(1)
    expect(nightLevel(at(6, 0))).toBe(0)
  })

  it('never leaves the 0 to 1 range and moves smoothly', () => {
    let previous = nightLevel(at(0, 0))
    for (let minute = 1; minute < 24 * 60; minute++) {
      const level = nightLevel(at(Math.floor(minute / 60), minute % 60))
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
      expect(Math.abs(level - previous)).toBeLessThanOrEqual(0.25)
      previous = level
    }
  })
})
