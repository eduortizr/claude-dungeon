/**
 * Where each hero belongs right now, from its status and how long it has been
 * idle. Pure, so the rules are unit-tested apart from the drawing:
 *
 *   working / waiting        -> its project's room
 *   idle < CELEBRATE_MS      -> the taverna, celebrating the mission it just finished
 *   idle < SLEEP_MS          -> the sala de jogos, paired with another idle hero
 *                               (no partner or no free table: back to the taverna)
 *   idle longer              -> asleep by the fire in the caverna
 *   offline                  -> out through the gate
 */
import type { Hero } from '../../shared/types'

export const CELEBRATE_MS = 2 * 60_000
export const SLEEP_MS = 10 * 60_000

export type Place =
  | { kind: 'project'; room: string; index: number }
  | { kind: 'taverna'; index: number }
  | { kind: 'jogos'; table: number; side: 0 | 1; rival: string }
  | { kind: 'caverna'; index: number }
  | { kind: 'gone' }

export function placeHeroes(heroes: readonly Hero[], now: number, tableCount: number): Map<string, Place> {
  const places = new Map<string, Place>()
  const perRoom = new Map<string, number>()
  const taverna: Hero[] = []
  const players: Hero[] = []
  let sleepers = 0

  const ordered = [...heroes].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  for (const hero of ordered) {
    if (hero.status === 'offline') {
      places.set(hero.id, { kind: 'gone' })
    } else if (hero.status === 'working' || hero.status === 'waiting') {
      const index = perRoom.get(hero.room) ?? 0
      perRoom.set(hero.room, index + 1)
      places.set(hero.id, { kind: 'project', room: hero.room, index })
    } else {
      const idleFor = now - hero.lastEventAt
      if (idleFor < CELEBRATE_MS) taverna.push(hero)
      else if (idleFor < SLEEP_MS) players.push(hero)
      else places.set(hero.id, { kind: 'caverna', index: sleepers++ })
    }
  }

  // Pair the players in order; whoever is left without a partner or a table drinks instead.
  const pairs = Math.min(Math.floor(players.length / 2), tableCount)
  for (let table = 0; table < pairs; table++) {
    const a = players[table * 2]!
    const b = players[table * 2 + 1]!
    places.set(a.id, { kind: 'jogos', table, side: 0, rival: b.id })
    places.set(b.id, { kind: 'jogos', table, side: 1, rival: a.id })
  }
  taverna.push(...players.slice(pairs * 2))
  taverna.forEach((hero, index) => places.set(hero.id, { kind: 'taverna', index }))

  return places
}

/** The line a hero says at the taverna about the mission it just finished, from its timeline. */
export function victoryLine(hero: Hero): string | undefined {
  const lastStop = [...hero.timeline].reverse().find(entry => entry.kind === 'stop')
  if (!lastStop) return undefined
  const lastPrompt = [...hero.timeline].reverse().find(entry => entry.kind === 'prompt' && entry.ts <= lastStop.ts)
  const took = /em (.+)$/.exec(lastStop.text)?.[1]
  const quest = lastPrompt?.text.replace(/^Nova missão: /, '')
  if (quest && took) return `Missão cumprida em ${took}: ${quest} 🍺`
  return took ? `Mais uma missão cumprida, em ${took}! 🍺` : 'Mais uma missão cumprida! 🍺'
}
