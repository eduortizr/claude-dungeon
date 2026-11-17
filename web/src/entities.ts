/**
 * What moves on the map: actors (heroes and their party members), the monster
 * guarding each busy room, and short-lived effects (slashes, damage numbers).
 * Positions are in tiles, as floats while walking.
 */
import type { ClassId } from '../../shared/guild'
import type { GameMap } from './map'
import { findPath, type Point } from './pathfinding'

const WALK_SPEED = 5 // tiles per second
const LUNGE_TIME = 0.18

export interface Bubble {
  text: string
  until: number
  isAlert?: boolean
}

export class Actor {
  x: number
  y: number
  facingLeft = false
  walkTime = 0
  lunge = 0
  lungeTo: Point = { x: 0, y: 0 }
  bubble?: Bubble
  /** Walking to the gate to leave the map; removed on arrival. */
  isLeaving = false
  isGone = false
  /** Hits (tool calls) already animated, to animate only new ones. */
  hitsSeen: number
  /** Not drawn (a training-room member whose class is out on a mission). */
  isHidden = false
  isSleeping = false
  /** Which way to face once standing still (at a game table). */
  restFacingLeft?: boolean
  /** Where the scene sent it last ('taverna', 'jogos', ...), to notice arrivals. */
  place?: string
  /** Guild class of a party member or a training-room member. */
  cls?: ClassId
  private path: Point[] = []
  private target?: Point

  constructor(
    readonly id: string,
    readonly heroId: string,
    public sprite: number,
    public label: string,
    public color: string,
    readonly isMember: boolean,
    start: Point,
    hitsSeen: number,
  ) {
    this.x = start.x
    this.y = start.y
    this.hitsSeen = hitsSeen
  }

  get isMoving(): boolean {
    return this.path.length > 0
  }

  get tile(): Point {
    return { x: Math.round(this.x), y: Math.round(this.y) }
  }

  hasTarget(target: Point): boolean {
    return this.target?.x === target.x && this.target.y === target.y
  }

  goTo(map: GameMap, target: Point, force = false): void {
    if (!force && this.hasTarget(target)) return
    this.target = target
    // From the next tile on the way if mid-step, so the walk stays on the grid.
    this.path = findPath(map, this.tile, target) ?? []
  }

  attack(toward: Point): void {
    this.lunge = LUNGE_TIME
    this.lungeTo = toward
    this.facingLeft = toward.x < this.x
  }

  update(dt: number): void {
    this.lunge = Math.max(0, this.lunge - dt)
    const next = this.path[0]
    if (!next) {
      this.walkTime = 0
      if (this.isLeaving) this.isGone = true
      if (this.restFacingLeft !== undefined && this.lunge === 0) this.facingLeft = this.restFacingLeft
      return
    }
    this.walkTime += dt
    const dx = next.x - this.x
    const dy = next.y - this.y
    const distance = Math.hypot(dx, dy)
    const step = WALK_SPEED * dt
    if (dx !== 0) this.facingLeft = dx < 0
    if (distance <= step) {
      this.x = next.x
      this.y = next.y
      this.path.shift()
    } else {
      this.x += (dx / distance) * step
      this.y += (dy / distance) * step
    }
  }

  /** Pixel offset of the current frame: a hop while walking, a lunge while attacking. */
  get offset(): Point {
    if (this.lunge > 0) {
      const t = Math.sin((this.lunge / LUNGE_TIME) * Math.PI) * 5
      const dx = this.lungeTo.x - this.x
      const dy = this.lungeTo.y - this.y
      const length = Math.hypot(dx, dy) || 1
      return { x: (dx / length) * t, y: (dy / length) * t }
    }
    if (this.walkTime > 0) return { x: 0, y: -Math.abs(Math.sin(this.walkTime * 12)) * 2 }
    return { x: 0, y: 0 }
  }
}

export class Monster {
  static readonly MAX_HP = 8
  hp = Monster.MAX_HP
  flash = 0
  /** Counts down after a kill; the monster respawns when it reaches 0. */
  respawnIn = 0
  generation = 0

  constructor(
    readonly room: string,
    public sprite: number,
    readonly at: Point,
  ) {}

  update(dt: number): boolean {
    this.flash = Math.max(0, this.flash - dt)
    if (this.respawnIn > 0) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0) {
        this.hp = Monster.MAX_HP
        return true // ask for a new look
      }
    }
    return false
  }

  get isAlive(): boolean {
    return this.respawnIn <= 0
  }
}

export interface Effect {
  kind: 'slash' | 'damage' | 'poof' | 'xp' | 'z'
  x: number
  y: number
  age: number
  ttl: number
  text?: string
  color?: string
}

export function updateEffects(effects: Effect[], dt: number): Effect[] {
  for (const effect of effects) effect.age += dt
  return effects.filter(effect => effect.age < effect.ttl)
}
