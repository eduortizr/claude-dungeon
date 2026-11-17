/**
 * Builds the tile map from the list of active projects:
 *
 *   ┌────────┐ ┌─────────┐ ┌─────────┐
 *   │ Caverna│ │ sala 0  │ │ sala 2  │   rooms alternate above and below
 *   │  (🔥)  ├─┴──door───┴─┴──door───┴── the corridor, one per project
 *   │        │  corridor
 *   │ Portão │ ┌──door───┐ ┌──door───┐
 *   └────────┘ │ sala 1  │ │ sala 3  │
 *
 * Deterministic: the same rooms always give the same map, so rebuilding it
 * when a project appears does not reshuffle the decoration.
 */
import { hashString } from '../../shared/guild'
import type { Grid, Point } from './pathfinding'
import { TILE } from './tiles'

export const ROOM_W = 11
export const ROOM_H = 10
const CAVE_W = 16
const CORRIDOR_H = 3
const FIRST_ROOM_X = CAVE_W + 2
/** Rooms drawn even with fewer projects, so the dungeon never looks empty. */
const MIN_ROOMS = 4

export interface RoomLayout {
  /** Project name; empty for a sealed placeholder room. */
  name: string
  x: number
  y: number
  isTop: boolean
  door: Point
  monster: Point
  slots: Point[]
}

export interface GameMap extends Grid {
  floor: Int16Array
  deco: Int16Array
  blocked: Uint8Array
  rooms: RoomLayout[]
  fire: Point
  seats: Point[]
  gate: Point
  spawn: Point
  corridorY: number
}

/** mulberry32: a tiny seeded PRNG, so decoration is random-looking but stable. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildMap(projects: readonly string[]): GameMap {
  const roomCount = Math.max(MIN_ROOMS, projects.length + (projects.length % 2))
  const columns = Math.ceil(roomCount / 2)
  const cols = FIRST_ROOM_X + columns * (ROOM_W + 1) + 1
  const corridorY = 1 + ROOM_H
  const rows = corridorY + CORRIDOR_H + ROOM_H + 1

  const size = cols * rows
  const floor = new Int16Array(size).fill(-1)
  const deco = new Int16Array(size).fill(-1)
  const blocked = new Uint8Array(size)
  const at = (x: number, y: number) => y * cols + x
  const random = rng(hashString(projects.join('|')))

  const setFloor = (x: number, y: number, tile: number) => (floor[at(x, y)] = tile)
  const setDeco = (x: number, y: number, tile: number, solid = true) => {
    deco[at(x, y)] = tile
    if (solid) blocked[at(x, y)] = 1
  }
  const sand = () => (random() < 0.8 ? TILE.sand : TILE.sandAlt)

  // ---- the cave: an ellipse of dirt with pebbles, a campfire and the gate ----
  const caveCenter = { x: CAVE_W / 2, y: rows / 2 }
  const rx = CAVE_W / 2 - 0.5
  const ry = rows / 2 - 1
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < CAVE_W; x++) {
      const dx = (x + 0.5 - caveCenter.x) / rx
      const dy = (y + 0.5 - caveCenter.y) / ry
      if (dx * dx + dy * dy <= 1 + (random() - 0.5) * 0.15) {
        setFloor(x, y, TILE.dirt)
        if (random() < 0.06) setDeco(x, y, random() < 0.5 ? TILE.pebbles : TILE.stones, false)
      }
    }
  }
  const fire = { x: Math.floor(caveCenter.x), y: Math.floor(caveCenter.y) - 2 }
  deco[at(fire.x, fire.y)] = -1
  blocked[at(fire.x, fire.y)] = 1 // drawn by the renderer, animated

  const gate = { x: fire.x, y: rows - 3 }
  setFloor(gate.x, gate.y + 1, TILE.dirt)
  setDeco(gate.x, gate.y + 1, TILE.door)
  const spawn = { x: gate.x, y: gate.y }

  // Supplies around the camp.
  const supplies: [number, number, number][] = [
    [fire.x - 4, fire.y - 3, TILE.barrel],
    [fire.x - 3, fire.y - 4, TILE.crate],
    [fire.x + 4, fire.y - 3, TILE.chest],
    [fire.x + 3, fire.y + 5, TILE.anvil],
    [fire.x - 4, fire.y + 5, TILE.barrel],
  ]
  for (const [x, y, tile] of supplies) if (floor[at(x, y)] === TILE.dirt) setDeco(x, y, tile)

  // ---- the corridor, from the cave mouth to the last room ----
  for (let y = corridorY; y < corridorY + CORRIDOR_H; y++) {
    for (let x = Math.floor(caveCenter.x); x < cols - 1; x++) {
      if (floor[at(x, y)] !== TILE.dirt) setFloor(x, y, sand())
      deco[at(x, y)] = -1
      blocked[at(x, y)] = 0
    }
  }

  // ---- the rooms ----
  const rooms: RoomLayout[] = []
  for (let i = 0; i < roomCount; i++) {
    const isTop = i % 2 === 0
    const x = FIRST_ROOM_X + Math.floor(i / 2) * (ROOM_W + 1)
    const y = isTop ? 1 : corridorY + CORRIDOR_H
    const name = projects[i] ?? ''
    const doorX = x + Math.floor(ROOM_W / 2)
    const door = { x: doorX, y: isTop ? y + ROOM_H - 1 : y }

    for (let ty = y; ty < y + ROOM_H; ty++) {
      for (let tx = x; tx < x + ROOM_W; tx++) {
        const isWall = ty === y || ty === y + ROOM_H - 1 || tx === x || tx === x + ROOM_W - 1
        if (isWall) {
          setFloor(tx, ty, TILE.wall)
          blocked[at(tx, ty)] = 1
        } else {
          setFloor(tx, ty, sand())
        }
      }
    }

    // Banners on the back wall, loot in the corners.
    const backWall = isTop ? y : y + ROOM_H - 1
    setDeco(x + 2, backWall, TILE.banner)
    setDeco(x + ROOM_W - 3, backWall, TILE.banner)
    const farRow = isTop ? y + 1 : y + ROOM_H - 2
    setDeco(x + 1, farRow, random() < 0.5 ? TILE.chest : TILE.chestBig)
    setDeco(x + ROOM_W - 2, farRow, random() < 0.5 ? TILE.barrel : TILE.crate)

    if (name) {
      blocked[at(door.x, door.y)] = 0
      setFloor(door.x, door.y, TILE.sand)
    } else {
      setDeco(x + 5, isTop ? y + 4 : y + 5, TILE.tomb) // a sealed chamber
    }

    const monster = { x: doorX, y: isTop ? y + 3 : y + ROOM_H - 4 }
    const slotRows = isTop ? [y + 5, y + 6, y + 7] : [y + 4, y + 3, y + 2]
    const slotColumns = [0, -2, 2, -4, 4].map(d => doorX + d)
    const slots = slotRows.flatMap(sy => slotColumns.map(sx => ({ x: sx, y: sy })))
    blocked[at(monster.x, monster.y)] = 1
    rooms.push({ name, x, y, isTop, door, monster, slots })
  }

  // Seats in rings around the fire, inner ring first. Consecutive seats sit on
  // opposite sides, so a few heroes spread around the fire instead of bunching up.
  const seats: Point[] = []
  const rings: [radius: number, count: number][] = [[2.2, 6], [4, 10], [5.5, 14]]
  for (const [radius, count] of rings) {
    for (let n = 0; n < count; n++) {
      const k = (n * Math.floor(count / 2 + 1)) % count
      const angle = (k / count) * Math.PI * 2 + Math.PI / 2
      const sx = Math.round(fire.x + Math.cos(angle) * radius)
      const sy = Math.round(fire.y + Math.sin(angle) * radius * 0.85)
      const free = floor[at(sx, sy)] === TILE.dirt && !blocked[at(sx, sy)]
      if (free && !seats.some(s => s.x === sx && s.y === sy)) seats.push({ x: sx, y: sy })
    }
  }

  return {
    cols,
    rows,
    floor,
    deco,
    blocked,
    rooms,
    fire,
    seats,
    gate,
    spawn,
    corridorY,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && floor[at(x, y)]! >= 0 && !blocked[at(x, y)],
  }
}
