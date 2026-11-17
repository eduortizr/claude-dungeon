import { describe, expect, it } from 'vitest'
import { GUILD_MEMBERS } from '../../shared/guild'
import { buildMap } from './map'
import { findPath } from './pathfinding'

describe('buildMap', () => {
  it('puts the guild rooms first, then one room per project, at least six rooms', () => {
    expect(buildMap([]).rooms.map(r => r.kind)).toEqual(['taverna', 'jogos', 'treino', 'sealed', 'sealed', 'sealed'])
    const map = buildMap(['a', 'b', 'c', 'd'])
    expect(map.rooms.map(r => r.name)).toEqual(['Taverna', 'Sala de jogos', 'Sala de treinamento', 'a', 'b', 'c', 'd', ''])
  })

  it('is deterministic', () => {
    expect(buildMap(['x', 'y']).floor).toEqual(buildMap(['x', 'y']).floor)
  })

  it('lets a hero walk from the gate to every place it can be sent', () => {
    const map = buildMap(['loja', 'blog', 'api'])
    expect(map.seats.length).toBeGreaterThanOrEqual(8)
    const targets = [
      ...map.seats,
      ...map.room('taverna').slots,
      ...map.room('jogos').tables.flatMap(t => t.seats),
      ...map.room('treino').stations.map(s => s.stand),
      ...map.rooms.filter(r => r.kind === 'project').flatMap(r => r.slots),
    ]
    for (const target of targets) {
      expect(findPath(map, map.spawn, target), `unreachable ${target.x},${target.y}`).not.toBeNull()
    }
  })

  it('has a training station per guild class and four game tables', () => {
    const map = buildMap([])
    expect(map.room('treino').stations.map(s => s.cls)).toEqual([...GUILD_MEMBERS])
    expect(map.room('jogos').tables).toHaveLength(4)
  })

  it('keeps sealed rooms closed', () => {
    const map = buildMap(['only'])
    const sealed = map.rooms.find(r => r.kind === 'sealed')!
    expect(findPath(map, map.spawn, sealed.slots[0]!)).toBeNull()
  })
})
