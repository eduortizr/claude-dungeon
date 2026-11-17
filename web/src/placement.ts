/**
 * Where each hero belongs right now, from its status and how long it has been
 * idle. Pure, so the rules are unit-tested apart from the drawing:
 *
 *   working / waiting        -> its project's room
 *   idle < CELEBRATE_MS      -> the taverna, celebrating the mission it just finished
 *   idle < EXPLORE_MS        -> the sala de jogos, at the round table with the Mestre
 *                               (no free seat: back to the taverna)
 *   idle < SLEEP_MS          -> out in the floresta: fishing, picking herbs, resting on a log
 *   idle longer              -> asleep by the fire in the caverna
 *   offline                  -> out through the gate
 */
import type { Hero } from '../../shared/types'

export const CELEBRATE_MS = 2 * 60_000
export const EXPLORE_MS = 10 * 60_000
export const SLEEP_MS = 25 * 60_000

export type Place =
  | { kind: 'project'; room: string; index: number }
  | { kind: 'taverna'; index: number }
  | { kind: 'jogos'; seat: number }
  | { kind: 'floresta'; index: number }
  | { kind: 'caverna'; index: number }
  | { kind: 'gone' }

/**
 * Which projects need an arena: the ones with a fight going on (a hero at work, waiting for the user, or with
 * a party member out on a mission). A project whose sessions are only resting has no arena: it would stand
 * empty, push the fights off the screen and make the map look deserted.
 */
export function activeProjects(heroes: readonly Hero[]): Set<string> {
  const active = new Set<string>()
  for (const hero of heroes) {
    if (hero.status === 'working' || hero.status === 'waiting' || (hero.status !== 'offline' && hero.party.some(m => m.status === 'working'))) {
      active.add(hero.room)
    }
  }
  return active
}

export function placeHeroes(heroes: readonly Hero[], now: number, seatCount: number): Map<string, Place> {
  const places = new Map<string, Place>()
  const perRoom = new Map<string, number>()
  const taverna: Hero[] = []
  const players: Hero[] = []
  let sleepers = 0
  let walkers = 0

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
      else if (idleFor < EXPLORE_MS) players.push(hero)
      else if (idleFor < SLEEP_MS) places.set(hero.id, { kind: 'floresta', index: walkers++ })
      else places.set(hero.id, { kind: 'caverna', index: sleepers++ })
    }
  }

  // The players take the seats around the round table in order; whoever finds no free seat drinks instead.
  const seated = Math.min(players.length, seatCount)
  for (let seat = 0; seat < seated; seat++) places.set(players[seat]!.id, { kind: 'jogos', seat })
  taverna.push(...players.slice(seated))
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
