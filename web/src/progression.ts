/**
 * The game's level rules, pure so they are unit-tested apart from the drawing.
 * XP is the number of blows (tool calls): a hero's own plus a bonus for each
 * subagent that came back; a guild class's is the sum over its past missions.
 */
import type { ClassId } from '../../shared/guild'
import type { Hero, MissionRecord } from '../../shared/types'

export const MAX_LEVEL = 20
/** XP a hero gets for each subagent that finished its mission. */
export const SUBAGENT_BONUS = 5
const XP_STEP = 10
const MAX_TIER = 4
const BASE_CRIT = 0.05
const MAX_CRIT = 0.25

/** XP at which `level` begins: 10 * L * (L - 1) / 2, so 1 -> 0, 2 -> 10, 3 -> 30, 4 -> 60. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  return (XP_STEP * l * (l - 1)) / 2
}

export function levelFor(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++
  return level
}

export interface Progress {
  level: number
  /** XP earned inside the current level. */
  into: number
  /** XP the current level takes to finish (0 at the cap). */
  span: number
  /** 0..1 for the bar; always 1 at the cap. */
  fraction: number
}

export function progress(xp: number): Progress {
  const level = levelFor(xp)
  if (level >= MAX_LEVEL) return { level, into: 0, span: 0, fraction: 1 }
  const start = xpForLevel(level)
  const span = xpForLevel(level + 1) - start
  const into = Math.max(0, xp) - start
  return { level, into, span, fraction: into / span }
}

/** Hit points one blow takes off a monster: 1 up to level 3, 2 from level 4, and so on. */
export function power(level: number): number {
  return 1 + Math.floor((Math.max(1, level) - 1) / 3)
}

/** Chance of a critical blow (it doubles the power): 5% plus 1% per level, at most 25%. */
export function critChance(level: number): number {
  return Math.min(MAX_CRIT, BASE_CRIT + 0.01 * Math.max(1, level))
}

/** 0 to 4: how big the effects get. */
export function tier(level: number): number {
  return Math.min(MAX_TIER, Math.floor((Math.max(1, level) - 1) / 3))
}

export function heroXp(hero: Hero): number {
  return hero.stats.toolCalls + SUBAGENT_BONUS * hero.party.filter(m => m.status === 'done').length
}

/** A guild class's XP: the blows of every mission it finished. */
export function classXp(chronicle: MissionRecord[] | undefined, cls: ClassId): number {
  let xp = 0
  for (const record of chronicle ?? []) if (record.cls === cls) xp += record.toolCalls
  return xp
}
