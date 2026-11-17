/**
 * Builds the tile map from the list of active projects:
 *
 *   ┌────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
 *   │ Caverna│ │ Taverna │ │ Treino  │ │ Ouro    │ │ proj. 1 │   rooms alternate above
 *   │  (🔥)  ├─┴──door───┴─┴──door───┴─┴──door───┴─┴──door───┴── and below the corridor
 *   │        │  corridor
 *   │ Portão │ ┌──door───┐ ┌──door───┐ ┌──door───┐ ┌──door───┐
 *   └───┬────┘ │  Jogos  │ │Biblioteca││ proj. 0 │ │ proj. 2 │
 *  ~~~~~┴~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *   floresta: trails, trees, a pond. Heroes arrive and leave through it.
 *
 * The guild's own rooms come first, then one room per project. Two guild
 * rooms belong to a project (`GUILD_ROOMS[].project`): a session in that
 * project works there instead of in a room of its own. Each room is laid out
 * in local coordinates, row 0 at the back wall and row 9 at the door, and
 * mirrored for rooms below the corridor.
 *
 * Things the tile sheet does not have (trees, bookshelves, gold, targets) are
 * `props`, drawn by the renderer (props.ts) at a tile.
 *
 * Deterministic: the same rooms always give the same map, so rebuilding it
 * when a project appears does not reshuffle the decoration.
 */
import { GUILD_MEMBERS, hashString, type ClassId } from '../../shared/guild'
import type { Grid, Point } from './pathfinding'
import { FLOOR, POTIONS, STAFFS, TILE } from './tiles'

export const ROOM_W = 11
export const ROOM_H = 10
const CAVE_W = 16
const CORRIDOR_H = 3
const FOREST_H = 11
const FIRST_ROOM_X = CAVE_W + 2
/** Rooms drawn even with few projects, so the dungeon never looks empty. */
const MIN_ROOMS = 6

export type RoomKind = 'taverna' | 'jogos' | 'treino' | 'estudos' | 'tesouro' | 'project' | 'sealed'

/**
 * The guild's rooms, in map order, with the name on their sign. A room with a
 * `project` is that project's home: its sessions work there.
 */
export const GUILD_ROOMS: readonly { kind: RoomKind; name: string; project?: string }[] = [
  { kind: 'taverna', name: 'Taverna' },
  { kind: 'jogos', name: 'Sala de jogos' },
  { kind: 'treino', name: 'Sala de treinamento' },
  { kind: 'estudos', name: 'Biblioteca', project: 'Estudos' },
  { kind: 'tesouro', name: 'Câmara de ouro', project: 'Invest' },
]

/** Projects that live in a guild room instead of getting a room of their own. */
export const PROJECT_HOMES: ReadonlyMap<string, RoomKind> = new Map(
  GUILD_ROOMS.filter(r => r.project).map(r => [r.project!, r.kind]),
)

/** A game table in the sala de jogos: two players face each other across it. */
export interface GameTable {
  center: Point
  seats: [Point, Point]
}

export type TargetKind = 'dummy' | 'archery' | 'daggers' | 'crystal' | 'orb'

/** A training spot: a class member stands at `stand` and hits (or shoots at) the target. */
export interface Station {
  cls: ClassId
  stand: Point
  target: Point
  kind: TargetKind
}

export type PropKind =
  // forest
  | 'tree'
  | 'pine'
  | 'bush'
  | 'flowers'
  | 'mushrooms'
  | 'log'
  | 'reeds'
  | 'stump'
  // taverna
  | 'fireplace'
  | 'mugs'
  | 'rug'
  | 'lantern'
  | 'menu'
  // sala de jogos
  | 'rpgtable'
  | 'poster'
  | 'dartboard'
  | 'gameshelf'
  | 'd20'
  // treino
  | TargetKind
  | 'runes'
  // biblioteca
  | 'bookshelf'
  | 'readtable'
  | 'dissection'
  | 'cauldron'
  | 'labbench'
  | 'jars'
  | 'skull'
  // tesouro
  | 'gold'
  | 'coins'
  | 'tradetable'
  | 'ticker'
  | 'scale'

export interface Prop {
  kind: PropKind
  x: number
  y: number
  /** Small variations (size of a gold pile, tree shade...). */
  variant: number
}

export type ResidentId = 'taverneiro' | 'alquimista' | 'mercador'

/** Someone who never leaves their room: they work there all day. */
export interface Resident {
  id: ResidentId
  at: Point
  /** What they work on: the tile they lean toward. */
  workAt: Point
}

export type ForestActivity = 'pescar' | 'ervas' | 'descansar' | 'passear'

export interface ForestSpot {
  at: Point
  activity: ForestActivity
  /** The tile the hero faces (the pond, the herbs, the log). */
  facing?: Point
}

export interface RoomLayout {
  kind: RoomKind
  /** Project name, or the guild room's name; empty for a sealed room. */
  name: string
  /** The project that works in this guild room, if any. */
  project?: string
  x: number
  y: number
  isTop: boolean
  door: Point
  /** Project rooms: where the monster stands. */
  monster: Point
  /** What people at work lean toward: the monster, or the room's table. */
  focus: Point
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
  props: Prop[]
  residents: Resident[]
  forest: ForestSpot[]
  fire: Point
  seats: Point[]
  gate: Point
  /** Where heroes come in from and go out to: the forest's edge. */
  spawn: Point
  corridorY: number
  /** First row of the forest. */
  forestY: number
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

/**
 * A stable pseudo-random value per tile. The forest uses it instead of the
 * seeded sequence, so a tree stays where it is when a new project widens the map.
 */
function noise(x: number, y: number, k = 0): number {
  return (hashString(`${x},${y},${k}`) % 10_000) / 10_000
}

/** Where each class trains: target and stand in room coordinates, and the kind of target. */
const TRAINING: Record<(typeof GUILD_MEMBERS)[number], { target: [number, number]; stand: [number, number]; kind: TargetKind }> = {
  mago: { target: [2, 1], stand: [2, 4], kind: 'crystal' },
  ladino: { target: [5, 1], stand: [5, 4], kind: 'daggers' },
  arquimago: { target: [8, 1], stand: [8, 4], kind: 'orb' },
  guerreiro: { target: [2, 6], stand: [2, 7], kind: 'dummy' },
  clerigo: { target: [5, 6], stand: [5, 7], kind: 'dummy' },
  bardo: { target: [8, 6], stand: [8, 8], kind: 'archery' },
}

export function buildMap(projects: readonly string[]): GameMap {
  const own = projects.filter(p => !PROJECT_HOMES.has(p))
  const named = [...GUILD_ROOMS, ...own.map(name => ({ kind: 'project' as RoomKind, name, project: undefined }))]
  const roomCount = Math.max(MIN_ROOMS, named.length + (named.length % 2))
  const columns = Math.ceil(roomCount / 2)
  const cols = FIRST_ROOM_X + columns * (ROOM_W + 1) + 1
  const corridorY = 1 + ROOM_H
  const dungeonRows = corridorY + CORRIDOR_H + ROOM_H + 1
  const forestY = dungeonRows - 1
  const rows = dungeonRows + FOREST_H

  const size = cols * rows
  const floor = new Int16Array(size).fill(-1)
  const deco = new Int16Array(size).fill(-1)
  const blocked = new Uint8Array(size)
  const at = (x: number, y: number) => y * cols + x
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows
  const random = rng(hashString(own.join('|')))
  const props: Prop[] = []
  const residents: Resident[] = []

  const setFloor = (x: number, y: number, tile: number) => (floor[at(x, y)] = tile)
  const setDeco = (x: number, y: number, tile: number, solid = true) => {
    deco[at(x, y)] = tile
    if (solid) blocked[at(x, y)] = 1
  }
  const addProp = (kind: PropKind, p: Point, solid: boolean, variant = 0) => {
    props.push({ kind, x: p.x, y: p.y, variant })
    if (solid) blocked[at(p.x, p.y)] = 1
  }
  const sand = () => (random() < 0.8 ? TILE.sand : TILE.sandAlt)

  // ---- the cave: an ellipse of dirt with pebbles, a campfire and the gate ----
  const caveCenter = { x: CAVE_W / 2, y: dungeonRows / 2 }
  const rx = CAVE_W / 2 - 0.5
  const ry = dungeonRows / 2 - 1
  for (let y = 1; y < dungeonRows - 1; y++) {
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

  // The gate: an open door at the bottom of the cave, out to the forest.
  const gate = { x: fire.x, y: dungeonRows - 3 }
  for (let y = gate.y; y < forestY; y++) {
    setFloor(gate.x, y, TILE.dirt)
    deco[at(gate.x, y)] = -1
    blocked[at(gate.x, y)] = 0
  }
  deco[at(gate.x, gate.y + 1)] = TILE.door

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
    const { kind, name, project } = named[i] ?? { kind: 'sealed' as RoomKind, name: '', project: undefined }
    /** Local (lx, ly) -> map tile; ly 0 is the back wall, ly 9 the door's wall. */
    const P = (lx: number, ly: number): Point => ({ x: x + lx, y: isTop ? y + ly : y + ROOM_H - 1 - ly })
    const deco = (lx: number, ly: number, tile: number, solid = true) => {
      const p = P(lx, ly)
      setDeco(p.x, p.y, tile, solid)
    }
    const prop = (kind: PropKind, lx: number, ly: number, solid = true, variant = 0) => addProp(kind, P(lx, ly), solid, variant)
    const door = P(5, ROOM_H - 1)
    const floorTile =
      kind === 'taverna' || kind === 'jogos' || kind === 'estudos'
        ? () => FLOOR.wood
        : kind === 'tesouro'
          ? () => FLOOR.gold
          : sand

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

    const room: RoomLayout = {
      kind,
      name,
      project,
      x,
      y,
      isTop,
      door,
      monster: P(5, 3),
      focus: P(5, 3),
      slots: [],
      tables: [],
      stations: [],
    }

    if (kind === 'taverna') {
      // Bar counter with the barkeep behind it, bottles on the wall, a fireplace, three tables.
      prop('rug', 5, 4, false)
      POTIONS.slice(0, 3).forEach((tile, k) => deco(1 + k, 0, tile))
      deco(1, 1, TILE.barrel)
      deco(3, 1, TILE.barrel)
      for (const lx of [1, 2, 3]) deco(lx, 2, TILE.crateAlt)
      residents.push({ id: 'taverneiro', at: P(2, 1), workAt: P(2, 2) })
      blocked[at(P(2, 1).x, P(2, 1).y)] = 1
      prop('menu', 4, 0, true)
      prop('fireplace', 6, 0, true)
      prop('lantern', 8, 0, true)
      deco(9, 0, TILE.banner)
      deco(9, 1, TILE.barrel)
      deco(9, 2, TILE.crate)
      for (const [lx, ly] of [[7, 3], [3, 6], [7, 6]] as const) {
        deco(lx, ly, TILE.table)
        prop('mugs', lx, ly, true, lx + ly)
      }
      // Spots two tiles apart come first, so a few drinkers' name tags don't overlap.
      room.slots = [P(2, 3), P(6, 3), P(2, 6), P(6, 6), P(8, 3), P(4, 6), P(8, 6), P(4, 3), P(3, 3)]
      for (const slot of room.slots.slice(0, 7)) setDeco(slot.x, slot.y, TILE.stool, false)
    } else if (kind === 'jogos') {
      deco(2, 0, TILE.banner)
      prop('poster', 4, 0, true)
      prop('gameshelf', 5, 0, true)
      prop('dartboard', 6, 0, true)
      deco(8, 0, TILE.banner)
      deco(1, 1, TILE.chest)
      deco(9, 1, TILE.crate)
      prop('d20', 1, 8, true)
      prop('d20', 9, 8, true, 1)
      for (const [lx, ly] of [[7, 6], [3, 3], [7, 3], [3, 6]] as const) {
        const center = P(lx, ly)
        setDeco(center.x, center.y, TILE.table)
        room.tables.push({ center, seats: [P(lx - 1, ly), P(lx + 1, ly)] })
      }
      // The first table (pairs sit there first) is a whole Masmorras & Dragões campaign: map, minis and the master's screen.
      addProp('rpgtable', room.tables[0]!.center, true)
    } else if (kind === 'treino') {
      // A weapon rack and staffs on the back wall, a rune circle, one target per class.
      TILE.weapons.forEach((tile, k) => deco(1 + k * 2, 0, tile))
      deco(9, 0, STAFFS[0])
      prop('runes', 8, 4, false)
      deco(1, 8, TILE.barrel)
      deco(9, 8, TILE.crate)
      for (const cls of GUILD_MEMBERS) {
        const spot = TRAINING[cls]
        const target = P(...spot.target)
        addProp(spot.kind, target, true)
        room.stations.push({ cls, stand: P(...spot.stand), target, kind: spot.kind })
      }
    } else if (kind === 'estudos') {
      // A library on the left, a lab on the right, and a monster half dissected on the slab.
      for (const lx of [1, 2, 3, 4]) prop('bookshelf', lx, 1, true, lx)
      prop('readtable', 3, 4, true)
      prop('readtable', 3, 7, true, 1)
      for (const lx of [7, 8, 9]) prop('labbench', lx, 1, true, lx)
      prop('cauldron', 9, 3, true)
      prop('dissection', 8, 5, true)
      prop('jars', 9, 7, true)
      prop('skull', 9, 8, true)
      deco(6, 0, TILE.banner)
      residents.push({ id: 'alquimista', at: P(7, 5), workAt: P(8, 5) })
      blocked[at(P(7, 5).x, P(7, 5).y)] = 1
      room.focus = P(3, 4)
      room.slots = [P(2, 4), P(4, 4), P(2, 7), P(4, 7), P(6, 3), P(6, 7), P(5, 5)]
    } else if (kind === 'tesouro') {
      // Gold everywhere, a ticker on the wall, and the trading table where the merchant never stops.
      prop('ticker', 5, 0, true)
      deco(2, 0, TILE.banner)
      deco(8, 0, TILE.banner)
      prop('gold', 1, 1, true, 2)
      prop('gold', 9, 1, true, 2)
      prop('gold', 2, 1, true, 0)
      prop('gold', 1, 8, true, 1)
      prop('gold', 9, 8, true, 1)
      deco(1, 4, TILE.chestBig)
      deco(9, 4, TILE.chestGold)
      deco(9, 6, TILE.mimic)
      deco(1, 6, TILE.chest)
      prop('scale', 8, 2, true)
      for (const [lx, ly] of [[3, 2], [7, 7], [2, 7], [6, 1], [4, 8]] as const) prop('coins', lx, ly, false, lx)
      for (const lx of [4, 5, 6]) blocked[at(P(lx, 4).x, P(lx, 4).y)] = 1
      prop('tradetable', 5, 4, false)
      residents.push({ id: 'mercador', at: P(5, 3), workAt: P(5, 4) })
      blocked[at(P(5, 3).x, P(5, 3).y)] = 1
      room.focus = P(5, 4)
      room.slots = [P(3, 4), P(7, 4), P(4, 5), P(6, 5), P(3, 6), P(7, 6)]
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

  // ---- the forest, outside the gate ----
  const forest = buildForest()

  function buildForest(): ForestSpot[] {
    const bottom = rows - 1
    for (let y = forestY; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (floor[at(x, y)] === -1) setFloor(x, y, noise(x, y) < 0.75 ? FLOOR.grass : FLOOR.grassAlt)
      }
    }
    const trail = new Set<number>()
    const path = (x: number, y: number) => {
      setFloor(x, y, TILE.dirt)
      trail.add(at(x, y))
    }
    // The trail: down from the gate, then along the forest from edge to edge, winding a little.
    const trailY = forestY + 3
    const wind = (x: number) => trailY + Math.round(Math.sin(x * 0.23) * 0.9)
    for (let y = forestY; y <= wind(gate.x); y++) path(gate.x, y)
    for (let x = 0; x < cols; x++) {
      const y = wind(x)
      path(x, y)
      const next = wind(x + 1)
      if (next !== y && x + 1 < cols) path(x, next) // no diagonal gaps
    }

    // A pond with reeds, below the trail.
    const pond = { x: FIRST_ROOM_X + 7, y: trailY + 5 }
    const water = new Set<number>()
    for (let y = trailY + 2; y < bottom; y++) {
      for (let x = pond.x - 5; x <= pond.x + 5; x++) {
        const dx = (x + 0.5 - pond.x) / 3.6
        const dy = (y + 0.5 - pond.y) / 1.9
        if (dx * dx + dy * dy <= 1) {
          setFloor(x, y, FLOOR.water)
          blocked[at(x, y)] = 1
          water.add(at(x, y))
        }
      }
    }
    const spots: ForestSpot[] = []
    for (const dx of [-2, 1]) {
      const x = pond.x + dx
      let y = trailY + 1
      while (y < bottom && !water.has(at(x, y + 1))) y++
      spots.push({ at: { x, y }, activity: 'pescar', facing: { x, y: y + 1 } })
    }
    addProp('reeds', { x: pond.x - 4, y: pond.y }, true)
    addProp('reeds', { x: pond.x + 4, y: pond.y - 1 }, true, 1)

    // An herb patch near the cave, a fallen log to sit on, a few spots along the trail.
    const herbs = { x: gate.x + 4, y: trailY + 3 }
    addProp('mushrooms', herbs, false)
    addProp('flowers', { x: herbs.x + 1, y: herbs.y }, false, 1)
    spots.push({ at: { x: herbs.x - 1, y: herbs.y }, activity: 'ervas', facing: herbs })
    spots.push({ at: { x: herbs.x + 2, y: herbs.y }, activity: 'ervas', facing: { x: herbs.x + 1, y: herbs.y } })
    const log = { x: FIRST_ROOM_X + 17, y: trailY + 3 }
    addProp('log', log, true)
    spots.push({ at: { x: log.x - 1, y: log.y }, activity: 'descansar', facing: log })
    spots.push({ at: { x: log.x + 1, y: log.y }, activity: 'descansar', facing: log })
    addProp('stump', { x: log.x + 6, y: trailY - 2 }, true)
    for (const x of [3, FIRST_ROOM_X + 24, FIRST_ROOM_X + 31]) {
      if (x < cols - 2) spots.push({ at: { x, y: wind(x) + (x % 2 === 0 ? 1 : -1) }, activity: 'passear' })
    }

    // Keep the trail, the spots and the way from the trail to each spot free of trees.
    const keep = new Set(trail)
    for (const spot of spots) {
      const step = spot.at.y > wind(spot.at.x) ? -1 : 1
      for (let y = spot.at.y; y !== wind(spot.at.x); y += step) keep.add(at(spot.at.x, y))
      for (const dx of [0, 1, -1]) keep.add(at(spot.at.x + dx, spot.at.y))
    }
    const taken = new Set(props.map(p => at(p.x, p.y)))
    for (let y = forestY; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = at(x, y)
        if (keep.has(i) || water.has(i) || taken.has(i) || floor[i]! < 1000) continue
        const nearTrail = trail.has(at(x, y - 1)) || trail.has(at(x, y + 1))
        const edge = y === bottom || x === 0 || x === cols - 1
        const roll = noise(x, y, 1)
        const look = noise(x, y, 2)
        if (edge || (!nearTrail && roll < 0.2)) addProp(look < 0.45 ? 'pine' : 'tree', { x, y }, true, Math.floor(look * 3))
        else if (roll < 0.26) addProp('bush', { x, y }, false, Math.floor(look * 2))
        else if (roll < 0.31) addProp('flowers', { x, y }, false, Math.floor(look * 3))
        else if (roll < 0.33) addProp('mushrooms', { x, y }, false)
      }
    }
    return spots.filter(s => inside(s.at.x, s.at.y) && !blocked[at(s.at.x, s.at.y)])
  }
  const spawn = { x: 0, y: forestY + 3 + Math.round(Math.sin(0) * 0.9) }

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
      const free = floor[at(sx, sy)] === TILE.dirt && !blocked[at(sx, sy)] && sy < gate.y
      if (free && !seats.some(s => s.x === sx && s.y === sy)) seats.push({ x: sx, y: sy })
    }
  }

  // Whatever is left is solid rock, so the map has no black gaps.
  for (let i = 0; i < size; i++) {
    if (floor[i] === -1) {
      floor[i] = FLOOR.rock
      blocked[i] = 1
    }
  }

  return {
    cols,
    rows,
    floor,
    deco,
    blocked,
    rooms,
    props,
    residents,
    forest,
    fire,
    seats,
    gate,
    spawn,
    corridorY,
    forestY,
    room: kind => rooms.find(r => r.kind === kind)!,
    isWalkable: (x, y) => inside(x, y) && floor[at(x, y)]! >= 0 && !blocked[at(x, y)],
  }
}
