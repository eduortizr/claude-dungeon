/**
 * The living map. `sync(world)` turns server state into goals (who walks
 * where, who attacks), `update(dt)` moves things, `render()` draws a frame.
 *
 * Where each hero goes:
 *   working / waiting  -> a slot in its project's room, facing the monster
 *   idle               -> a seat by the campfire in the cave
 *   offline            -> back out through the gate, then gone
 * Party members (subagents) follow their hero into the room and fight next to
 * it; when their mission is done they walk out through the gate.
 */
import { GUILD, hashString } from '../../shared/guild'
import type { Hero, WorldState } from '../../shared/types'
import type { Camera } from './camera'
import { Actor, type Effect, Monster, updateEffects } from './entities'
import { buildMap, ROOM_H, ROOM_W, type GameMap, type RoomLayout } from './map'
import type { Point } from './pathfinding'
import { MONSTERS, TILE_SIZE, drawTile } from './tiles'

const T = TILE_SIZE
const VOID = '#120d16'
const BUBBLE_TIME = 5
const CAMP_TALK = [
  'Alguém tem uma poção?',
  'Essa fogueira tá boa…',
  'Dizem que tem um dragão no módulo de pagamentos.',
  'Quem deixou o TODO na sala 3?',
  'Volto pra dungeon já já.',
  'Meu escudo ainda tem marca de NullPointer.',
  'Ouvi um merge conflict lá embaixo.',
  'Descansar também é estratégia.',
]

export class Scene {
  map: GameMap = buildMap([])
  world: WorldState = { heroes: {}, updatedAt: 0 }
  selectedHeroId?: string
  private projects: string[] = []
  private actors = new Map<string, Actor>()
  private monsters = new Map<string, Monster>()
  private effects: Effect[] = []
  private time = 0
  private nextChatter = 4
  /** Members whose mission ended before we ever drew them: never shown. */
  private finished = new Set<string>()

  constructor(
    private readonly sheet: HTMLImageElement,
    private readonly white: HTMLCanvasElement,
  ) {}

  get worldSize(): { width: number; height: number } {
    return { width: this.map.cols * T, height: this.map.rows * T }
  }

  // ---- state -> goals ------------------------------------------------------

  sync(world: WorldState): boolean {
    this.world = world
    const heroes = Object.values(world.heroes).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    const mapChanged = this.syncRooms(heroes)

    const idle: Actor[] = []
    const inRoom = new Map<string, Actor[]>()
    const enter = (room: string, actor: Actor) => inRoom.set(room, [...(inRoom.get(room) ?? []), actor])

    for (const hero of heroes) {
      const actor = this.heroActor(hero)
      if (!actor) continue
      if (hero.status === 'offline') this.leave(actor)
      else if (hero.status === 'idle') idle.push(actor)
      else enter(hero.room, actor)

      this.syncBubble(actor, hero)
      if (hero.hits > actor.hitsSeen) {
        actor.hitsSeen = hero.hits
        this.strike(actor, hero.room)
      }

      for (const member of hero.party) {
        const key = `${hero.id}/${member.id}`
        let memberActor = this.actors.get(key)
        if (member.status !== 'working') {
          if (memberActor) this.leave(memberActor)
          else this.finished.add(key)
          continue
        }
        if (this.finished.has(key) || hero.status === 'offline') continue
        if (!memberActor) {
          const cls = GUILD[member.cls]
          memberActor = new Actor(key, hero.id, cls.sprite, cls.name, cls.color, true, actor.tile, member.toolCalls)
          this.actors.set(key, memberActor)
        }
        memberActor.label = GUILD[member.cls].name
        enter(hero.room, memberActor)
        if (member.toolCalls > memberActor.hitsSeen) {
          memberActor.hitsSeen = member.toolCalls
          this.strike(memberActor, hero.room)
        }
        if (member.action !== memberActor.bubble?.text && member.toolCalls > 0) {
          memberActor.bubble = { text: member.action, until: this.time + BUBBLE_TIME }
        }
      }
    }

    // Seats and slots are handed out in a stable order, so nobody swaps places.
    idle.forEach((actor, i) => actor.goTo(this.map, this.map.seats[i % this.map.seats.length]!, mapChanged))
    for (const [roomName, actors] of inRoom) {
      const room = this.room(roomName)
      if (!room) continue
      actors.forEach((actor, i) => actor.goTo(this.map, room.slots[i % room.slots.length]!, mapChanged))
    }
    this.syncMonsters(inRoom)
    return mapChanged
  }

  private syncRooms(heroes: Hero[]): boolean {
    const active = new Set(heroes.filter(h => h.status !== 'offline').map(h => h.room))
    const next = [...this.projects.filter(p => active.has(p)), ...[...active].filter(p => !this.projects.includes(p))]
    if (next.join('\n') === this.projects.join('\n')) return false
    this.projects = next
    this.map = buildMap(next)
    this.monsters.clear()
    return true
  }

  private heroActor(hero: Hero): Actor | undefined {
    let actor = this.actors.get(hero.id)
    if (!actor) {
      if (hero.status === 'offline') return undefined
      actor = new Actor(hero.id, hero.id, hero.sprite, hero.name, GUILD.mestre.color, false, this.map.spawn, hero.hits)
      this.actors.set(hero.id, actor)
    }
    return actor
  }

  private leave(actor: Actor): void {
    if (actor.isLeaving) return
    actor.isLeaving = true
    actor.bubble = actor.isMember ? { text: 'Missão cumprida!', until: this.time + 3 } : undefined
    actor.goTo(this.map, this.map.spawn, true)
    if (actor.tile.x === this.map.spawn.x && actor.tile.y === this.map.spawn.y) actor.isGone = true
  }

  private syncBubble(actor: Actor, hero: Hero): void {
    if (hero.status === 'waiting') {
      actor.bubble = { text: `! ${hero.action}`, until: Infinity, isAlert: true }
    } else if (hero.status === 'working' && actor.bubble?.text !== hero.action) {
      actor.bubble = { text: hero.action, until: this.time + BUBBLE_TIME }
    } else if (hero.status !== 'working' && actor.bubble?.isAlert) {
      actor.bubble = undefined
    }
  }

  private syncMonsters(inRoom: Map<string, Actor[]>): void {
    for (const roomName of this.monsters.keys()) {
      if (!inRoom.has(roomName)) this.monsters.delete(roomName)
    }
    for (const roomName of inRoom.keys()) {
      const room = this.room(roomName)
      if (room && !this.monsters.has(roomName)) {
        this.monsters.set(roomName, new Monster(roomName, this.monsterLook(roomName, 0), room.monster))
      }
    }
  }

  private monsterLook(room: string, generation: number): number {
    return MONSTERS[hashString(`${room}#${generation}`) % MONSTERS.length]!
  }

  private room(name: string): RoomLayout | undefined {
    return this.map.rooms.find(r => r.name === name)
  }

  /** One tool call = one blow at the room's monster, if the actor is there. */
  private strike(actor: Actor, roomName: string): void {
    const monster = this.monsters.get(roomName)
    if (!monster || !monster.isAlive || actor.isMoving) return
    actor.attack(monster.at)
    monster.flash = 0.12
    monster.hp--
    const mx = monster.at.x + 0.5
    const my = monster.at.y
    this.effects.push({ kind: 'slash', x: mx, y: my + 0.5, age: 0, ttl: 0.25 })
    this.effects.push({
      kind: 'damage',
      x: mx + (Math.random() - 0.5) * 0.6,
      y: my,
      age: 0,
      ttl: 0.9,
      text: String(3 + Math.floor(Math.random() * 13)),
      color: actor.isMember ? actor.color : '#ffd34d',
    })
    if (monster.hp <= 0) {
      monster.respawnIn = 1.2
      this.effects.push({ kind: 'poof', x: mx, y: my + 0.5, age: 0, ttl: 0.5 })
      this.effects.push({ kind: 'xp', x: mx, y: my - 0.3, age: 0, ttl: 1.4, text: '+XP' })
    }
  }

  // ---- simulation ----------------------------------------------------------

  update(dt: number): void {
    this.time += dt
    for (const actor of this.actors.values()) {
      actor.update(dt)
      if (actor.isGone) this.actors.delete(actor.id)
    }
    for (const monster of this.monsters.values()) {
      if (monster.update(dt)) monster.sprite = this.monsterLook(monster.room, ++monster.generation)
    }
    this.effects = updateEffects(this.effects, dt)

    // Small talk around the fire.
    if (this.time > this.nextChatter) {
      this.nextChatter = this.time + 6 + Math.random() * 6
      const resting = [...this.actors.values()].filter(
        a => !a.isMember && !a.isMoving && this.world.heroes[a.heroId]?.status === 'idle',
      )
      const speaker = resting[Math.floor(Math.random() * resting.length)]
      if (speaker) {
        speaker.bubble = { text: CAMP_TALK[Math.floor(Math.random() * CAMP_TALK.length)]!, until: this.time + 4 }
      }
    }
  }

  /** The hero under a world-pixel point (a member selects its hero). */
  pick(world: Point): string | undefined {
    let best: { id: string; distance: number } | undefined
    for (const actor of this.actors.values()) {
      const cx = (actor.x + 0.5) * T
      const cy = (actor.y + 0.5) * T
      const distance = Math.hypot(world.x - cx, world.y - cy)
      if (distance < T * 0.75 && (!best || distance < best.distance)) best = { id: actor.heroId, distance }
    }
    return best?.id
  }

  // ---- drawing -------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = VOID
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false

    const z = camera.zoom
    ctx.setTransform(z, 0, 0, z, Math.round(-camera.x * z), Math.round(-camera.y * z))
    this.drawTiles(ctx)
    this.drawFireLight(ctx)
    this.drawSprites(ctx)
    this.drawEffects(ctx)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.drawLabels(ctx, camera)
  }

  private drawTiles(ctx: CanvasRenderingContext2D): void {
    const { cols, rows, floor, deco } = this.map
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const f = floor[i]!
        if (f >= 0) drawTile(ctx, this.sheet, f, x * T, y * T)
        const d = deco[i]!
        if (d >= 0) drawTile(ctx, this.sheet, d, x * T, y * T)
      }
    }
  }

  private drawFireLight(ctx: CanvasRenderingContext2D): void {
    const { fire } = this.map
    const cx = (fire.x + 0.5) * T
    const cy = (fire.y + 0.5) * T
    const flicker = Math.sin(this.time * 9) * 2 + Math.sin(this.time * 23) * 1.5

    // Warm glow.
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 70 + flicker * 2)
    glow.addColorStop(0, 'rgba(255, 170, 60, 0.35)')
    glow.addColorStop(1, 'rgba(255, 120, 40, 0)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = glow
    ctx.fillRect(cx - 90, cy - 90, 180, 180)
    ctx.restore()

    // Logs.
    ctx.fillStyle = '#5a3a22'
    ctx.fillRect(cx - 6, cy + 3, 12, 3)
    ctx.fillStyle = '#7a5030'
    ctx.fillRect(cx - 4, cy + 2, 8, 2)

    // Flame: three stacked pixel blobs that sway.
    const sway = Math.round(Math.sin(this.time * 7))
    const tall = Math.round(Math.abs(Math.sin(this.time * 5)) * 2)
    ctx.fillStyle = '#e8462b'
    ctx.fillRect(cx - 4, cy - 3 - tall, 8, 6 + tall)
    ctx.fillStyle = '#ff9a2e'
    ctx.fillRect(cx - 3 + sway, cy - 5 - tall, 6, 7)
    ctx.fillStyle = '#ffe066'
    ctx.fillRect(cx - 1 + sway, cy - 3 - tall, 3, 4)

    // Sparks.
    for (let k = 0; k < 3; k++) {
      const phase = (this.time * 0.8 + k / 3) % 1
      ctx.fillStyle = `rgba(255, 210, 90, ${1 - phase})`
      ctx.fillRect(cx + Math.sin((this.time + k) * 3) * 4, cy - 6 - phase * 18, 1, 1)
    }
  }

  private drawSprites(ctx: CanvasRenderingContext2D): void {
    type Drawable = { y: number; draw: () => void }
    const list: Drawable[] = []

    for (const monster of this.monsters.values()) {
      if (!monster.isAlive) continue
      list.push({
        y: monster.at.y,
        draw: () => {
          const bob = Math.round(Math.sin(this.time * 3) * 1)
          const px = monster.at.x * T
          const py = monster.at.y * T + bob
          this.shadow(ctx, px, monster.at.y * T)
          drawTile(ctx, monster.flash > 0 ? this.white : this.sheet, monster.sprite, px, py)
          // HP bar
          ctx.fillStyle = '#2a0f12'
          ctx.fillRect(px + 1, py - 4, 14, 3)
          ctx.fillStyle = '#e8462b'
          ctx.fillRect(px + 2, py - 3, Math.round((12 * monster.hp) / Monster.MAX_HP), 1)
        },
      })
    }

    for (const actor of this.actors.values()) {
      list.push({
        y: actor.y,
        draw: () => {
          const offset = actor.offset
          const px = Math.round(actor.x * T + offset.x)
          const py = Math.round(actor.y * T + offset.y)
          this.shadow(ctx, Math.round(actor.x * T), Math.round(actor.y * T))
          if (actor.heroId === this.selectedHeroId && !actor.isMember) {
            ctx.strokeStyle = '#ffd34d'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.ellipse(actor.x * T + 8, actor.y * T + 15, 7, 3, 0, 0, Math.PI * 2)
            ctx.stroke()
          }
          drawTile(ctx, this.sheet, actor.sprite, px, py, T, actor.facingLeft)
        },
      })
    }

    list.sort((a, b) => a.y - b.y)
    for (const item of list) item.draw()
  }

  private shadow(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.beginPath()
    ctx.ellipse(px + 8, py + 15, 5, 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    for (const effect of this.effects) {
      const t = effect.age / effect.ttl
      const px = effect.x * T
      const py = effect.y * T
      if (effect.kind === 'slash') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - t})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(px, py, 6 + t * 4, -Math.PI * 0.9 + t, -Math.PI * 0.1 + t)
        ctx.stroke()
      } else if (effect.kind === 'poof') {
        ctx.fillStyle = `rgba(220, 220, 230, ${1 - t})`
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2
          ctx.fillRect(px + Math.cos(angle) * t * 10 - 1, py + Math.sin(angle) * t * 10 - 1, 3, 3)
        }
      }
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const z = camera.zoom
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // Room signs, like the office plates in the reference video.
    const count = new Map<string, number>()
    for (const hero of Object.values(this.world.heroes)) {
      if (hero.status !== 'offline') count.set(hero.room, (count.get(hero.room) ?? 0) + 1)
    }
    for (const room of this.map.rooms) {
      // Top rooms wear their sign on the top wall, bottom rooms on the bottom one: never over the corridor.
      const sign = camera.toScreen((room.x + ROOM_W / 2) * T, (room.isTop ? room.y : room.y + ROOM_H) * T)
      const title = room.name || 'Câmara selada'
      this.pill(ctx, sign.x, sign.y - 4, title, room.name ? '#f5e6c8' : '#8a7d6a', room.name ? count.get(room.name) : undefined, z)
    }
    const cave = camera.toScreen((this.map.fire.x + 0.5) * T, 1.2 * T)
    this.pill(ctx, cave.x, cave.y, 'Caverna', '#ffb366', undefined, z)
    const gate = camera.toScreen((this.map.gate.x + 0.5) * T, (this.map.gate.y + 2.4) * T)
    this.pill(ctx, gate.x, gate.y, 'Portão da guilda', '#c9b8a0', undefined, z)

    // Name tags and speech bubbles.
    const font = Math.max(14, Math.min(19, z * 5))
    for (const actor of [...this.actors.values()].sort((a, b) => a.y - b.y)) {
      const head = camera.toScreen((actor.x + 0.5) * T, actor.y * T)
      const feet = camera.toScreen((actor.x + 0.5) * T, (actor.y + 1) * T)
      ctx.font = `${actor.isMember ? 600 : 700} ${actor.isMember ? font - 1 : font}px "VT323", monospace`
      const width = ctx.measureText(actor.label).width + 16
      ctx.fillStyle = 'rgba(18, 13, 22, 0.78)'
      this.roundRect(ctx, feet.x - width / 2, feet.y + 1, width, font + 6, 4)
      ctx.fillStyle = actor.color
      ctx.beginPath()
      ctx.arc(feet.x - width / 2 + 7, feet.y + 4 + font / 2, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(actor.label, feet.x + 4, feet.y + 4 + font / 2)
    }

    // Bubbles last, stacked upward when two would overlap (heroes stand close in a room).
    const placed: { left: number; right: number; top: number; bottom: number }[] = []
    for (const actor of [...this.actors.values()].sort((a, b) => b.y - a.y)) {
      const bubble = actor.bubble
      if (!bubble || bubble.until <= this.time) continue
      const head = camera.toScreen((actor.x + 0.5) * T, actor.y * T)
      ctx.font = `500 ${font}px "VT323", monospace`
      const text = this.fit(ctx, bubble.text)
      const width = ctx.measureText(text).width + 14
      const height = font + 10
      let bottom = head.y - 10
      for (let tries = 0; tries < 6; tries++) {
        const clash = placed.find(
          r => head.x - width / 2 < r.right && head.x + width / 2 > r.left && bottom - height < r.bottom && bottom > r.top,
        )
        if (!clash) break
        bottom = clash.top - 4
      }
      placed.push({ left: head.x - width / 2, right: head.x + width / 2, top: bottom - height, bottom })
      this.bubble(ctx, head.x, head.y - 4, bottom, text, width, height, bubble.isAlert)
    }

    for (const effect of this.effects) {
      if (effect.kind !== 'damage' && effect.kind !== 'xp') continue
      const t = effect.age / effect.ttl
      const p = camera.toScreen(effect.x * T, effect.y * T)
      ctx.globalAlpha = 1 - t * t
      ctx.font = `700 ${font + (effect.kind === 'xp' ? 2 : 0)}px "VT323", monospace`
      ctx.fillStyle = '#120d16'
      ctx.fillText(effect.text ?? '', p.x + 1, p.y - t * 24 * (z / 3) + 1)
      ctx.fillStyle = effect.kind === 'xp' ? '#7dff9b' : effect.color ?? '#ffd34d'
      ctx.fillText(effect.text ?? '', p.x, p.y - t * 24 * (z / 3))
      ctx.globalAlpha = 1
    }
  }

  private pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, badge: number | undefined, z: number): void {
    const font = Math.max(15, Math.min(21, z * 5.5))
    ctx.font = `700 ${font}px "VT323", monospace`
    const textWidth = ctx.measureText(text).width
    const badgeWidth = badge ? font + 8 : 0
    const width = textWidth + 20 + badgeWidth
    const height = font + 10
    ctx.fillStyle = 'rgba(18, 13, 22, 0.88)'
    this.roundRect(ctx, x - width / 2, y - height / 2, width, height, 6)
    ctx.fillStyle = '#ffb347'
    ctx.fillRect(x - width / 2, y - height / 2 + 4, 3, height - 8)
    ctx.fillStyle = color
    ctx.fillText(text, x - badgeWidth / 2 + 2, y + 1)
    if (badge) {
      const bx = x + width / 2 - badgeWidth / 2 - 4
      ctx.fillStyle = '#ff8c1a'
      ctx.beginPath()
      ctx.arc(bx, y, font / 2 + 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#120d16'
      ctx.font = `700 ${font - 2}px "VT323", monospace`
      ctx.fillText(String(badge), bx, y + 1)
    }
  }

  /** Shortens a bubble's text to a readable width (uses the current ctx.font). */
  private fit(ctx: CanvasRenderingContext2D, text: string, maxWidth = 250): string {
    let fitted = text
    while (fitted.length > 4 && ctx.measureText(fitted).width > maxWidth) fitted = `${fitted.slice(0, -2)}…`
    return fitted
  }

  /** A speech bubble whose bottom edge sits at `bottom`, with a tail down to the head at (x, headY). */
  private bubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    headY: number,
    bottom: number,
    text: string,
    width: number,
    height: number,
    isAlert = false,
  ): void {
    const fill = isAlert ? '#ffd34d' : '#fdf7ea'
    const top = bottom - height
    if (headY - bottom > 8) {
      // Lifted above another bubble: a thin line keeps it tied to its speaker.
      ctx.fillStyle = fill
      ctx.fillRect(x - 1, bottom, 2, headY - bottom - 4)
    }
    ctx.fillStyle = fill
    this.roundRect(ctx, x - width / 2, top, width, height, 6)
    ctx.beginPath()
    ctx.moveTo(x - 4, bottom)
    ctx.lineTo(x, bottom + 5)
    ctx.lineTo(x + 4, bottom)
    ctx.fill()
    ctx.fillStyle = '#2b1d2e'
    ctx.fillText(text, x, top + height / 2 + 1)
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }
}
