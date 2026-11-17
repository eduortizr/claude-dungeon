import { describe, expect, it } from 'vitest'
import { ROUTINE, ROUTINE_SLOT_MS, guildActivity } from './routine'

describe('guildActivity', () => {
  it('keeps an activity for a whole minute and then moves on', () => {
    const t = 10 * ROUTINE_SLOT_MS
    expect(guildActivity(0, t)).toBe(guildActivity(0, t + ROUTINE_SLOT_MS - 1))
    const seen = new Set(Array.from({ length: ROUTINE.length }, (_, k) => guildActivity(0, t + k * ROUTINE_SLOT_MS)))
    expect(seen).toEqual(new Set(['treino', 'taverna', 'jogos', 'floresta']))
  })

  it('puts the classes in different phases', () => {
    const t = 3 * ROUTINE_SLOT_MS
    const now = Array.from({ length: ROUTINE.length }, (_, i) => guildActivity(i, t))
    expect(new Set(now).size).toBe(4)
    // at any moment only one member is at the taverna, one at the games and one in the forest
    expect(now.filter(a => a === 'taverna')).toHaveLength(1)
    expect(now.filter(a => a === 'jogos')).toHaveLength(1)
    expect(now.filter(a => a === 'floresta')).toHaveLength(1)
  })

  it('goes back to training between the breaks', () => {
    for (let i = 0; i < 6; i++) {
      const seq = Array.from({ length: ROUTINE.length }, (_, k) => guildActivity(i, k * ROUTINE_SLOT_MS))
      for (let k = 0; k < seq.length; k++) {
        if (seq[k] !== 'treino') expect(seq[(k + 1) % seq.length] === 'treino' || seq[(k + 2) % seq.length] === 'treino').toBe(true)
      }
      expect(seq.filter(a => a === 'treino').length).toBeGreaterThanOrEqual(3)
    }
  })
})
