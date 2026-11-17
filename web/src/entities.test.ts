import { describe, expect, it } from 'vitest'
import { Actor, Monster, isBossWave } from './entities'

describe('boss waves', () => {
  it('sends a boss after every third kill, never at the start of a fight', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(isBossWave)).toEqual([false, false, false, true, false, false, true])
  })

  it('respawns bigger and tougher when the wave is a boss', () => {
    const m = new Monster('r', 1, { x: 5, y: 3 })
    m.kills = 3
    m.respawnIn = 0.1
    expect(m.update(0.2)).toBe(true)
    expect(m.isBoss).toBe(true)
    expect(m.hp).toBe(Monster.BOSS_HP)
    m.kills = 4
    m.respawnIn = 0.1
    m.update(0.2)
    expect(m.isBoss).toBe(false)
    expect(m.hp).toBe(Monster.MAX_HP)
  })

  it('lunges toward its target and comes back', () => {
    const m = new Monster('r', 1, { x: 5, y: 3 })
    m.lungeAt({ x: 5, y: 6 })
    m.update(Monster.CHARGE_TIME / 2)
    expect(m.advance.y).toBeGreaterThan(5)
    m.update(1)
    expect(m.advance).toEqual({ x: 0, y: 0 })
  })
})

describe('Actor knockback', () => {
  it('is shoved and settles back', () => {
    const a = new Actor('a', 'a', 1, 'a', '#fff', false, { x: 0, y: 0 }, 0)
    a.shove = { x: 6, y: 0 }
    expect(a.offset.x).toBe(6)
    for (let i = 0; i < 60; i++) a.update(1 / 60)
    expect(a.offset.x).toBe(0)
  })
})
