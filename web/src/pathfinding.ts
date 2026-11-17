/**
 * A* on a 4-connected tile grid with the Manhattan distance as heuristic
 * (admissible for 4-way moves, so the path found is a shortest one).
 */

export interface Point {
  x: number
  y: number
}

export interface Grid {
  cols: number
  rows: number
  isWalkable(x: number, y: number): boolean
}

const STEPS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

/** A binary min-heap keyed by f-score: O(log n) push/pop instead of scanning a list. */
class MinHeap {
  private items: { key: number; f: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(key: number, f: number): void {
    const items = this.items
    items.push({ key, f })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent]!.f <= items[i]!.f) break
      ;[items[parent], items[i]] = [items[i]!, items[parent]!]
      i = parent
    }
  }

  pop(): number {
    const items = this.items
    const top = items[0]!
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (left < items.length && items[left]!.f < items[smallest]!.f) smallest = left
        if (right < items.length && items[right]!.f < items[smallest]!.f) smallest = right
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i]!, items[smallest]!]
        i = smallest
      }
    }
    return top.key
  }
}

/**
 * Returns the tiles from `from` (excluded) to `to` (included), or `null` when
 * `to` cannot be reached. An empty array means already there.
 */
export function findPath(grid: Grid, from: Point, to: Point): Point[] | null {
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < grid.cols && p.y < grid.rows
  if (!inside(from) || !inside(to) || !grid.isWalkable(to.x, to.y)) return null
  if (from.x === to.x && from.y === to.y) return []

  const key = (x: number, y: number) => y * grid.cols + x
  const start = key(from.x, from.y)
  const goal = key(to.x, to.y)
  const heuristic = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y)

  const cameFrom = new Map<number, number>()
  const gScore = new Map<number, number>([[start, 0]])
  const open = new MinHeap()
  open.push(start, heuristic(from.x, from.y))

  while (open.size > 0) {
    const current = open.pop()
    if (current === goal) break
    const cx = current % grid.cols
    const cy = Math.floor(current / grid.cols)
    const g = gScore.get(current)! + 1

    for (const step of STEPS) {
      const nx = cx + step.x
      const ny = cy + step.y
      if (!inside({ x: nx, y: ny }) || !grid.isWalkable(nx, ny)) continue
      const next = key(nx, ny)
      if (g < (gScore.get(next) ?? Infinity)) {
        gScore.set(next, g)
        cameFrom.set(next, current)
        open.push(next, g + heuristic(nx, ny))
      }
    }
  }

  if (!cameFrom.has(goal)) return null
  const path: Point[] = []
  for (let node = goal; node !== start; node = cameFrom.get(node)!) {
    path.push({ x: node % grid.cols, y: Math.floor(node / grid.cols) })
  }
  return path.reverse()
}
