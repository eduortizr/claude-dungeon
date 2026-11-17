import { describe, expect, it } from 'vitest'
import { GUILD_MEMBERS } from '../../shared/guild'
import { ARENA_W, buildMap } from './map'
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
      ...map.room('jogos').guests,
      ...map.room('taverna').guests,
      ...map.rooms.filter(r => r.kind === 'project').flatMap(r => r.slots),
    ]
    for (const target of targets) {
      expect(findPath(map, map.spawn, target), `unreachable ${target.x},${target.y}`).not.toBeNull()
    }
  })

  it('has a training target per guild class, four game tables and five residents', () => {
    const map = buildMap([])
    const stations = map.room('treino').stations
    expect(stations.map(s => s.cls)).toEqual([...GUILD_MEMBERS])
    expect(new Set(stations.map(s => s.kind))).toEqual(new Set(['dummy', 'archery', 'daggers', 'crystal', 'orb']))
    expect(map.room('jogos').tables).toHaveLength(4)
    expect(map.residents.map(r => r.id).sort()).toEqual(['alquimista', 'menestrel', 'mercador', 'mestre', 'taverneiro'])
  })

  it('makes project rooms arenas as wide as two rooms, with a spot for 12+ fighters each', () => {
    const map = buildMap(['loja', 'blog', 'api'])
    const arenas = map.rooms.filter(r => r.kind === 'project')
    expect(arenas).toHaveLength(3)
    for (const room of arenas) {
      expect(room.w).toBe(ARENA_W)
      expect(room.slots.length).toBeGreaterThanOrEqual(30)
      // every spot is its own tile, inside the room, on the floor, and reachable from the door
      expect(new Set(room.slots.map(s => `${s.x},${s.y}`)).size).toBe(room.slots.length)
      for (const s of room.slots.slice(0, 16)) {
        expect(s.x).toBeGreaterThan(room.x)
        expect(s.x).toBeLessThan(room.x + room.w - 1)
        expect(findPath(map, room.door, s), `stuck ${s.x},${s.y}`).not.toBeNull()
      }
      expect(findPath(map, map.spawn, room.monster.x === 0 ? room.door : { x: room.monster.x, y: room.monster.y + (room.isTop ? 1 : -1) })).not.toBeNull()
    }
  })

  it('does not let two rooms of the same side overlap, and never overlaps the corridor', () => {
    const map = buildMap(['a', 'b', 'c', 'd', 'e'])
    for (const side of [true, false]) {
      const rooms = map.rooms.filter(r => r.isTop === side).sort((p, q) => p.x - q.x)
      rooms.forEach((r, i) => {
        if (i > 0) expect(r.x).toBeGreaterThan(rooms[i - 1]!.x + rooms[i - 1]!.w - 1)
        expect(r.x + r.w).toBeLessThanOrEqual(map.cols)
      })
    }
  })

  it('has a door per room that opens, plus the cave gate, and animals can use the trail', () => {
    const map = buildMap(['loja'])
    expect(map.doors.length).toBe(map.rooms.filter(r => r.kind !== 'sealed').length + 1)
    for (const d of map.doors) expect(map.isWalkable(d.x, d.y)).toBe(true)
    expect(map.trailAt(10)).toBeGreaterThanOrEqual(map.forestY)
    expect(map.pond.y).toBeGreaterThan(map.trailAt(map.pond.x))
  })

  it('keeps sealed rooms closed', () => {
    const map = buildMap([])
    const sealed = map.rooms.find(r => r.kind === 'sealed')!
    expect(findPath(map, map.spawn, sealed.slots[0]!)).toBeNull()
  })
})
