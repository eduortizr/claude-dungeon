import { describe, expect, it } from 'vitest'
import { buildMap } from './map'
import { findPath } from './pathfinding'

describe('buildMap', () => {
  it('gives every project a room and keeps at least four rooms', () => {
    expect(buildMap([]).rooms).toHaveLength(4)
    const map = buildMap(['a', 'b', 'c', 'd', 'e'])
    expect(map.rooms.map(r => r.name)).toEqual(['a', 'b', 'c', 'd', 'e', ''])
  })

  it('is deterministic', () => {
    expect(buildMap(['x', 'y']).floor).toEqual(buildMap(['x', 'y']).floor)
  })

  it('lets a hero walk from the gate to every seat and every room slot', () => {
    const map = buildMap(['loja', 'blog', 'api'])
    expect(map.seats.length).toBeGreaterThanOrEqual(8)
    const targets = [
      ...map.seats,
      ...map.rooms.filter(r => r.name).flatMap(r => r.slots),
    ]
    for (const target of targets) {
      expect(findPath(map, map.spawn, target), `unreachable ${target.x},${target.y}`).not.toBeNull()
    }
  })

  it('keeps sealed rooms closed', () => {
    const map = buildMap(['only'])
    const sealed = map.rooms[1]!
    expect(sealed.name).toBe('')
    expect(findPath(map, map.spawn, sealed.slots[0]!)).toBeNull()
  })
})
