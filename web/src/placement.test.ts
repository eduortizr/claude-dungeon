import { describe, expect, it } from 'vitest'
import type { Hero, HeroStatus, TimelineEntry } from '../../shared/types'
import { CELEBRATE_MS, EXPLORE_MS, SLEEP_MS, placeHeroes, victoryLine } from './placement'

const NOW = 10_000_000

function hero(id: string, status: HeroStatus, idleFor = 0, extra: Partial<Hero> = {}): Hero {
  return {
    id,
    name: id,
    sprite: 0,
    room: 'loja',
    cwd: '/loja',
    status,
    action: '',
    startedAt: id.charCodeAt(0),
    lastEventAt: NOW - idleFor,
    hits: 0,
    party: [],
    timeline: [],
    stats: { prompts: 0, toolCalls: 0, subagents: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    ...extra,
  }
}

describe('placeHeroes', () => {
  it('sends working and waiting heroes to their project room, in order', () => {
    const places = placeHeroes([hero('a', 'working'), hero('b', 'waiting'), hero('c', 'working', 0, { room: 'blog' })], NOW, 4)
    expect(places.get('a')).toEqual({ kind: 'project', room: 'loja', index: 0 })
    expect(places.get('b')).toEqual({ kind: 'project', room: 'loja', index: 1 })
    expect(places.get('c')).toEqual({ kind: 'project', room: 'blog', index: 0 })
  })

  it('celebrates in the taverna, plays in pairs, walks in the floresta, then sleeps in the caverna', () => {
    const places = placeHeroes(
      [
        hero('a', 'idle', 1_000),
        hero('b', 'idle', CELEBRATE_MS + 1),
        hero('c', 'idle', CELEBRATE_MS + 2),
        hero('d', 'idle', SLEEP_MS + 1),
        hero('e', 'idle', EXPLORE_MS + 1),
        hero('f', 'idle', SLEEP_MS - 1),
      ],
      NOW,
      4,
    )
    expect(places.get('a')).toEqual({ kind: 'taverna', index: 0 })
    expect(places.get('b')).toEqual({ kind: 'jogos', table: 0, side: 0, rival: 'c' })
    expect(places.get('c')).toEqual({ kind: 'jogos', table: 0, side: 1, rival: 'b' })
    expect(places.get('d')).toEqual({ kind: 'caverna', index: 0 })
    expect(places.get('e')).toEqual({ kind: 'floresta', index: 0 })
    expect(places.get('f')).toEqual({ kind: 'floresta', index: 1 })
  })

  it('sends a player with no partner or no free table to the taverna', () => {
    const lonely = placeHeroes([hero('a', 'idle', CELEBRATE_MS + 1)], NOW, 4)
    expect(lonely.get('a')).toEqual({ kind: 'taverna', index: 0 })

    const crowded = placeHeroes(['a', 'b', 'c', 'd'].map(id => hero(id, 'idle', CELEBRATE_MS + 1)), NOW, 1)
    expect(crowded.get('a')?.kind).toBe('jogos')
    expect(crowded.get('c')).toEqual({ kind: 'taverna', index: 0 })
    expect(crowded.get('d')).toEqual({ kind: 'taverna', index: 1 })
  })

  it('sends offline heroes out', () => {
    expect(placeHeroes([hero('a', 'offline')], NOW, 4).get('a')).toEqual({ kind: 'gone' })
  })
})

describe('victoryLine', () => {
  const entry = (ts: number, kind: TimelineEntry['kind'], text: string): TimelineEntry => ({ ts, kind, text })

  it('tells the last finished mission', () => {
    const timeline = [
      entry(1, 'prompt', 'Nova missão: "corrige o login"'),
      entry(2, 'stop', 'Missão concluída em 3min 4s'),
      entry(3, 'prompt', 'Nova missão: "ainda rodando"'),
    ]
    expect(victoryLine(hero('a', 'idle', 0, { timeline }))).toBe('Missão cumprida em 3min 4s: "corrige o login" 🍺')
  })

  it('has nothing to tell before the first mission', () => {
    expect(victoryLine(hero('a', 'idle'))).toBeUndefined()
  })
})
