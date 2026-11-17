import { describe, expect, it } from 'vitest'
import { findPath, type Grid } from './pathfinding'

/** Builds a grid from ASCII art: `#` is a wall, anything else is floor. */
function grid(...lines: string[]): Grid {
  return {
    cols: lines[0]!.length,
    rows: lines.length,
    isWalkable: (x, y) => lines[y]?.[x] !== '#',
  }
}

describe('findPath', () => {
  it('walks straight when nothing is in the way', () => {
    expect(findPath(grid('....'), { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('goes around walls with a shortest path', () => {
    const map = grid(
      '.#...',
      '.#.#.',
      '...#.',
    )
    const path = findPath(map, { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).not.toBeNull()
    expect(path).toHaveLength(8)
    expect(path!.at(-1)).toEqual({ x: 4, y: 0 })
    expect(path!.every(p => map.isWalkable(p.x, p.y))).toBe(true)
  })

  it('returns null when the goal is walled off or a wall', () => {
    const map = grid('.#.', '##.', '...')
    expect(findPath(map, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull()
    expect(findPath(map, { x: 2, y: 0 }, { x: 1, y: 0 })).toBeNull()
  })

  it('returns an empty path when already there, null when off the grid', () => {
    const map = grid('..')
    expect(findPath(map, { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([])
    expect(findPath(map, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull()
  })
})
