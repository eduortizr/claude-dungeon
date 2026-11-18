import { describe, expect, it } from 'vitest'
import type { Hero, MissionRecord } from '../../shared/types'
import { classXp, critChance, heroXp, levelFor, MAX_LEVEL, power, progress, tier, xpForLevel } from './progression'

function hero(toolCalls: number, statuses: ('working' | 'done' | 'failed')[] = []): Hero {
  return {
    stats: { toolCalls },
    party: statuses.map(status => ({ status })),
  } as unknown as Hero
}

const record = (cls: MissionRecord['cls'], toolCalls: number) => ({ cls, toolCalls }) as MissionRecord

describe('level curve', () => {
  it('starts each level at 10 * L * (L - 1) / 2 XP', () => {
    expect([1, 2, 3, 4, 5, 10].map(xpForLevel)).toEqual([0, 10, 30, 60, 100, 450])
  })

  it('moves up exactly at the limits', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(9)).toBe(1)
    expect(levelFor(10)).toBe(2)
    expect(levelFor(29)).toBe(2)
    expect(levelFor(30)).toBe(3)
    expect(levelFor(450)).toBe(10)
  })

  it('stops at the cap', () => {
    expect(levelFor(1_000_000)).toBe(MAX_LEVEL)
    expect(progress(1_000_000)).toMatchObject({ level: MAX_LEVEL, fraction: 1 })
  })

  it('reports progress inside the level for the bar', () => {
    expect(progress(0)).toEqual({ level: 1, into: 0, span: 10, fraction: 0 })
    expect(progress(20)).toEqual({ level: 2, into: 10, span: 20, fraction: 0.5 })
  })
})

describe('combat numbers', () => {
  it('power grows every three levels', () => {
    expect([1, 3, 4, 6, 7, 20].map(power)).toEqual([1, 1, 2, 2, 3, 7])
  })

  it('tier goes 0 to 4 and stays there', () => {
    expect([1, 3, 4, 7, 10, 13, 20].map(tier)).toEqual([0, 0, 1, 2, 3, 4, 4])
  })

  it('crit chance grows 1% a level and never passes 25%', () => {
    expect(critChance(1)).toBeCloseTo(0.06)
    expect(critChance(10)).toBeCloseTo(0.15)
    for (let level = 1; level <= 40; level++) expect(critChance(level)).toBeLessThanOrEqual(0.25)
    expect(critChance(MAX_LEVEL)).toBeCloseTo(0.25)
  })
})

describe('XP sources', () => {
  it('a hero earns its tool calls plus 5 for each subagent that came back', () => {
    expect(heroXp(hero(12))).toBe(12)
    expect(heroXp(hero(12, ['done', 'working', 'failed', 'done']))).toBe(22)
  })

  it('a class earns only the blows of its own missions', () => {
    const chronicle = [record('ladino', 5), record('guerreiro', 40), record('ladino', 7)]
    expect(classXp(chronicle, 'ladino')).toBe(12)
    expect(classXp(chronicle, 'bardo')).toBe(0)
    expect(classXp(undefined, 'ladino')).toBe(0)
  })
})
