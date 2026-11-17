/**
 * The forest's animals. Everything is a pure function of time, so there is no
 * state to keep: a deer, a rabbit and a fox cross the trail now and then (each
 * on its own period), two ducks paddle around the pond and fish jump out of it.
 */
import { TILE_SIZE } from './tiles'

const T = TILE_SIZE
type Ctx = CanvasRenderingContext2D

export type WalkerKind = 'deer' | 'rabbit' | 'fox'

interface Walker {
  kind: WalkerKind
  /** Seconds between two crossings (start to start). */
  period: number
  /** Tiles per second. */
  speed: number
  /** Shifts the schedule so they don't cross together. */
  offset: number
}

export const WALKERS: readonly Walker[] = [
  { kind: 'deer', period: 80, speed: 2.2, offset: 25 },
  { kind: 'rabbit', period: 47, speed: 4.5, offset: 4 },
  { kind: 'fox', period: 95, speed: 3, offset: 60 },
]

export interface WalkerPose {
  /** Tile column (fractional). */
  x: number
  dir: 1 | -1
}

/** Where a walker is at `time`, or undefined while it is off the map. Crossings alternate direction. */
export function walkerAt(walker: Walker, time: number, cols: number): WalkerPose | undefined {
  const t = time + walker.offset
  const cycle = Math.floor(t / walker.period)
  const local = t - cycle * walker.period
  const span = cols + 4
  if (local * walker.speed > span) return undefined
  const dir = cycle % 2 === 0 ? 1 : -1
  const along = -2 + local * walker.speed
  return { x: dir === 1 ? along : cols - along, dir }
}

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** Draws a walker with its feet at (px, py) in world pixels, facing `dir`. */
export function drawWalker(ctx: Ctx, kind: WalkerKind, px: number, py: number, dir: 1 | -1, time: number): void {
  ctx.save()
  ctx.translate(Math.round(px), Math.round(py))
  if (dir === -1) ctx.scale(-1, 1)
  const step = Math.sin(time * (kind === 'rabbit' ? 9 : 7)) > 0 ? 1 : 0
  rect(ctx, 'rgba(0, 0, 0, 0.25)', -6, -1, 13, 2)
  if (kind === 'deer') {
    rect(ctx, '#6a4428', -5, -3, 2, 3 - step)
    rect(ctx, '#6a4428', -2 + step, -3, 2, 3)
    rect(ctx, '#6a4428', 2, -3, 2, 3 - step)
    rect(ctx, '#6a4428', 4 - step, -3, 2, 3)
    rect(ctx, '#9a6a3c', -6, -8, 12, 5)
    rect(ctx, '#b5824a', -5, -8, 10, 1)
    rect(ctx, '#e8d0a0', -3, -6, 1, 1)
    rect(ctx, '#e8d0a0', 0, -5, 1, 1)
    rect(ctx, '#f3eadb', -7, -8, 2, 2)
    rect(ctx, '#9a6a3c', 4, -12, 3, 5)
    rect(ctx, '#9a6a3c', 5, -13, 4, 3)
    rect(ctx, '#1a1220', 7, -12, 1, 1)
    rect(ctx, '#e6d9bd', 5, -16, 1, 3)
    rect(ctx, '#e6d9bd', 8, -16, 1, 3)
    rect(ctx, '#e6d9bd', 4, -16, 1, 1)
  } else if (kind === 'rabbit') {
    ctx.translate(0, Math.round(-Math.abs(Math.sin(time * 9)) * 4))
    rect(ctx, '#cfc7bd', -4, -4, 7, 4)
    rect(ctx, '#e8e2d8', -3, -4, 5, 1)
    rect(ctx, '#cfc7bd', 2, -6, 3, 3)
    rect(ctx, '#cfc7bd', 2, -9, 1, 3)
    rect(ctx, '#cfc7bd', 4, -9, 1, 3)
    rect(ctx, '#e8a0a8', 3, -8, 1, 2)
    rect(ctx, '#ffffff', -5, -3, 2, 2)
    rect(ctx, '#1a1220', 4, -5, 1, 1)
  } else {
    rect(ctx, '#3a2a22', -4, -3, 2, 3 - step)
    rect(ctx, '#3a2a22', -1 + step, -3, 2, 3)
    rect(ctx, '#3a2a22', 2, -3, 2, 3 - step)
    rect(ctx, '#d9732b', -5, -7, 10, 4)
    rect(ctx, '#f0a050', -4, -7, 7, 1)
    rect(ctx, '#d9732b', 4, -9, 4, 4)
    rect(ctx, '#f3eadb', 7, -7, 2, 2)
    rect(ctx, '#1a1220', 8, -7, 1, 1)
    rect(ctx, '#d9732b', 4, -11, 1, 2)
    rect(ctx, '#d9732b', 7, -11, 1, 2)
    rect(ctx, '#1a1220', 4, -11, 1, 1)
    rect(ctx, '#1a1220', 7, -11, 1, 1)
    rect(ctx, '#d9732b', -11, -8 + step, 6, 3)
    rect(ctx, '#f3eadb', -12, -8 + step, 2, 3)
  }
  ctx.restore()
}

export interface PondPose {
  x: number
  y: number
  flip: boolean
}

/** A duck paddling slowly around the pond's middle (pond center in tiles, result in world pixels). */
export function duckAt(index: number, time: number, pond: { x: number; y: number }): PondPose {
  const dir = index % 2 === 0 ? 1 : -1
  const a = time * 0.22 * dir + index * 3.1
  // Swimming along the ellipse: the duck faces where it is heading.
  const heading = -Math.sin(a) * dir
  return {
    x: pond.x * T + Math.cos(a) * 2.4 * T,
    y: pond.y * T + Math.sin(a) * 0.65 * T,
    flip: heading < 0,
  }
}

export function drawDuck(ctx: Ctx, pose: PondPose, time: number): void {
  ctx.save()
  ctx.translate(Math.round(pose.x), Math.round(pose.y))
  if (pose.flip) ctx.scale(-1, 1)
  ctx.strokeStyle = 'rgba(210, 238, 255, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(0, 1, 6 + Math.sin(time * 3) * 0.6, 2, 0, 0, Math.PI * 2)
  ctx.stroke()
  rect(ctx, '#f3f3f3', -3, -2, 6, 3)
  rect(ctx, '#cfd6dc', -3, 0, 5, 1)
  rect(ctx, '#2f8a4a', 2, -5, 3, 3)
  rect(ctx, '#f2a33a', 5, -4, 2, 1)
  rect(ctx, '#1a1220', 4, -4, 1, 1)
  ctx.restore()
}

export interface FishJump {
  x: number
  y: number
  /** 0..1 through the jump. */
  t: number
  /** Seconds since it landed, while the ripples last (else -1). */
  ripple: number
  /** Where it landed (for the ripples). */
  landX: number
  landY: number
}

const JUMP_TIME = 0.9
const RIPPLE_TIME = 0.8

/** Fish jump now and then: every few seconds each one leaps from a new spot in the pond. */
export function fishAt(index: number, time: number, pond: { x: number; y: number }): FishJump | undefined {
  const period = 6.5 + index * 3.7
  const t = time + index * 2.3
  const cycle = Math.floor(t / period)
  const local = t - cycle * period
  if (local > JUMP_TIME + RIPPLE_TIME) return undefined
  const h = ((cycle * 7919 + index * 104729) % 1000) / 1000
  const h2 = ((cycle * 6007 + index * 7717) % 1000) / 1000
  const startX = pond.x * T + (h - 0.5) * 5 * T
  const baseY = pond.y * T + (h2 - 0.5) * 1.1 * T
  const jumping = local < JUMP_TIME
  const p = Math.min(1, local / JUMP_TIME)
  return {
    x: startX + 9 * p,
    y: baseY - Math.sin(p * Math.PI) * 11,
    t: p,
    ripple: jumping ? -1 : local - JUMP_TIME,
    landX: startX + 9,
    landY: baseY,
  }
}

export function drawFish(ctx: Ctx, fish: FishJump): void {
  const rings = (x: number, y: number, age: number) => {
    ctx.strokeStyle = `rgba(220, 240, 255, ${Math.max(0, 0.9 - age)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(Math.round(x), Math.round(y), 2 + age * 8, 1 + age * 3, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (fish.ripple >= 0) {
    rings(fish.landX, fish.landY, fish.ripple / RIPPLE_TIME)
    return
  }
  ctx.save()
  ctx.translate(Math.round(fish.x), Math.round(fish.y))
  // Nose up on the way out, down on the way back.
  const tilt = fish.t < 0.5 ? -1 : 1
  rect(ctx, '#c7d3dd', -3, -1 + tilt, 6, 2)
  rect(ctx, '#e8f0f6', -2, -1 + tilt, 4, 1)
  rect(ctx, '#7f93a6', -5, -2 + tilt, 2, 4)
  rect(ctx, '#1a1220', 2, -1 + tilt, 1, 1)
  ctx.restore()
}
