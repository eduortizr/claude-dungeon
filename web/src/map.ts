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

const BLEND = [FLOOR.blend0, FLOOR.blend1, FLOOR.blend2, FLOOR.blend3, FLOOR.blend4, FLOOR.blend5] as const

export const ROOM_W = 11
export const ROOM_H = 10
/** A project room is an arena wider than two guild rooms put together: space for dozens of fighters without a queue. */
export const ARENA_W = ROOM_W * 2 + 7
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

/** The round table in the sala de jogos: the Mestre sits at its head, the players take the seats around it. */
export interface GameTable {
  center: Point
  seats: Point[]
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
  | 'roundtable'
  | 'dragonhead'
  | 'griffonhead'
  | 'basiliskhead'
  | 'armorstand'
  | 'wallarmor'
  | 'd20'
  // treino
  | TargetKind
  | 'runes'
  | 'scratches'
  | 'soot'
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
  | 'wallmap'
  | 'wallchart'
  | 'maptable'
  // decoration
  | 'torch'
  | 'spikes'
  | 'cobweb'
  | 'bones'
  | 'plant'
  | 'fern'
  | 'stage'
  | 'lamppost'

export interface Prop {
  kind: PropKind
  x: number
  y: number
  /** Small variations (size of a gold pile, tree shade...). */
  variant: number
}

export type ResidentId = 'taverneiro' | 'alquimista' | 'mercador' | 'mestre' | 'menestrel'

/** Someone who never leaves their room: they work there all day. */
export interface Resident {
  id: ResidentId
  at: Point
  /** What they work on: the tile they lean toward. */
  workAt: Point
  /** Places they walk to now and then (the merchant studies the charts), each with the tile they look at. */
  stops?: { at: Point; facing: Point }[]
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
  /** Width in tiles: ROOM_W, or ARENA_W for a project's arena. */
  w: number
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
  /** Where a guild member on its break stands (taverna; in the sala de jogos, the last seats at the round table). */
  guests: Point[]
  /** The tile guests face (the round table, the stage). */
  guestFacing?: Point
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
  /** Every door that opens and closes: the rooms' and the cave's gate. */
  doors: Point[]
  /** The pond's center, in tiles, and the trail's row at a column (for the wildlife). */
  pond: Point
  trailAt(x: number): number
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

/** Seats around the sala de jogos' round table (room coordinates), spread out so a few players do not bunch up; the Mestre's seat is (5, 3). */
const SEATS: readonly (readonly [number, number])[] = [
  [7, 4], [3, 4], [7, 6], [3, 6], [5, 7], [4, 7], [6, 7], [4, 3], [6, 3], [3, 5], [7, 5],
]

/** Where each class trains: target and stand in room coordinates, and the kind of target. */
const TRAINING: Record<(typeof GUILD_MEMBERS)[number], { target: [number, number]; stand: [number, number]; kind: TargetKind }> = {
  mago: { target: [2, 1], stand: [2, 4], kind: 'crystal' },
  ladino: { target: [5, 1], stand: [5, 4], kind: 'daggers' },
  arquimago: { target: [8, 1], stand: [8, 4], kind: 'orb' },
  guerreiro: { target: [2, 6], stand: [2, 7], kind: 'dummy' },
  clerigo: { target: [5, 6], stand: [5, 7], kind: 'dummy' },
  bardo: { target: [8, 6], stand: [8, 8], kind: 'archery' },
}

/** `minCols`: the map is never narrower than this; the extra space on the right is filled with rock like any other empty space. */
export function buildMap(projects: readonly string[], options: { minCols?: number } = {}): GameMap {
  const own = projects.filter(p => !PROJECT_HOMES.has(p))
  const named = [...GUILD_ROOMS, ...own.map(name => ({ kind: 'project' as RoomKind, name, project: undefined }))]
  const roomCount = Math.max(MIN_ROOMS, named.length)
  // Rooms alternate above/below the corridor; each side lays its own rooms left to right.
  const roomX: number[] = []
  const roomW: number[] = []
  const cursor = [FIRST_ROOM_X, FIRST_ROOM_X]
  for (let i = 0; i < roomCount; i++) {
    const side = i % 2
    roomW.push(named[i]?.kind === 'project' ? ARENA_W : ROOM_W)
    roomX.push(cursor[side]!)
    cursor[side] = cursor[side]! + roomW[i]! + 1
  }
  const cols = Math.max(Math.max(cursor[0]!, cursor[1]!) + 1, options.minCols ?? 0)
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
  const doors: Point[] = []
  const trailRow = forestY + 3
  const wind = (x: number) => trailRow + Math.round(Math.sin(x * 0.23) * 0.9)
  let pond: Point = { x: 0, y: 0 }

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
  doors.push({ x: gate.x, y: gate.y + 1 }) // a door the renderer opens and closes

  // Supplies around the camp.
  const supplies: [number, number, number][] = [
    [fire.x - 4, fire.y - 3, TILE.barrel],
    [fire.x - 3, fire.y - 4, TILE.crate],
    [fire.x + 4, fire.y - 3, TILE.chest],
    [fire.x + 3, fire.y + 5, TILE.anvil],
    [fire.x - 4, fire.y + 5, TILE.barrel],
  ]
  for (const [x, y, tile] of supplies) if (floor[at(x, y)] === TILE.dirt) setDeco(x, y, tile)
  // Bones and a few ferns on the cave floor; by tile noise, so the rooms' random sequence is untouched.
  for (let y = 2; y < gate.y - 1; y++) {
    for (let x = 2; x < CAVE_W - 1; x++) {
      if (floor[at(x, y)] !== TILE.dirt || blocked[at(x, y)] || deco[at(x, y)]! >= 0 || x === gate.x) continue
      if (noise(x, y, 5) < 0.025) addProp('bones', { x, y }, false, Math.floor(noise(x, y, 6) * 3))
      else if (noise(x, y, 7) < 0.02) addProp('fern', { x, y }, false)
    }
  }

  // ---- the corridor, from the cave mouth to the last room ----
  for (let y = corridorY; y < corridorY + CORRIDOR_H; y++) {
    for (let x = Math.floor(caveCenter.x); x < cols - 1; x++) {
      if (floor[at(x, y)] !== TILE.dirt) setFloor(x, y, sand())
      deco[at(x, y)] = -1
      blocked[at(x, y)] = 0
    }
  }

  // Where the cave's dirt meets the corridor's sand, the edge fades: a few tiles that go from mostly dirt to mostly sand.
  const lastDirt: number[] = []
  for (let y = corridorY; y < corridorY + CORRIDOR_H; y++) {
    let edge = Math.floor(caveCenter.x)
    while (floor[at(edge + 1, y)] === TILE.dirt) edge++
    lastDirt.push(edge)
    BLEND.forEach((tile, step) => setFloor(edge - 2 + step, y, tile))
  }
  for (const dx of [-1, 1]) addProp('lamppost', { x: gate.x + dx, y: forestY + 1 }, true) // the way out to the forest

  // ---- the rooms ----
  const rooms: RoomLayout[] = []
  for (let i = 0; i < roomCount; i++) {
    const isTop = i % 2 === 0
    const x = roomX[i]!
    const w = roomW[i]!
    const cx = Math.floor(w / 2)
    const y = isTop ? 1 : corridorY + CORRIDOR_H
    const { kind, name, project } = named[i] ?? { kind: 'sealed' as RoomKind, name: '', project: undefined }
    /** Local (lx, ly) -> map tile; ly 0 is the back wall, ly 9 the door's wall. */
    const P = (lx: number, ly: number): Point => ({ x: x + lx, y: isTop ? y + ly : y + ROOM_H - 1 - ly })
    const deco = (lx: number, ly: number, tile: number, solid = true) => {
      const p = P(lx, ly)
      setDeco(p.x, p.y, tile, solid)
    }
    const prop = (kind: PropKind, lx: number, ly: number, solid = true, variant = 0) => addProp(kind, P(lx, ly), solid, variant)
    const door = P(cx, ROOM_H - 1)
    const floorTile =
      kind === 'taverna' || kind === 'jogos' || kind === 'estudos'
        ? () => FLOOR.wood
        : kind === 'tesouro'
          ? () => FLOOR.gold
          : sand

    for (let ty = y; ty < y + ROOM_H; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const isWall = ty === y || ty === y + ROOM_H - 1 || tx === x || tx === x + w - 1
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
      doors.push(door)
    }

    const room: RoomLayout = {
      kind,
      name,
      project,
      x,
      y,
      w,
      isTop,
      door,
      monster: P(cx, 3),
      focus: P(cx, 3),
      slots: [],
      tables: [],
      stations: [],
      guests: [],
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
      room.slots = [P(2, 3), P(6, 3), P(2, 6), P(6, 6), P(8, 3), P(4, 6), P(4, 8), P(4, 3), P(3, 3)]
      // The minstrel's little stage against the back wall, and a plant in the other corner.
      prop('stage', 8, 4, false)
      residents.push({ id: 'menestrel', at: P(8, 4), workAt: P(7, 4) })
      blocked[at(P(8, 4).x, P(8, 4).y)] = 1
      prop('plant', 1, 8, true)
      room.guests = [P(3, 8), P(7, 8)]
      room.guestFacing = P(8, 4)
      for (const slot of room.slots.slice(0, 7)) setDeco(slot.x, slot.y, TILE.stool, false)
    } else if (kind === 'jogos') {
      // Trophies on the back wall: a griffin, a dragon and a basilisk, between two suits of armor.
      deco(2, 0, TILE.banner)
      deco(8, 0, TILE.banner)
      prop('wallarmor', 1, 0, true)
      prop('griffonhead', 3, 0, true)
      prop('dragonhead', 5, 0, true)
      prop('basiliskhead', 7, 0, true)
      prop('wallarmor', 9, 0, true, 1)
      deco(1, 1, TILE.chest)
      deco(9, 1, TILE.crate)
      prop('armorstand', 1, 2, true)
      prop('armorstand', 9, 2, true, 1)
      prop('d20', 1, 8, true)
      prop('d20', 9, 8, true, 1)
      prop('plant', 1, 4, true, 1)
      prop('plant', 9, 4, true)
      // One big round table (3x3 tiles). The Mestre do Claude sits at its head, with his dragon;
      // everyone else sits around it. Heroes take the first seats, guild members the last ones.
      const center = P(5, 5)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked[at(P(5 + dx, 5 + dy).x, P(5 + dx, 5 + dy).y)] = 1
      addProp('roundtable', center, true)
      residents.push({ id: 'mestre', at: P(5, 3), workAt: P(5, 4) })
      blocked[at(P(5, 3).x, P(5, 3).y)] = 1
      const seats = SEATS.map(([lx, ly]) => P(lx, ly))
      room.tables.push({ center, seats })
      room.guests = seats.slice(-2)
      room.guestFacing = center
    } else if (kind === 'treino') {
      // A weapon rack and staffs on the back wall, a rune circle, one target per class.
      TILE.weapons.forEach((tile, k) => deco(1 + k * 2, 0, tile))
      deco(9, 0, STAFFS[0])
      prop('runes', 8, 4, false)
      deco(1, 8, TILE.barrel)
      deco(9, 8, TILE.crate)
      // Years of training: claw marks on the floor and walls, soot where the spells hit.
      for (const [lx, ly, v] of [[3, 6, 0], [6, 7, 1], [1, 5, 2], [4, 5, 3], [7, 7, 0], [9, 6, 1]] as const) prop('scratches', lx, ly, false, v)
      for (const [lx, ly, v] of [[4, 0, 4], [6, 0, 5], [0, 3, 6], [10, 6, 7], [0, 7, 6]] as const) prop('scratches', lx, ly, false, v)
      for (const [lx, ly, v] of [[2, 2, 0], [1, 1, 1], [3, 1, 2], [8, 2, 0], [9, 1, 1], [7, 1, 2], [2, 3, 3], [8, 3, 3]] as const) prop('soot', lx, ly, false, v)
      for (const lx of [2, 8]) prop('soot', lx, 0, false, 4)
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
      prop('cobweb', 1, 1, false, isTop ? 0 : 2)
      prop('cobweb', ROOM_W - 2, 1, false, isTop ? 1 : 3)
      prop('fern', 1, 8, true)
      residents.push({ id: 'alquimista', at: P(7, 5), workAt: P(8, 5) })
      blocked[at(P(7, 5).x, P(7, 5).y)] = 1
      room.focus = P(3, 4)
      room.slots = [P(2, 4), P(4, 4), P(2, 7), P(4, 7), P(6, 3), P(6, 7), P(5, 5)]
    } else if (kind === 'tesouro') {
      // Gold everywhere, a ticker on the wall, and the trading table where the merchant never stops.
      prop('ticker', 5, 0, true)
      deco(2, 0, TILE.banner)
      deco(8, 0, TILE.banner)
      // Maps and charts on the walls, and a side table with a map spread out: the merchant studies them.
      prop('wallmap', 1, 0, true)
      prop('wallchart', 3, 0, true)
      prop('wallchart', 7, 0, true, 1)
      prop('wallmap', 9, 0, true, 1)
      prop('maptable', 8, 7, true)
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
      for (const [lx, ly] of [[3, 2], [6, 7], [2, 7], [6, 1], [4, 8]] as const) prop('coins', lx, ly, false, lx)
      for (const lx of [4, 5, 6]) blocked[at(P(lx, 4).x, P(lx, 4).y)] = 1
      prop('tradetable', 5, 4, false)
      residents.push({
        id: 'mercador',
        at: P(5, 3),
        workAt: P(5, 4),
        stops: [
          { at: P(3, 1), facing: P(3, 0) },
          { at: P(7, 1), facing: P(7, 0) },
          { at: P(7, 7), facing: P(8, 7) },
        ],
      })
      room.focus = P(5, 4)
      room.slots = [P(3, 4), P(7, 4), P(4, 5), P(6, 5), P(3, 6), P(7, 6)]
    } else {
      // Project room (or sealed): banners, loot in the corners, fighters by the door.
      deco(2, 0, TILE.banner)
      deco(w - 3, 0, TILE.banner)
      deco(1, 1, random() < 0.5 ? TILE.chest : TILE.chestBig)
      deco(w - 2, 1, random() < 0.5 ? TILE.barrel : TILE.crate)
      if (kind === 'sealed') {
        deco(5, 4, TILE.tomb)
        room.slots = [P(5, 6)] // behind the wall: nobody can get there
      } else {
        blocked[at(room.monster.x, room.monster.y)] = 1
        // Torches on the back wall, spikes and bones on the floor: decoration only, nothing blocks the way.
        for (const d of [-10, -5, 5, 10]) prop('torch', cx + d, 0, false)
        for (const d of [-7, -6, 6, 7]) prop('spikes', cx + d, 2, false, d)
        for (const d of [-11, 11]) prop('spikes', cx + d, 8, false, d)
        // Cobwebs hang in the corners of the back wall (bit 0 = right, bit 1 = the wall is at the bottom).
        prop('cobweb', 1, 1, false, isTop ? 0 : 2)
        prop('cobweb', w - 2, 1, false, isTop ? 1 : 3)
        prop('bones', 2, 7, false, 0)
        prop('bones', w - 3, 5, false, 1)
        prop('bones', cx - 3, 2, false, 2)
        // The fighters' spots: staggered rows, nearest the monster first, so a crowd
        // fans out around it and nobody shares a tile.
        const spots: { p: Point; d: number }[] = []
        for (let ly = 4; ly <= 8; ly++) {
          for (let d = -(cx - 2); d <= cx - 2; d++) {
            if ((d + ly) % 2 !== 0) continue
            if (ly === 8 && Math.abs(d) < 3) continue // keep the way from the door clear
            spots.push({ p: P(cx + d, ly), d: Math.hypot(d * 0.8, (ly - 3) * 1.6) })
          }
        }
        room.slots = spots.sort((a, b) => a.d - b.d || a.p.x - b.p.x).map(s => s.p)
      }
    }
    rooms.push(room)
  }

  // Torches along the corridor, on the walls above and below it (never next to a door).
  const torchFrom = Math.max(...lastDirt) + 3
  for (let x = torchFrom, n = 0; x < cols - 2; x += 5, n++) {
    for (const wallY of [corridorY - 1, corridorY + CORRIDOR_H]) {
      const nearDoor = [-1, 0, 1].some(dx => floor[at(x + dx, wallY)] !== -1 && floor[at(x + dx, wallY)] !== TILE.wall)
      if (!nearDoor && (n + (wallY === corridorY - 1 ? 0 : 1)) % 2 === 0) addProp('torch', { x, y: wallY }, false)
    }
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
    const trailY = trailRow
    for (let y = forestY; y <= wind(gate.x); y++) path(gate.x, y)
    for (let x = 0; x < cols; x++) {
      const y = wind(x)
      path(x, y)
      const next = wind(x + 1)
      if (next !== y && x + 1 < cols) path(x, next) // no diagonal gaps
    }

    // A pond with reeds, below the trail.
    pond = { x: FIRST_ROOM_X + 7, y: trailY + 5 }
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
  const spawn = { x: 0, y: wind(0) }

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
    doors,
    pond,
    trailAt: wind,
    spawn,
    corridorY,
    forestY,
    room: kind => rooms.find(r => r.kind === kind)!,
    isWalkable: (x, y) => inside(x, y) && floor[at(x, y)]! >= 0 && !blocked[at(x, y)],
  }
}
