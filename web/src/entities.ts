/**
 * What moves on the map: actors (heroes and their party members), the monster
 * guarding each busy room, and short-lived effects (slashes, damage numbers).
 * Positions are in tiles, as floats while walking.
 */
import type { ClassId } from '../../shared/guild'
import type { GameMap, ResidentId } from './map'
import { findPath, type Point } from './pathfinding'

const WALK_SPEED = 5 // tiles per second
const LUNGE_TIME = 0.18
/** How long someone who just struck, rolled or spoke stays highlighted on the map. */
export const SPOTLIGHT_TIME = 0.7

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
  /** Set for the people who live in a room (taverneiro, alquimista, mercador). */
  residentId?: ResidentId
  /** Seconds left of the white flash after being hit by the monster. */
  hurt = 0
  /** Knockback in pixels, easing back to 0. */
  shove: Point = { x: 0, y: 0 }
  /** A little hop to the beat (the taverna's minstrel plays), in pixels. */
  hop = 0
  /** Seconds left of the highlight on whoever just acted (struck, rolled a die, spoke). */
  spot = 0
  /** The highlight is for a blow: an arrow shows over the one who struck. */
  spotStrike = false
  /** The bubble last seen, to notice a new line. */
  seenBubble?: Bubble
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

  /** Skips the walk: stands at the current target right away (when the map first opens). */
  arrive(): void {
    const end = this.path[this.path.length - 1]
    if (!end) return
    this.x = end.x
    this.y = end.y
    this.path = []
  }

  /** Puts the spotlight on this actor for a moment. */
  act(isStrike = false): void {
    this.spotStrike = isStrike || (this.spot > 0 && this.spotStrike) // a line said during a blow keeps the arrow
    this.spot = SPOTLIGHT_TIME
  }

  attack(toward: Point): void {
    this.lunge = LUNGE_TIME
    this.lungeTo = toward
    this.facingLeft = toward.x < this.x
  }

  update(dt: number): void {
    this.lunge = Math.max(0, this.lunge - dt)
    this.hurt = Math.max(0, this.hurt - dt)
    this.spot = Math.max(0, this.spot - dt)
    if (this.shove.x !== 0 || this.shove.y !== 0) {
      const keep = Math.max(0, 1 - dt * 9)
      this.shove = Math.abs(this.shove.x) + Math.abs(this.shove.y) < 0.2 ? { x: 0, y: 0 } : { x: this.shove.x * keep, y: this.shove.y * keep }
    }
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
    const o = this.baseOffset
    return { x: o.x + this.shove.x, y: o.y + this.shove.y - this.hop }
  }

  private get baseOffset(): Point {
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

/** Every third monster of a long fight is a boss: twice the size, with a lot more hit points. */
export function isBossWave(kills: number): boolean {
  return kills > 0 && kills % 3 === 0
}

export class Monster {
  static readonly MAX_HP = 8
  static readonly BOSS_HP = 22
  static readonly CHARGE_TIME = 0.4
  hp = Monster.MAX_HP
  maxHp = Monster.MAX_HP
  isBoss = false
  /** Monsters beaten in this fight; the room's fight ends (and this resets) when everyone leaves. */
  kills = 0
  flash = 0
  /** Counts down while the monster lunges at a fighter. */
  charge = 0
  chargeTo: Point = { x: 0, y: 0 }
  /** A blow the monster has started: lands at `time` on the actor `actorId`. */
  blow?: { time: number; actorId: string }
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
    this.charge = Math.max(0, this.charge - dt)
    if (this.respawnIn > 0) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0) {
        this.isBoss = isBossWave(this.kills)
        this.maxHp = this.isBoss ? Monster.BOSS_HP : Monster.MAX_HP
        this.hp = this.maxHp
        return true // ask for a new look
      }
    }
    return false
  }

  get isAlive(): boolean {
    return this.respawnIn <= 0
  }

  lungeAt(toward: Point): void {
    this.charge = Monster.CHARGE_TIME
    this.chargeTo = toward
  }

  /** Pixels the monster has advanced toward its target this frame: out and back. */
  get advance(): Point {
    if (this.charge <= 0) return { x: 0, y: 0 }
    const dx = this.chargeTo.x - this.at.x
    const dy = this.chargeTo.y - this.at.y
    const length = Math.hypot(dx, dy) || 1
    const reach = Math.min(length * 16 * 0.7, this.isBoss ? 22 : 14) * Math.sin((this.charge / Monster.CHARGE_TIME) * Math.PI)
    return { x: (dx / length) * reach, y: (dy / length) * reach }
  }
}

export interface Effect {
  /**
   * slash/poof: a hit and a kill; damage/xp/z: floating text; bolt: a spell,
   * dagger or arrow flying from (x, y) to (tx, ty); coin/spark: work in the
   * Câmara de ouro and the Biblioteca; burst: a handful of pixels flying out
   * of a hit (`color`); note: a musical note floating up from the minstrel
   * (`text` is its shape); splash: ripples where a fish jumped.
   */
  kind: 'slash' | 'damage' | 'poof' | 'xp' | 'z' | 'bolt' | 'coin' | 'spark' | 'burst' | 'note' | 'splash'
  x: number
  y: number
  tx?: number
  ty?: number
  /** For a bolt: what flies (a spell's orb, a dagger, an arrow). */
  shape?: 'orb' | 'dagger' | 'arrow'
  age: number
  ttl: number
  text?: string
  color?: string
}

export function updateEffects(effects: Effect[], dt: number): Effect[] {
  for (const effect of effects) effect.age += dt
  return effects.filter(effect => effect.age < effect.ttl)
}
