/**
 * Builds the tile map from the list of active projects:
 *
 *   ┌────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
 *   │ Caverna│ │ Taverna │ │ Treino  │ │ proj. 1 │   rooms alternate above
 *   │  (🔥)  ├─┴──door───┴─┴──door───┴─┴──door───┴── and below the corridor
 *   │        │  corridor
 *   │ Portão │ ┌──door───┐ ┌──door───┐ ┌──door───┐
 *   └────────┘ │  Jogos  │ │ proj. 0 │ │ proj. 2 │
 *
 * The guild's own rooms come first (taverna, sala de jogos, sala de
 * treinamento), then one room per project. Each room is laid out in local
 * coordinates, row 0 at the back wall and row 9 at the door, and mirrored for
 * rooms below the corridor.
 *
 * Deterministic: the same rooms always give the same map, so rebuilding it
 * when a project appears does not reshuffle the decoration.
 */
import { GUILD_MEMBERS, hashString, type ClassId } from '../../shared/guild'
import type { Grid, Point } from './pathfinding'
import { TILE } from './tiles'

export const ROOM_W = 11
export const ROOM_H = 10
const CAVE_W = 16
const CORRIDOR_H = 3
const FIRST_ROOM_X = CAVE_W + 2
/** Rooms drawn even with few projects, so the dungeon never looks empty. */
const MIN_ROOMS = 6

export type RoomKind = 'taverna' | 'jogos' | 'treino' | 'project' | 'sealed'

/** The guild's rooms, in map order, with the name on their sign. */
export const GUILD_ROOMS: readonly { kind: RoomKind; name: string }[] = [
  { kind: 'taverna', name: 'Taverna' },
  { kind: 'jogos', name: 'Sala de jogos' },
  { kind: 'treino', name: 'Sala de treinamento' },
]

/** A game table in the sala de jogos: two players face each other across it. */
export interface GameTable {
  center: Point
  seats: [Point, Point]
}

/** A training spot: a class member stands at `stand` and hits the dummy. */
export interface Station {
  cls: ClassId
  stand: Point
  dummy: Point
}

export interface RoomLayout {
  kind: RoomKind
  /** Project name, or the guild room's name; empty for a sealed room. */
  name: string
  x: number
  y: number
  isTop: boolean
  door: Point
  /** Project rooms: where the monster stands. */
  monster: Point
  /** Where people stand: fighters in a project room, drinkers in the taverna. */
  slots: Point[]
  tables: GameTable[]
  stations: Station[]
}

export interface GameMap extends Grid {
  floor: Int16Array
  deco: Int16Array
  blocked: Uint8Array
  rooms: RoomLayout[]
  /** Tiles the renderer animates (training dummies). */
  dummies: Point[]
  fire: Point
  seats: Point[]
  gate: Point
  spawn: Point
  corridorY: number
  room(kind: RoomKind): RoomLayout
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
  const named = [...GUILD_ROOMS, ...projects.map(name => ({ kind: 'project' as RoomKind, name }))]
  const roomCount = Math.max(MIN_ROOMS, named.length + (named.length % 2))
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
  const dummies: Point[] = []
  for (let i = 0; i < roomCount; i++) {
    const isTop = i % 2 === 0
    const x = FIRST_ROOM_X + Math.floor(i / 2) * (ROOM_W + 1)
    const y = isTop ? 1 : corridorY + CORRIDOR_H
    const { kind, name } = named[i] ?? { kind: 'sealed' as RoomKind, name: '' }
    /** Local (lx, ly) -> map tile; ly 0 is the back wall, ly 9 the door's wall. */
    const P = (lx: number, ly: number): Point => ({ x: x + lx, y: isTop ? y + ly : y + ROOM_H - 1 - ly })
    const deco = (lx: number, ly: number, tile: number, solid = true) => {
      const p = P(lx, ly)
      setDeco(p.x, p.y, tile, solid)
    }
    const door = P(5, ROOM_H - 1)
    const floorTile = kind === 'taverna' || kind === 'jogos' ? () => TILE.dirt : sand

    for (let ty = y; ty < y + ROOM_H; ty++) {
      for (let tx = x; tx < x + ROOM_W; tx++) {
        const isWall = ty === y || ty === y + ROOM_H - 1 || tx === x || tx === x + ROOM_W - 1
        if (isWall) {
          setFloor(tx, ty, TILE.wall)
          blocked[at(tx, ty)] = 1
        } else {
          setFloor(tx, ty, floorTile())
        }
      }
    }
    if (kind !== 'sealed') {
      blocked[at(door.x, door.y)] = 0
      setFloor(door.x, door.y, floorTile())
    }

    const room: RoomLayout = { kind, name, x, y, isTop, door, monster: P(5, 3), slots: [], tables: [], stations: [] }

    if (kind === 'taverna') {
      // Bar counter with the barkeep behind it, three tables.
      deco(1, 1, TILE.barrel)
      deco(2, 1, TILE.barkeep)
      deco(3, 1, TILE.barrel)
      for (const lx of [1, 2, 3]) deco(lx, 2, TILE.crateAlt)
      deco(8, 0, TILE.banner)
      deco(9, 1, TILE.barrel)
      for (const t of [P(7, 3), P(3, 6), P(7, 6)]) setDeco(t.x, t.y, TILE.table)
      // Spots two tiles apart come first, so a few drinkers' name tags don't overlap.
      room.slots = [P(2, 3), P(6, 3), P(2, 6), P(6, 6), P(8, 3), P(4, 6), P(8, 6), P(4, 3), P(3, 3)]
    } else if (kind === 'jogos') {
      deco(2, 0, TILE.banner)
      deco(8, 0, TILE.banner)
      deco(1, 1, TILE.chest)
      deco(9, 1, TILE.crate)
      for (const [lx, ly] of [[3, 3], [7, 3], [3, 6], [7, 6]] as const) {
        const center = P(lx, ly)
        setDeco(center.x, center.y, TILE.table)
        room.tables.push({ center, seats: [P(lx - 1, ly), P(lx + 1, ly)] })
      }
    } else if (kind === 'treino') {
      // A weapon rack on the back wall and one dummy per class.
      TILE.weapons.forEach((tile, k) => deco(2 + k * 2, 0, tile))
      const spots: [number, number][] = [[2, 2], [5, 2], [8, 2], [2, 5], [5, 5], [8, 5]]
      GUILD_MEMBERS.forEach((cls, k) => {
        const [lx, ly] = spots[k]!
        const dummy = P(lx, ly)
        blocked[at(dummy.x, dummy.y)] = 1
        dummies.push(dummy)
        room.stations.push({ cls, stand: P(lx, ly + 1), dummy })
      })
    } else {
      // Project room (or sealed): banners, loot in the corners, fighters by the door.
      deco(2, 0, TILE.banner)
      deco(ROOM_W - 3, 0, TILE.banner)
      deco(1, 1, random() < 0.5 ? TILE.chest : TILE.chestBig)
      deco(ROOM_W - 2, 1, random() < 0.5 ? TILE.barrel : TILE.crate)
      if (kind === 'sealed') deco(5, 4, TILE.tomb)
      else blocked[at(room.monster.x, room.monster.y)] = 1
      room.slots = [5, 6, 7].flatMap(ly => [0, -2, 2, -4, 4].map(d => P(5 + d, ly)))
    }
    rooms.push(room)
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
    dummies,
    fire,
    seats,
    gate,
    spawn,
    corridorY,
    room: kind => rooms.find(r => r.kind === kind)!,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && floor[at(x, y)]! >= 0 && !blocked[at(x, y)],
  }
}
