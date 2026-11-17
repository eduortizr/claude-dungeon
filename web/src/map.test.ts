import { describe, expect, it } from 'vitest'
import { GUILD_MEMBERS } from '../../shared/guild'
import { buildMap } from './map'
import { findPath } from './pathfinding'

describe('buildMap', () => {
  it('puts the guild rooms first, then one room per project, at least six rooms', () => {
    expect(buildMap([]).rooms.map(r => r.kind)).toEqual(['taverna', 'jogos', 'treino', 'estudos', 'tesouro', 'sealed'])
    const map = buildMap(['a', 'b', 'c'])
    expect(map.rooms.map(r => r.name)).toEqual([
      'Taverna',
      'Sala de jogos',
      'Sala de treinamento',
      'Biblioteca',
      'Câmara de ouro',
      'a',
      'b',
      'c',
    ])
  })

  it('gives no room of their own to projects that live in a guild room', () => {
    const map = buildMap(['Invest', 'loja', 'Estudos'])
    expect(map.rooms.filter(r => r.kind === 'project').map(r => r.name)).toEqual(['loja'])
    expect(map.room('tesouro').project).toBe('Invest')
    expect(map.room('estudos').project).toBe('Estudos')
  })

  it('is deterministic', () => {
    expect(buildMap(['x', 'y']).floor).toEqual(buildMap(['x', 'y']).floor)
  })

  it('keeps the forest where it was when a project widens the map', () => {
    const small = buildMap(['a'])
    const wide = buildMap(['a', 'b', 'c', 'd'])
    const trees = (map: ReturnType<typeof buildMap>) =>
      map.props.filter(p => (p.kind === 'tree' || p.kind === 'pine') && p.x > 0 && p.x < small.cols - 2).map(p => `${p.x},${p.y}`)
    expect(trees(wide)).toEqual(expect.arrayContaining(trees(small)))
  })

  it('lets a hero walk from the forest edge to every place it can be sent', () => {
    const map = buildMap(['loja', 'blog', 'api'])
    expect(map.seats.length).toBeGreaterThanOrEqual(8)
    expect(map.forest.length).toBeGreaterThanOrEqual(5)
    const targets = [
      ...map.seats,
      ...map.forest.map(s => s.at),
      map.gate,
      ...map.room('taverna').slots,
      ...map.room('jogos').tables.flatMap(t => t.seats),
      ...map.room('treino').stations.map(s => s.stand),
      ...map.room('estudos').slots,
      ...map.room('tesouro').slots,
      ...map.rooms.filter(r => r.kind === 'project').flatMap(r => r.slots),
    ]
    for (const target of targets) {
      expect(findPath(map, map.spawn, target), `unreachable ${target.x},${target.y}`).not.toBeNull()
    }
  })

  it('has a training target per guild class, four game tables and three residents', () => {
    const map = buildMap([])
    const stations = map.room('treino').stations
    expect(stations.map(s => s.cls)).toEqual([...GUILD_MEMBERS])
    expect(new Set(stations.map(s => s.kind))).toEqual(new Set(['dummy', 'archery', 'daggers', 'crystal', 'orb']))
    expect(map.room('jogos').tables).toHaveLength(4)
    expect(map.residents.map(r => r.id).sort()).toEqual(['alquimista', 'mercador', 'taverneiro'])
  })

  it('keeps sealed rooms closed', () => {
    const map = buildMap([])
    const sealed = map.rooms.find(r => r.kind === 'sealed')!
    expect(findPath(map, map.spawn, sealed.slots[0]!)).toBeNull()
  })
})
