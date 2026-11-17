/**
 * The living map. `sync(world)` turns server state into goals (who walks
 * where, who attacks), `update(dt)` moves things and runs the idle
 * activities, `render()` draws a frame.
 *
 * Where each hero goes is decided by `placeHeroes` (placement.ts): its
 * project's room while it works, then the taverna, the sala de jogos, the
 * floresta and finally the caverna as it stays idle longer. Party members
 * (subagents) live in the sala de treinamento: when summoned, the class's
 * member walks from its target to the hero's room, fights there, and walks
 * back when done. Residents (the taverneiro, the minstrel, the alquimista, the
 * old mercador and the Mestre do Claude) never leave their rooms: they work all
 * day. Guild members not on a mission follow a routine (routine.ts): training,
 * the taverna, the sala de jogos, the forest, and back.
 */
import { GUILD, hashString, type ClassId } from '../../shared/guild'
import type { Hero, MarketFeed, WorldState } from '../../shared/types'
import type { Camera } from './camera'
import { CUSTOM_SPRITES, drawSprite } from './characters'
import { Actor, type Effect, Monster, updateEffects } from './entities'
import {
  CONVERSATIONS,
  FOREST_LINES,
  GAME_NAMES,
  GUILD_BANTER,
  MASTER_CHATS,
  MASTER_OPENERS,
  RESIDENT_LINES,
  TABLE_GAMES,
  TAVERN_TALK,
  cardFace,
  oneOf,
  playRound,
  rpgLines,
  rpgScene,
  taunt,
  type Round,
} from './games'
import { buildMap, ROOM_H, type GameMap, type ResidentId, type RoomLayout } from './map'
import type { Point } from './pathfinding'
import { placeHeroes, victoryLine, type Place } from './placement'
import { GROUND_PROPS, TARGETS, drawDragon, drawProp } from './props'
import { guildActivity, type Activity } from './routine'
import { WALKERS, drawDuck, drawFish, drawWalker, duckAt, fishAt, walkerAt } from './wildlife'
import { FLOOR, MONSTERS, TILE_SIZE, drawTile, isDrawnFloor } from './tiles'

const T = TILE_SIZE
const VOID = '#2b2328'
const BUBBLE_TIME = 5
/** Seconds between rounds at a game table, and how long a result stays on the table. */
const ROUND_EVERY = 4.5
const RESULT_TIME = 2.2
/** Seconds between the lines of a conversation. */
const LINE_GAP = 2.6
const NOTE_COLORS = ['#ffd34d', '#7fe0c8', '#ff8ad8', '#c9b0ff']

interface DoorState {
  open: number
  hold: number
}

export type Selection = { kind: 'hero'; id: string } | { kind: 'resident'; id: ResidentId }

const RESIDENTS: Record<ResidentId, { label: string; sprite: number; color: string }> = {
  taverneiro: { label: 'Taverneiro', sprite: 85, color: '#ffb347' },
  alquimista: { label: 'Alquimista', sprite: CUSTOM_SPRITES.alquimista, color: '#7fe0c8' },
  mercador: { label: 'Velho Mercador', sprite: CUSTOM_SPRITES.mercador, color: '#f2c544' },
  mestre: { label: 'Mestre do Claude', sprite: CUSTOM_SPRITES.mestre, color: '#d97757' },
  menestrel: { label: 'Menestrel', sprite: CUSTOM_SPRITES.menestrel, color: '#7fe0c8' },
}

interface TableState {
  players: [string, string]
  score: [number, number]
  nextRound: number
  last?: Round & { at: number }
  /** Masmorras & Dragões: the master has described the scene; the roll comes at this time. */
  rollAt?: number
}

interface Line {
  actorId: string
  text: string
  at: number
  /** How long the line stays up. */
  for: number
}

export class Scene {
  map: GameMap = buildMap([])
  world: WorldState = { heroes: {}, updatedAt: 0 }
  market?: MarketFeed
  selected?: Selection
  private projects: string[] = []
  private actors = new Map<string, Actor>()
  private monsters = new Map<string, Monster>()
  private effects: Effect[] = []
  private time = 0
  private nextChatter = 5
  private nextBanter = 8
  private nextGuildBanter = 12
  private nextSnore = 0
  /** Members whose mission ended before we ever drew them: never shown. */
  private finished = new Set<string>()
  private places = new Map<string, Place>()
  private tables = new Map<number, TableState>()
  /** When each training target was (or will be, for a projectile in flight) last hit, by tile index. */
  private targetHits = new Map<number, number>()
  private nextDrill = new Map<string, number>()
  private nextWork = new Map<string, number>()
  private nextMutter = new Map<string, number>()
  /** Lines waiting to be said, for conversations. */
  private lines: Line[] = []
  /** Headlines the merchant has not read out yet. */
  private newsQueue: string[] = []
  private newsSeen = 0
  private staticLayer?: HTMLCanvasElement
  private staticFor?: GameMap
  private water: Point[] = []
  /** The first state with heroes puts everyone in place at once, instead of walking in from the forest. */
  private hasSettled = false
  private doors = new Map<number, DoorState>()
  private nextRetaliate = new Map<string, number>()
  /** Until when each project room trembles (a boss hit, a monster's blow). */
  private shakeUntil = new Map<string, number>()
  private nextNote = 2
  private nextMasterChat = 20
  private nextCampaign = 35
  /** D&D rolls the master has announced: the player rolls at `at`. */
  private rolls: { at: number; playerId: string }[] = []

  constructor(
    private readonly sheet: HTMLImageElement,
    private readonly white: HTMLCanvasElement,
  ) {
    this.placeResidents()
    this.placeTrainees()
  }

  get worldSize(): { width: number; height: number } {
    return { width: this.map.cols * T, height: this.map.rows * T }
  }

  get selectedHeroId(): string | undefined {
    return this.selected?.kind === 'hero' ? this.selected.id : undefined
  }

  /** Where a hero is right now, for the side panel. */
  placeOf(heroId: string): Place | undefined {
    return this.places.get(heroId)
  }

  setMarket(feed: MarketFeed | undefined): void {
    const fresh = feed && feed.updatedAt !== this.newsSeen
    const startedReading = feed?.busy && !this.market?.busy
    this.market = feed
    const merchant = this.actors.get('resident/mercador')
    if (fresh) {
      this.newsSeen = feed.updatedAt
      this.newsQueue = [...feed.headlines, ...feed.highlights.map(h => h.title)]
      if (merchant) merchant.bubble = { text: 'Notícias frescas da bolsa! Vejamos...', until: this.time + 4 }
      this.nextMutter.set('mercador', this.time + 4.5)
    } else if (startedReading && merchant) {
      merchant.bubble = { text: 'Chegou o mensageiro! Lendo as notícias...', until: this.time + 4 }
    }
  }

  // ---- state -> goals ------------------------------------------------------

  /** Applies the server state. Also called every second: idle places change with time alone. */
  sync(world: WorldState, now = Date.now()): boolean {
    this.world = world
    const heroes = Object.values(world.heroes).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    const mapChanged = this.syncRooms(heroes)
    if (mapChanged) {
      this.placeTrainees()
      this.placeResidents()
    }

    const jogos = this.map.room('jogos')
    this.places = placeHeroes(heroes, now, jogos.tables.length)
    const inRoom = new Map<string, Actor[]>()
    const enter = (room: string, actor: Actor) => inRoom.set(room, [...(inRoom.get(room) ?? []), actor])
    const members: (() => void)[] = []

    for (const hero of heroes) {
      const actor = this.heroActor(hero)
      if (!actor) continue
      const place = this.places.get(hero.id) ?? { kind: 'gone' }
      this.goToPlace(actor, hero, place, mapChanged, enter)
      this.syncBubble(actor, hero)
      if (hero.hits > actor.hitsSeen) {
        actor.hitsSeen = hero.hits
        this.strike(actor, hero.room)
      }
      // Members go after every hero, so heroes keep the front slots of a room.
      members.push(() => this.syncParty(hero, actor, enter))
    }
    for (const syncMembers of members) syncMembers()

    // Fighters' slots are handed out in a stable order, so nobody swaps places.
    for (const [roomName, actors] of inRoom) {
      const room = this.projectRoom(roomName)
      if (!room) continue
      actors.forEach((actor, i) => {
        const slot = room.slots[i % room.slots.length]!
        actor.goTo(this.map, slot, mapChanged)
        // In the Câmara de ouro and the Biblioteca they face the table, not the door.
        if (room.kind !== 'project') actor.restFacingLeft = room.focus.x < slot.x
      })
    }
    this.syncMonsters(inRoom)
    this.syncTables()
    if (!this.hasSettled && heroes.length > 0) {
      this.hasSettled = true
      for (const actor of this.actors.values()) {
        if (actor.isLeaving) actor.isGone = true
        else actor.arrive()
      }
    }
    return mapChanged
  }

  private goToPlace(actor: Actor, hero: Hero, place: Place, force: boolean, enter: (room: string, actor: Actor) => void): void {
    const arrived = actor.place !== place.kind
    actor.place = place.kind
    actor.isSleeping = place.kind === 'caverna'
    actor.restFacingLeft = undefined

    switch (place.kind) {
      case 'gone':
        this.leave(actor, this.map.spawn)
        break
      case 'project':
        enter(hero.room, actor)
        break
      case 'taverna': {
        const slots = this.map.room('taverna').slots
        actor.goTo(this.map, slots[place.index % slots.length]!, force)
        const line = victoryLine(hero)
        if (arrived && line) actor.bubble = { text: line, until: this.time + 7 }
        break
      }
      case 'jogos': {
        const table = this.map.room('jogos').tables[place.table]!
        actor.goTo(this.map, table.seats[place.side], force)
        actor.restFacingLeft = place.side === 1
        if (arrived && place.side === 0) {
          const rival = this.world.heroes[place.rival]?.name ?? 'você'
          const game = TABLE_GAMES[place.table] ?? 'dados'
          actor.bubble = {
            text: game === 'rpg' ? `Eu mestro hoje! Senta aí, ${rival}.` : `Bora uma partida de ${GAME_NAMES[game].toLowerCase()}, ${rival}?`,
            until: this.time + 4,
          }
        }
        break
      }
      case 'floresta': {
        const spots = this.map.forest
        if (spots.length === 0) break
        const spot = spots[place.index % spots.length]!
        actor.goTo(this.map, spot.at, force)
        if (spot.facing) actor.restFacingLeft = spot.facing.x < spot.at.x
        if (arrived) actor.bubble = { text: oneOf(FOREST_LINES[spot.activity]), until: this.time + 4 }
        break
      }
      case 'caverna':
        actor.goTo(this.map, this.map.seats[place.index % this.map.seats.length]!, force)
        if (arrived) actor.bubble = undefined
        break
    }
  }

  private syncParty(hero: Hero, heroActor: Actor, enter: (room: string, actor: Actor) => void): void {
    for (const member of hero.party) {
      const key = `${hero.id}/${member.id}`
      let actor = this.actors.get(key)
      const home = this.traineeTile(member.cls) ?? this.map.spawn
      if (member.status !== 'working') {
        if (actor) this.leave(actor, home, 'Missão cumprida!')
        else this.finished.add(key)
        continue
      }
      if (this.finished.has(key) || hero.status === 'offline') continue
      if (!actor) {
        const cls = GUILD[member.cls]
        // Guild classes come out of the training room; anyone else from the hero's side.
        const start = this.station(member.cls) ? home : heroActor.tile
        actor = new Actor(key, hero.id, cls.sprite, cls.name, cls.color, true, start, member.toolCalls)
        actor.cls = member.cls
        this.actors.set(key, actor)
      }
      enter(hero.room, actor)
      if (member.toolCalls > actor.hitsSeen) {
        actor.hitsSeen = member.toolCalls
        this.strike(actor, hero.room)
      }
      if (member.action !== actor.bubble?.text && member.toolCalls > 0) {
        actor.bubble = { text: member.action, until: this.time + BUBBLE_TIME }
      }
    }
  }

  private syncRooms(heroes: Hero[]): boolean {
    const active = new Set(heroes.filter(h => h.status !== 'offline').map(h => h.room))
    const next = [...this.projects.filter(p => active.has(p)), ...[...active].filter(p => !this.projects.includes(p))]
    if (next.join('\n') === this.projects.join('\n')) return false
    this.projects = next
    const map = buildMap(next)
    const changed = map.cols !== this.map.cols || map.rooms.length !== this.map.rooms.length || this.roomNames(map) !== this.roomNames(this.map)
    if (!changed) return false // a project that lives in a guild room: same map
    this.map = map
    this.monsters.clear()
    this.nextRetaliate.clear()
    this.shakeUntil.clear()
    this.doors.clear() // keyed by tile index, which a new width changes
    return true
  }

  private roomNames(map: GameMap): string {
    return map.rooms.map(r => r.name).join('\n')
  }

  /** The training room's members: always there, unless their class is out on a mission. */
  private placeTrainees(): void {
    const now = Date.now()
    this.map.room('treino').stations.forEach((station, index) => {
      const key = `treino/${station.cls}`
      const cls = GUILD[station.cls]
      const activity = guildActivity(index, now)
      const spot = this.breakSpot(activity, index)
      const actor = this.actors.get(key) ?? new Actor(key, '', cls.sprite, cls.name, cls.color, true, spot.at, 0)
      actor.cls = station.cls
      actor.x = spot.at.x
      actor.y = spot.at.y
      actor.place = spot.activity
      actor.goTo(this.map, spot.at, true)
      actor.restFacingLeft = spot.facingLeft
      this.actors.set(key, actor)
    })
  }

  /** Where a guild member stands for an activity: its target, a spot in the taverna or the sala de jogos, or the forest. */
  private breakSpot(activity: Activity, index: number): { at: Point; facingLeft: boolean; activity: Activity } {
    const station = this.map.room('treino').stations[index]!
    const training = { at: station.stand, facingLeft: station.target.x < station.stand.x, activity: 'treino' as Activity }
    if (activity === 'treino') return training
    if (activity === 'floresta') {
      const spots = this.map.forest
      if (spots.length === 0) return training
      const spot = spots[spots.length - 1 - (index % Math.min(3, spots.length))]!
      return { at: spot.at, facingLeft: spot.facing ? spot.facing.x < spot.at.x : false, activity }
    }
    const room = this.map.room(activity)
    if (room.guests.length === 0) return training
    const at = room.guests[index % room.guests.length]!
    return { at, facingLeft: room.guestFacing ? room.guestFacing.x < at.x : false, activity }
  }

  /** Where a class's member is standing right now (it comes back here after a mission). */
  private traineeTile(cls: ClassId): Point | undefined {
    return this.actors.get(`treino/${cls}`)?.tile
  }

  /** Every so often the members' routine moves them on: training, taverna, sala de jogos, forest, training... */
  private guildRoutine(): void {
    const now = Date.now()
    this.map.room('treino').stations.forEach((station, index) => {
      const actor = this.actors.get(`treino/${station.cls}`)
      if (!actor) return
      const spot = this.breakSpot(guildActivity(index, now), index)
      if (actor.place === spot.activity) return
      actor.place = spot.activity
      actor.bubble = undefined
      actor.goTo(this.map, spot.at)
      actor.restFacingLeft = spot.facingLeft
    })
  }

  /** The people who live in a room: they stand at their workplace, always. */
  private placeResidents(): void {
    for (const resident of this.map.residents) {
      const key = `resident/${resident.id}`
      const look = RESIDENTS[resident.id]
      const actor = this.actors.get(key) ?? new Actor(key, '', look.sprite, look.label, look.color, false, resident.at, 0)
      actor.residentId = resident.id
      actor.x = resident.at.x
      actor.y = resident.at.y
      actor.restFacingLeft = resident.workAt.x < resident.at.x
      this.actors.set(key, actor)
    }
  }

  private station(cls: ClassId) {
    return this.map.room('treino').stations.find(s => s.cls === cls)
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

  private leave(actor: Actor, to: Point, farewell?: string): void {
    if (actor.isLeaving) return
    actor.isLeaving = true
    actor.bubble = farewell ? { text: farewell, until: this.time + 3 } : undefined
    actor.goTo(this.map, to, true)
    if (actor.tile.x === to.x && actor.tile.y === to.y) actor.isGone = true
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
      if (inRoom.has(roomName)) continue
      this.monsters.delete(roomName)
      this.nextRetaliate.delete(roomName) // the next fight starts with a fresh grace period
    }
    for (const roomName of inRoom.keys()) {
      const room = this.projectRoom(roomName)
      // The Câmara de ouro and the Biblioteca have work, not monsters.
      if (room?.kind === 'project' && !this.monsters.has(roomName)) {
        this.monsters.set(roomName, new Monster(roomName, this.monsterLook(roomName, 0), room.monster))
      }
    }
  }

  /** Keeps one score per pair at each table; a new pair starts from 0 x 0. */
  private syncTables(): void {
    const seated = new Map<number, [string, string]>()
    for (const [heroId, place] of this.places) {
      if (place.kind === 'jogos' && place.side === 0) seated.set(place.table, [heroId, place.rival])
    }
    for (const table of [...this.tables.keys()]) if (!seated.has(table)) this.tables.delete(table)
    for (const [table, players] of seated) {
      const current = this.tables.get(table)
      if (current && current.players[0] === players[0] && current.players[1] === players[1]) continue
      this.tables.set(table, { players, score: [0, 0], nextRound: this.time + ROUND_EVERY })
    }
  }

  private monsterLook(room: string, generation: number): number {
    return MONSTERS[hashString(`${room}#${generation}`) % MONSTERS.length]!
  }

  /** The room a project works in: its own, or the guild room that is its home. */
  private projectRoom(name: string): RoomLayout | undefined {
    return this.map.rooms.find(r => (r.kind === 'project' && r.name === name) || r.project === name)
  }

  /** One tool call = one blow at the room's monster, or one stroke of work at the room's table. */
  private strike(actor: Actor, roomName: string): void {
    if (actor.isMoving) return
    const monster = this.monsters.get(roomName)
    if (!monster) {
      const room = this.projectRoom(roomName)
      if (room && room.kind !== 'project') this.work(actor, room.focus, room.kind === 'tesouro' ? 'coin' : 'spark')
      return
    }
    if (!monster.isAlive) return
    actor.attack(monster.at)
    monster.flash = 0.12
    monster.hp--
    const mx = monster.at.x + 0.5
    const my = monster.at.y
    this.effects.push({ kind: 'slash', x: mx, y: my + 0.5, age: 0, ttl: 0.25 })
    this.burst(mx + (Math.random() - 0.5) * 0.5, my + 0.4, actor.isMember ? actor.color : '#ffe9a0')
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
      monster.kills++
      monster.blow = undefined
      this.effects.push({ kind: 'poof', x: mx, y: my + 0.5, age: 0, ttl: 0.5 })
      this.effects.push({ kind: 'xp', x: mx, y: my - 0.3, age: 0, ttl: 1.4, text: monster.isBoss ? '+XP!!!' : '+XP' })
      this.burst(mx, my + 0.4, '#ffd34d', 0.7)
      if (monster.isBoss) {
        this.burst(mx - 0.6, my + 0.2, '#ffffff', 0.7)
        this.burst(mx + 0.6, my + 0.2, '#ff9a2e', 0.7)
        this.shakeUntil.set(roomName, this.time + 0.45)
      }
    }
  }

  /** A handful of little squares flying out of a hit. */
  private burst(x: number, y: number, color: string, ttl = 0.45): void {
    this.effects.push({ kind: 'burst', x, y, age: 0, ttl, color })
  }

  /**
   * The monsters hit back: now and then one lunges at a fighter in its room.
   * The blow lands a moment later: red number, knockback, a flash and a few
   * red pixels, and the room trembles a little (a lot for a boss).
   */
  private retaliate(): void {
    for (const [roomName, monster] of this.monsters) {
      if (!monster.isAlive) {
        monster.blow = undefined
        continue
      }
      if (monster.blow) {
        if (this.time >= monster.blow.time) {
          const victim = this.actors.get(monster.blow.actorId)
          monster.blow = undefined
          if (victim && !victim.isGone && !victim.isHidden) this.hitActor(monster, victim, roomName)
        }
        continue
      }
      const next = this.nextRetaliate.get(roomName) ?? this.time + 1.5 + Math.random() * 2
      if (this.time < next) {
        this.nextRetaliate.set(roomName, next)
        continue
      }
      const fighters = [...this.actors.values()].filter(
        a => !a.isHidden && !a.isMoving && !a.isLeaving && a.heroId && this.world.heroes[a.heroId]?.room === roomName && (a.isMember || a.place === 'project'),
      )
      this.nextRetaliate.set(roomName, this.time + (monster.isBoss ? 1.5 + Math.random() * 1.2 : 2.4 + Math.random() * 2.2))
      const victim = fighters[Math.floor(Math.random() * fighters.length)]
      if (!victim) continue
      monster.lungeAt(victim.tile)
      monster.blow = { time: this.time + Monster.CHARGE_TIME * 0.45, actorId: victim.id }
    }
  }

  private hitActor(monster: Monster, victim: Actor, roomName: string): void {
    const damage = monster.isBoss ? 14 + Math.floor(Math.random() * 20) : 4 + Math.floor(Math.random() * 9)
    victim.hurt = 0.22
    const dx = victim.x - monster.at.x
    const dy = victim.y - monster.at.y
    const length = Math.hypot(dx, dy) || 1
    const push = monster.isBoss ? 7 : 4.5
    victim.shove = { x: (dx / length) * push, y: (dy / length) * push }
    this.effects.push({ kind: 'damage', x: victim.x + 0.5, y: victim.y - 0.1, age: 0, ttl: 0.9, text: `-${damage}`, color: '#ff4d4d' })
    this.burst(victim.x + 0.5, victim.y + 0.5, '#d83a3a')
    this.burst(victim.x + 0.5, victim.y + 0.4, '#ffb347', 0.35)
    this.shakeUntil.set(roomName, this.time + (monster.isBoss ? 0.3 : 0.14))
    if (!victim.bubble && Math.random() < 0.3) victim.bubble = { text: oneOf(['Ai!', 'Essa doeu!', 'Ugh!', 'Não esperava essa!']), until: this.time + 1.6 }
  }

  /** A stroke of work: a lean toward the table and a coin (or a spark) popping up from it. */
  private work(actor: Actor, at: Point, kind: 'coin' | 'spark'): void {
    actor.attack(at)
    this.effects.push({ kind, x: at.x + 0.3 + Math.random() * 0.4, y: at.y + 0.2, age: 0, ttl: 0.9 })
  }

  // ---- simulation ----------------------------------------------------------

  update(dt: number): void {
    this.time += dt
    for (const actor of this.actors.values()) {
      actor.update(dt)
      if (actor.isGone) this.actors.delete(actor.id)
    }
    for (const monster of this.monsters.values()) {
      if (monster.update(dt)) {
        monster.sprite = this.monsterLook(monster.room, ++monster.generation)
        if (monster.isBoss) this.bossEntrance(monster)
      }
    }
    this.effects = updateEffects(this.effects, dt)
    this.updateDoors(dt)
    this.retaliate()
    this.guildRoutine()
    this.musicAndDance()
    this.masterChat()
    this.campaign()

    this.drill()
    this.residentsWork()
    this.playTables()
    this.tavernTalk()
    this.banter()
    this.guildBanter()
    this.sayLines()
    this.snore()
  }

  /** A boss walks in: a red warning, a burst and a shake. */
  private bossEntrance(monster: Monster): void {
    this.effects.push({ kind: 'damage', x: monster.at.x + 0.5, y: monster.at.y - 1.2, age: 0, ttl: 1.6, text: 'CHEFE!', color: '#ff4d4d' })
    this.burst(monster.at.x + 0.5, monster.at.y + 0.3, '#ff4d4d', 0.8)
    this.shakeUntil.set(monster.room, this.time + 0.5)
    this.nextRetaliate.set(monster.room, this.time + 1.2)
  }

  /** Doors swing open when someone comes near and shut a moment after they pass. */
  private updateDoors(dt: number): void {
    for (const door of this.map.doors) {
      const key = door.y * this.map.cols + door.x
      const state = this.doors.get(key) ?? { open: 0, hold: 0 }
      let near = false
      for (const actor of this.actors.values()) {
        if (actor.isHidden) continue
        if (Math.abs(actor.x - door.x) < 1.9 && Math.abs(actor.y - door.y) < 1.9) {
          near = true
          break
        }
      }
      state.hold = near ? 0.7 : Math.max(0, state.hold - dt)
      const goal = state.hold > 0 ? 1 : 0
      state.open += Math.max(-dt * 2.5, Math.min(dt * 5, goal - state.open))
      this.doors.set(key, state)
    }
  }

  /** The minstrel plays: notes float up, and idle drinkers in the taverna sway to the beat now and then. */
  private musicAndDance(): void {
    const minstrel = this.actors.get('resident/menestrel')
    if (minstrel && this.time >= this.nextNote) {
      this.nextNote = this.time + 0.5 + Math.random() * 0.5
      this.effects.push({
        kind: 'note',
        x: minstrel.x + 0.3 + Math.random() * 0.5,
        y: minstrel.y - 0.2,
        age: 0,
        ttl: 2.4,
        text: Math.random() < 0.5 ? '1' : '2',
        color: oneOf(NOTE_COLORS),
      })
    }
    const beat = Math.abs(Math.sin(this.time * 5.5)) > 0.8 ? 1 : 0
    for (const actor of this.actors.values()) {
      if (actor.residentId === 'menestrel') {
        actor.hop = beat
        continue
      }
      // Each drinker dances for a stretch, then rests, on its own schedule.
      const dancing = actor.place === 'taverna' && !actor.isMoving && !actor.isSleeping && (this.time + actor.x * 3.7 + actor.y * 1.3) % 17 < 9
      actor.hop = dancing ? (Math.abs(Math.sin(this.time * 5.5 + actor.x)) > 0.55 ? 2 : 0) : 0
    }
  }

  /** The Mestre do Claude chats with whoever is idle in the sala de jogos. */
  private masterChat(): void {
    if (this.time < this.nextMasterChat) return
    this.nextMasterChat = this.time + 18 + Math.random() * 14
    const master = this.actors.get('resident/mestre')
    if (!master || (master.bubble && master.bubble.until > this.time)) return
    const candidates = this.idleAt('jogos').filter(a => !a.residentId)
    const listener = candidates[Math.floor(Math.random() * candidates.length)]
    if (!listener) return
    this.converse([master, listener], oneOf(MASTER_CHATS))
  }

  /**
   * Now and then the Mestre runs a session of Masmorras & Dragões for up to
   * three idle people in the sala de jogos: he opens, sets a scene, and each
   * player rolls a d20 (with the master's comeback), reusing the games' lines.
   */
  private campaign(): void {
    for (const roll of [...this.rolls]) {
      if (this.time < roll.at) continue
      this.rolls = this.rolls.filter(r => r !== roll)
      const player = this.actors.get(roll.playerId)
      const master = this.actors.get('resident/mestre')
      if (!player || !master || player.isMoving) continue
      const round = playRound('rpg')
      const { player: line, master: comeback } = rpgLines(round)
      const natural = round.values[1]
      player.attack(master.tile)
      player.bubble = { text: line, until: this.time + 3 }
      this.effects.push({
        kind: 'damage',
        x: player.x + 0.5,
        y: player.y - 0.4,
        age: 0,
        ttl: 1.2,
        text: `d20: ${natural}`,
        color: natural === 20 ? '#ffd34d' : natural === 1 ? '#ff4d4d' : '#c9b0ff',
      })
      if (natural === 20) this.burst(player.x + 0.5, player.y + 0.3, '#ffd34d', 0.8)
      this.say(master, comeback, this.time + 2.2, 2.8)
    }
    if (this.time < this.nextCampaign) return
    this.nextCampaign = this.time + 55 + Math.random() * 40
    const master = this.actors.get('resident/mestre')
    const players = this.idleAt('jogos').filter(a => !a.residentId).slice(0, 3)
    if (!master || players.length === 0) return
    let at = this.time
    this.say(master, oneOf(MASTER_OPENERS), at, 3)
    for (const player of players) {
      at += 3.2
      this.say(master, `${player.label}... ${rpgScene()}`, at, 3)
      this.rolls.push({ at: at + 2.4, playerId: player.id })
      at += 2.6
    }
    this.nextMasterChat = Math.max(this.nextMasterChat, at + 6)
  }

  /** Training room: members whose class is home hit their targets, or shoot at them, now and then. */
  private drill(): void {
    const away = new Set<ClassId>()
    for (const actor of this.actors.values()) if (actor.heroId && actor.cls) away.add(actor.cls)

    for (const station of this.map.room('treino').stations) {
      const actor = this.actors.get(`treino/${station.cls}`)
      if (!actor) continue
      actor.isHidden = away.has(station.cls)
      if (actor.isHidden || actor.isMoving) continue
      if (actor.place === 'jogos') {
        this.throwDarts(actor)
        continue
      }
      if (actor.place !== 'treino') continue
      const key = actor.id
      const next = this.nextDrill.get(key) ?? this.time + Math.random() * 2
      if (this.time < next) {
        this.nextDrill.set(key, next)
        continue
      }
      this.nextDrill.set(key, this.time + 1.4 + Math.random() * 2)
      actor.attack(station.target)
      const tileIndex = station.target.y * this.map.cols + station.target.x
      if (station.kind === 'dummy') {
        this.targetHits.set(tileIndex, this.time)
        continue
      }
      // Ranged: a spell, a dagger or an arrow flies to the target and hits it on arrival.
      const shape = station.kind === 'daggers' ? 'dagger' : station.kind === 'archery' ? 'arrow' : 'orb'
      const flight = shape === 'orb' ? 0.45 : 0.3
      this.effects.push({
        kind: 'bolt',
        shape,
        x: station.stand.x + 0.5,
        y: station.stand.y + 0.4,
        tx: station.target.x + 0.5,
        ty: station.target.y + 0.4,
        age: 0,
        ttl: flight,
        color: station.kind === 'crystal' ? '#5fc9ff' : station.kind === 'orb' ? '#ffd34d' : undefined,
      })
      this.targetHits.set(tileIndex, this.time + flight)
    }
  }

  /** A member on its break in the sala de jogos throws darts at the board now and then. */
  private throwDarts(actor: Actor): void {
    const board = this.map.room('jogos').guestFacing
    if (!board) return
    const next = this.nextDrill.get(actor.id) ?? this.time + Math.random() * 2
    if (this.time < next) {
      this.nextDrill.set(actor.id, next)
      return
    }
    this.nextDrill.set(actor.id, this.time + 2.2 + Math.random() * 2.5)
    actor.attack(board)
    this.effects.push({ kind: 'bolt', shape: 'dagger', x: actor.x + 0.5, y: actor.y + 0.4, tx: board.x + 0.5, ty: board.y + 0.7, age: 0, ttl: 0.25 })
  }

  /** The residents never stop: a stroke of work every couple of seconds, and a line now and then. */
  private residentsWork(): void {
    for (const resident of this.map.residents) {
      const actor = this.actors.get(`resident/${resident.id}`)
      if (!actor) continue
      const busy = resident.id === 'mercador' && this.market?.busy
      const next = this.nextWork.get(resident.id) ?? this.time + Math.random() * 2
      if (this.time >= next) {
        const pause = resident.id === 'mercador' ? (busy ? 0.5 : 1.1) : resident.id === 'mestre' ? 3.8 : resident.id === 'menestrel' ? 5 : 2.6
        this.nextWork.set(resident.id, this.time + pause + Math.random() * pause)
        if (resident.id === 'mercador') this.work(actor, resident.workAt, 'coin')
        else if (resident.id === 'alquimista' || resident.id === 'mestre') this.work(actor, resident.workAt, 'spark')
        else if (resident.id === 'taverneiro') actor.attack(resident.workAt)
      } else {
        this.nextWork.set(resident.id, next)
      }

      const mutter = this.nextMutter.get(resident.id) ?? this.time + 3 + Math.random() * 6
      if (this.time < mutter || actor.bubble?.until && actor.bubble.until > this.time) {
        this.nextMutter.set(resident.id, mutter)
        continue
      }
      this.nextMutter.set(resident.id, this.time + (resident.id === 'mercador' ? 7 : 12) + Math.random() * 8)
      actor.bubble = { text: this.residentLine(resident.id), until: this.time + (resident.id === 'mercador' ? 6 : 4) }
    }
  }

  /** The merchant reads the headlines out, one by one, then goes back to muttering. */
  private residentLine(id: ResidentId): string {
    if (id === 'mercador') {
      if (this.market?.busy) return 'Lendo os jornais da manhã...'
      const headline = this.newsQueue.shift()
      if (headline) return `📰 ${headline}`
      if (this.market && Math.random() < 0.4) {
        const all = [...this.market.headlines, ...this.market.highlights.map(h => h.title)]
        if (all.length) return `📰 ${oneOf(all)}`
      }
    }
    return oneOf(RESIDENT_LINES[id])
  }

  /** Sala de jogos: each occupied table plays a round every few seconds. */
  private playTables(): void {
    const jogos = this.map.room('jogos')
    for (const [index, table] of this.tables) {
      const players = table.players.map(id => this.actors.get(id))
      const [a, b] = players
      if (!a || !b || a.isMoving || b.isMoving) continue
      const game = TABLE_GAMES[index] ?? 'dados'
      const center = jogos.tables[index]!.center

      if (game === 'rpg') {
        // The master (side 0) describes the scene; a moment later the player rolls the d20.
        if (table.rollAt === undefined && this.time >= table.nextRound) {
          a.bubble = { text: rpgScene(), until: this.time + 3 }
          table.rollAt = this.time + 2.2
        } else if (table.rollAt !== undefined && this.time >= table.rollAt) {
          table.rollAt = undefined
          table.nextRound = this.time + ROUND_EVERY + 2 + Math.random() * 2
          const round = playRound('rpg')
          table.last = { ...round, at: this.time }
          table.score[round.winner]++
          const { player, master } = rpgLines(round)
          b.attack(center)
          b.bubble = { text: player, until: this.time + 3 }
          this.say(a, master, this.time + 2.4, 3)
        }
        continue
      }

      if (this.time < table.nextRound) continue
      table.nextRound = this.time + ROUND_EVERY + Math.random() * 2
      const round = playRound(game)
      table.last = { ...round, at: this.time }
      table.score[round.winner]++

      const winner = players[round.winner]!
      const loser = players[1 - round.winner]!
      if (round.game === 'braco') {
        winner.attack(center)
        loser.attack(center)
      }
      const vars = {
        winner: winner.label,
        loser: loser.label,
        hits: this.world.heroes[winner.heroId]?.hits ?? 0,
      }
      winner.bubble = { text: taunt('win', vars), until: this.time + 3 }
      loser.bubble = { text: taunt('lose', vars), until: this.time + 3 }
    }
  }

  private tavernTalk(): void {
    if (this.time < this.nextChatter) return
    this.nextChatter = this.time + 7 + Math.random() * 6
    const drinkers = this.idleAt('taverna')
    const speaker = drinkers[Math.floor(Math.random() * drinkers.length)]
    if (speaker) speaker.bubble = { text: oneOf(TAVERN_TALK), until: this.time + 4 }
  }

  /** Heroes standing still somewhere, quiet, not in the middle of a conversation. */
  private idleAt(place: string): Actor[] {
    const talking = new Set(this.lines.map(l => l.actorId))
    return [...this.actors.values()].filter(
      a => a.place === place && !a.isMoving && !a.isLeaving && !talking.has(a.id) && !(a.bubble && a.bubble.until > this.time),
    )
  }

  /** Two idle heroes in the same place talk to each other. */
  private banter(): void {
    if (this.time < this.nextBanter) return
    this.nextBanter = this.time + 9 + Math.random() * 7
    const groups = (['taverna', 'jogos', 'floresta'] as const).map(place => this.idleAt(place)).filter(g => g.length >= 2)
    const group = groups[Math.floor(Math.random() * groups.length)]
    if (!group) return
    const first = group.splice(Math.floor(Math.random() * group.length), 1)[0]!
    const second = group[Math.floor(Math.random() * group.length)]!
    this.converse([first, second], oneOf(CONVERSATIONS))
  }

  /** Guild members at home chat between drills. */
  private guildBanter(): void {
    if (this.time < this.nextGuildBanter) return
    this.nextGuildBanter = this.time + 14 + Math.random() * 10
    const home = (cls: string) => {
      const actor = this.actors.get(`treino/${cls}`)
      return actor && !actor.isHidden && !actor.isMoving && actor.place === 'treino' ? actor : undefined
    }
    const options = GUILD_BANTER.filter(b => home(b.a) && home(b.b))
    if (options.length === 0) return
    const pick = oneOf(options)
    this.converse([home(pick.a)!, home(pick.b)!], pick.lines)
  }

  private converse(speakers: Actor[], script: readonly string[]): void {
    script.forEach((text, i) => this.say(speakers[i % speakers.length]!, text, this.time + i * LINE_GAP, LINE_GAP + 0.6))
  }

  private say(actor: Actor, text: string, at: number, seconds: number): void {
    this.lines.push({ actorId: actor.id, text, at, for: seconds })
  }

  private sayLines(): void {
    if (this.lines.length === 0) return
    const due = this.lines.filter(l => l.at <= this.time)
    this.lines = this.lines.filter(l => l.at > this.time)
    for (const line of due) {
      const actor = this.actors.get(line.actorId)
      if (!actor || actor.isHidden || actor.isMoving || actor.bubble?.isAlert) continue
      actor.bubble = { text: line.text, until: this.time + line.for }
    }
  }

  /** Caverna: a "z" floats up from each sleeper. */
  private snore(): void {
    if (this.time < this.nextSnore) return
    this.nextSnore = this.time + 0.9
    for (const actor of this.actors.values()) {
      if (!actor.isSleeping || actor.isMoving) continue
      this.effects.push({ kind: 'z', x: actor.x + 0.7, y: actor.y - 0.1, age: 0, ttl: 2, text: Math.random() < 0.5 ? 'z' : 'Z' })
    }
  }

  /** Who is under a world-pixel point: a hero (a member selects its hero) or a resident. */
  pick(world: Point): Selection | undefined {
    let best: { selection: Selection; distance: number } | undefined
    for (const actor of this.actors.values()) {
      if (actor.isHidden) continue
      const selection: Selection | undefined = actor.heroId
        ? { kind: 'hero', id: actor.heroId }
        : actor.residentId
          ? { kind: 'resident', id: actor.residentId }
          : undefined
      if (!selection) continue
      const cx = (actor.x + 0.5) * T
      const cy = (actor.y + 0.5) * T
      const distance = Math.hypot(world.x - cx, world.y - cy)
      if (distance < T * 0.75 && (!best || distance < best.distance)) best = { selection, distance }
    }
    return best?.selection
  }

  /** How many heroes each room holds right now, for the signs (keyed by project, or the room's name). */
  private occupancy(): Map<string, number> {
    const counts = new Map<string, number>()
    const add = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1)
    for (const [heroId, place] of this.places) {
      if (place.kind === 'project') add(this.world.heroes[heroId]?.room ?? '')
      else if (place.kind === 'taverna') add('Taverna')
      else if (place.kind === 'jogos') add('Sala de jogos')
      else if (place.kind === 'floresta') add('Floresta')
    }
    return counts
  }

  // ---- drawing -------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = VOID
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false

    const z = camera.zoom
    const shake = this.shakeOffset(camera, width, height)
    ctx.setTransform(z, 0, 0, z, Math.round(-camera.x * z) + shake.x * z, Math.round(-camera.y * z) + shake.y * z)
    ctx.drawImage(this.layer(), 0, 0)
    this.drawWater(ctx)
    this.drawFireLight(ctx)
    this.drawRoomLight(ctx)
    this.drawGroundProps(ctx)
    this.drawDoors(ctx)
    this.drawSprites(ctx)
    this.drawPet(ctx)
    this.drawEffects(ctx)
    this.drawWildlife(ctx)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.drawLabels(ctx, camera)
  }

  /** A light tremble (in world pixels) while a visible project room has just been hit hard. */
  private shakeOffset(camera: Camera, width: number, height: number): Point {
    if (this.shakeUntil.size === 0) return { x: 0, y: 0 }
    let strength = 0
    for (const [roomName, until] of this.shakeUntil) {
      if (until <= this.time) {
        this.shakeUntil.delete(roomName)
        continue
      }
      const room = this.projectRoom(roomName)
      if (!room) continue
      const left = room.x * T
      const top = room.y * T
      const visible =
        left < camera.x + width / camera.zoom && left + room.w * T > camera.x && top < camera.y + height / camera.zoom && top + ROOM_H * T > camera.y
      if (visible) strength = Math.max(strength, Math.min(1, (until - this.time) / 0.2))
    }
    if (strength === 0) return { x: 0, y: 0 }
    return { x: Math.round(Math.sin(this.time * 95) * strength), y: Math.round(Math.cos(this.time * 83) * strength) }
  }

  /** The doors: shut they are a wooden leaf over the gap; open, the leaf is swung back to the hinge. */
  private drawDoors(ctx: CanvasRenderingContext2D): void {
    for (const door of this.map.doors) {
      const open = this.doors.get(door.y * this.map.cols + door.x)?.open ?? 0
      const px = door.x * T
      const py = door.y * T
      const w = Math.max(3, Math.round(T * (1 - open * 0.85)))
      if (open > 0.05) {
        ctx.fillStyle = 'rgba(10, 6, 12, 0.35)'
        ctx.fillRect(px, py, T, 3)
      }
      ctx.fillStyle = '#6a4428'
      ctx.fillRect(px, py, w, T)
      ctx.fillStyle = '#4a2f1c'
      for (let x = 4; x < w; x += 4) ctx.fillRect(px + x, py, 1, T)
      ctx.fillStyle = '#2b1a10'
      ctx.fillRect(px, py, 1, T)
      ctx.fillRect(px + w - 1, py, 1, T)
      ctx.fillRect(px, py, w, 1)
      ctx.fillStyle = '#3a3a48'
      ctx.fillRect(px, py + 3, w, 2)
      ctx.fillRect(px, py + 11, w, 2)
      if (w > 8) {
        ctx.fillStyle = '#d9a441'
        ctx.fillRect(px + w - 4, py + 7, 2, 2)
      }
    }
  }

  /** The Mestre's pet dragon flies in loops around him. */
  private drawPet(ctx: CanvasRenderingContext2D): void {
    const master = this.actors.get('resident/mestre')
    if (!master) return
    const a = this.time * 1.25
    const x = (master.x + 0.5) * T + Math.cos(a) * 22
    const y = master.y * T + 2 + Math.sin(a * 2) * 4 + Math.sin(a) * 5
    drawDragon(ctx, x, y, this.time, -Math.sin(a) < 0)
  }

  /** Floors and sheet decorations never move: drawn once per map into an offscreen canvas. */
  private layer(): HTMLCanvasElement {
    if (this.staticLayer && this.staticFor === this.map) return this.staticLayer
    const { cols, rows, floor, deco } = this.map
    const canvas = this.staticLayer ?? document.createElement('canvas')
    canvas.width = cols * T
    canvas.height = rows * T
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    this.water = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const f = floor[i]!
        if (isDrawnFloor(f)) this.drawFloor(ctx, f, x, y)
        else if (f >= 0) drawTile(ctx, this.sheet, f, x * T, y * T)
        if (f === FLOOR.water) this.water.push({ x, y })
        const d = deco[i]!
        if (d >= 0) drawTile(ctx, this.sheet, d, x * T, y * T)
      }
    }
    this.staticLayer = canvas
    this.staticFor = this.map
    return canvas
  }

  /** Grass, water, planks and gold floor: the floors the sheet does not have. */
  private drawFloor(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number): void {
    const px = x * T
    const py = y * T
    const n = (k: number) => (hashString(`${x}:${y}:${k}`) % 1000) / 1000
    if (tile === FLOOR.grass || tile === FLOOR.grassAlt) {
      ctx.fillStyle = tile === FLOOR.grass ? '#3b7436' : '#417b39'
      ctx.fillRect(px, py, T, T)
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = k % 2 ? '#4f8d43' : '#2f6230'
        ctx.fillRect(px + Math.floor(n(k) * 15), py + Math.floor(n(k + 7) * 14), 1, 2)
      }
    } else if (tile === FLOOR.water) {
      ctx.fillStyle = '#2a6a96'
      ctx.fillRect(px, py, T, T)
      ctx.fillStyle = '#3a82b4'
      ctx.fillRect(px + Math.floor(n(1) * 10), py + 4 + Math.floor(n(2) * 8), 5, 1)
    } else if (tile === FLOOR.wood) {
      ctx.fillStyle = '#6e4a2e'
      ctx.fillRect(px, py, T, T)
      ctx.fillStyle = '#5a3c25'
      for (let k = 0; k < 4; k++) ctx.fillRect(px, py + k * 4 + 3, T, 1)
      ctx.fillRect(px + ((x * 5 + y * 3) % 12) + 2, py, 1, T)
      ctx.fillStyle = '#7d5636'
      ctx.fillRect(px + Math.floor(n(3) * 12), py + Math.floor(n(4) * 4) * 4, 3, 1)
    } else if (tile === FLOOR.rock) {
      this.drawRock(ctx, x, y, n)
    } else if (tile === FLOOR.gold) {
      ctx.fillStyle = '#6b5222'
      ctx.fillRect(px, py, T, T)
      ctx.fillStyle = '#8a6a2a'
      ctx.fillRect(px + 1, py + 1, 6, 6)
      ctx.fillRect(px + 9, py + 1, 6, 6)
      ctx.fillRect(px + 1, py + 9, 6, 6)
      ctx.fillRect(px + 9, py + 9, 6, 6)
      if (n(5) < 0.25) {
        ctx.fillStyle = '#f2c544'
        ctx.fillRect(px + 3 + Math.floor(n(6) * 9), py + 3 + Math.floor(n(7) * 9), 2, 1)
      }
    }
  }

  /** Rock: a textured stone tile, now and then a boulder, a crystal or a bit of moss near the forest. */
  private drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, n: (k: number) => number): void {
    const px = x * T
    const py = y * T
    const near = (dx: number, dy: number) => {
      const f = this.map.floor[(y + dy) * this.map.cols + (x + dx)]
      return f !== undefined && f !== FLOOR.rock && x + dx >= 0 && x + dx < this.map.cols
    }
    ctx.fillStyle = '#3a3036'
    ctx.fillRect(px, py, T, T)
    // Lighter stones and dark cracks, placed by the tile's own noise.
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#463b42' : '#42373e'
      ctx.fillRect(px + Math.floor(n(k + 10) * 12), py + Math.floor(n(k + 20) * 12), 3 + Math.floor(n(k + 30) * 3), 2 + Math.floor(n(k + 40) * 2))
    }
    ctx.fillStyle = '#2a2227'
    ctx.fillRect(px + Math.floor(n(50) * 13), py + Math.floor(n(51) * 13), 3, 1)
    ctx.fillRect(px + Math.floor(n(52) * 14), py + Math.floor(n(53) * 13), 1, 3)
    // A darker rim where the rock meets a floor, so rooms and the cave read as dug out of it.
    ctx.fillStyle = 'rgba(20, 14, 18, 0.45)'
    if (near(0, 1)) ctx.fillRect(px, py + 13, T, 3)
    if (near(0, -1)) ctx.fillRect(px, py, T, 2)
    if (near(1, 0)) ctx.fillRect(px + 14, py, 2, T)
    if (near(-1, 0)) ctx.fillRect(px, py, 2, T)

    const roll = n(60)
    if (roll < 0.07) {
      // A boulder.
      ctx.fillStyle = '#2a2227'
      ctx.fillRect(px + 3, py + 13, 10, 2)
      ctx.fillStyle = '#5a4d54'
      ctx.fillRect(px + 3, py + 6, 10, 8)
      ctx.fillRect(px + 5, py + 4, 6, 2)
      ctx.fillStyle = '#6e6067'
      ctx.fillRect(px + 5, py + 6, 4, 2)
    } else if (roll < 0.1) {
      // A crystal cluster, purple or teal.
      const [base, light] = n(61) < 0.5 ? ['#7d4fd6', '#c9b0ff'] : ['#2f9fb0', '#9fe8f0']
      ctx.fillStyle = base
      ctx.fillRect(px + 6, py + 5, 3, 9)
      ctx.fillRect(px + 9, py + 8, 2, 6)
      ctx.fillRect(px + 4, py + 9, 2, 5)
      ctx.fillStyle = light
      ctx.fillRect(px + 6, py + 5, 1, 4)
      ctx.fillRect(px + 9, py + 8, 1, 2)
    } else if (roll < 0.13) {
      // A small stalagmite.
      ctx.fillStyle = '#54474e'
      ctx.fillRect(px + 7, py + 4, 2, 4)
      ctx.fillRect(px + 6, py + 8, 4, 4)
      ctx.fillRect(px + 5, py + 12, 6, 2)
      ctx.fillStyle = '#6e6067'
      ctx.fillRect(px + 7, py + 5, 1, 7)
    }
    if (y >= this.map.forestY - 1 && n(62) < 0.5) {
      // Moss where the rock meets the forest.
      ctx.fillStyle = '#3f6b3a'
      ctx.fillRect(px + Math.floor(n(63) * 10), py + 10 + Math.floor(n(64) * 4), 5, 2)
    }
  }

  /** Glints that drift across the pond. */
  private drawWater(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(200, 235, 255, 0.55)'
    for (const [k, w] of this.water.entries()) {
      const phase = (this.time * 0.5 + k * 0.37) % 3
      if (phase > 1) continue
      ctx.fillRect(w.x * T + 3 + Math.floor(phase * 8), w.y * T + 6 + (k % 3) * 3, 3, 1)
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

  /** The Câmara de ouro shines; the Biblioteca has the dim green of the lab. */
  private drawRoomLight(ctx: CanvasRenderingContext2D): void {
    for (const room of this.map.rooms) {
      if (room.kind !== 'tesouro' && room.kind !== 'estudos') continue
      const cx = (room.x + room.w / 2) * T
      const cy = (room.y + ROOM_H / 2) * T
      const pulse = room.kind === 'tesouro' ? 0.12 + Math.sin(this.time * 1.5) * 0.03 : 0.07
      const color = room.kind === 'tesouro' ? '255, 200, 80' : '110, 220, 160'
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, room.w * T * 0.6)
      glow.addColorStop(0, `rgba(${color}, ${pulse})`)
      glow.addColorStop(1, `rgba(${color}, 0)`)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = glow
      ctx.fillRect(room.x * T, room.y * T, room.w * T, ROOM_H * T)
      ctx.restore()
    }
  }

  private propContext(prop: { x: number; y: number }) {
    const hitAt = this.targetHits.get(prop.y * this.map.cols + prop.x)
    const hitAge = hitAt === undefined || hitAt > this.time ? 10 : this.time - hitAt
    return { time: this.time, hitAge, marketBusy: this.market?.busy === true }
  }

  private drawGroundProps(ctx: CanvasRenderingContext2D): void {
    for (const prop of this.map.props) {
      if (GROUND_PROPS.has(prop.kind)) drawProp(ctx, prop, this.propContext(prop))
    }
  }

  private drawSprites(ctx: CanvasRenderingContext2D): void {
    type Drawable = { y: number; draw: () => void }
    const list: Drawable[] = []

    for (const prop of this.map.props) {
      if (GROUND_PROPS.has(prop.kind)) continue
      // Targets and tables sit a bit "behind" whoever stands on the same row.
      list.push({ y: prop.y - (TARGETS.has(prop.kind) ? 0.01 : 0), draw: () => drawProp(ctx, prop, this.propContext(prop)) })
    }

    for (const monster of this.monsters.values()) {
      if (!monster.isAlive) continue
      list.push({
        y: monster.at.y,
        draw: () => {
          const bob = Math.round(Math.sin(this.time * 3) * 1)
          const adv = monster.advance
          const px = monster.at.x * T + Math.round(adv.x)
          const py = monster.at.y * T + bob + Math.round(adv.y)
          const source = monster.flash > 0 ? this.white : this.sheet
          if (monster.isBoss) {
            // A boss is the same monster at twice the size, in a red glow.
            const cx = px + 8
            const cy = py + 4
            const aura = ctx.createRadialGradient(cx, cy, 4, cx, cy, 30)
            aura.addColorStop(0, `rgba(255, 60, 40, ${0.28 + Math.sin(this.time * 6) * 0.06})`)
            aura.addColorStop(1, 'rgba(255, 60, 40, 0)')
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ctx.fillStyle = aura
            ctx.fillRect(cx - 30, cy - 30, 60, 60)
            ctx.restore()
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
            ctx.beginPath()
            ctx.ellipse(px + 8, monster.at.y * T + 15, 11, 3.5, 0, 0, Math.PI * 2)
            ctx.fill()
            drawTile(ctx, source, monster.sprite, px - 8, py - 16, 32)
            ctx.fillStyle = '#2a0f12'
            ctx.fillRect(px - 7, py - 21, 30, 4)
            ctx.fillStyle = '#e8462b'
            ctx.fillRect(px - 6, py - 20, Math.round((28 * monster.hp) / monster.maxHp), 2)
            ctx.fillStyle = '#ffd34d'
            ctx.fillRect(px - 7, py - 22, 30, 1)
          } else {
            this.shadow(ctx, px, monster.at.y * T)
            drawTile(ctx, source, monster.sprite, px, py)
            // HP bar
            ctx.fillStyle = '#2a0f12'
            ctx.fillRect(px + 1, py - 4, 14, 3)
            ctx.fillStyle = '#e8462b'
            ctx.fillRect(px + 2, py - 3, Math.round((12 * monster.hp) / monster.maxHp), 1)
          }
        },
      })
    }

    for (const actor of this.actors.values()) {
      if (actor.isHidden) continue
      list.push({
        y: actor.y,
        draw: () => {
          const offset = actor.offset
          const px = Math.round(actor.x * T + offset.x)
          const py = Math.round(actor.y * T + offset.y)
          this.shadow(ctx, Math.round(actor.x * T), Math.round(actor.y * T))
          const isSelected =
            (actor.heroId && actor.heroId === this.selectedHeroId && !actor.isMember) ||
            (actor.residentId && this.selected?.kind === 'resident' && this.selected.id === actor.residentId)
          if (isSelected) {
            ctx.strokeStyle = '#ffd34d'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.ellipse(actor.x * T + 8, actor.y * T + 15, 7, 3, 0, 0, Math.PI * 2)
            ctx.stroke()
          }
          drawSprite(ctx, actor.hurt > 0 ? this.white : this.sheet, actor.sprite, px, py, T, actor.facingLeft)
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
      } else if (effect.kind === 'bolt') {
        const tx = (effect.tx ?? effect.x) * T
        const ty = (effect.ty ?? effect.y) * T
        const x = px + (tx - px) * t
        const y = py + (ty - py) * t - Math.sin(t * Math.PI) * (effect.shape === 'orb' ? 3 : 1)
        if (effect.shape === 'orb') {
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = effect.color ?? '#9b7bff'
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          ctx.arc(px + (tx - px) * Math.max(0, t - 0.12), py + (ty - py) * Math.max(0, t - 0.12), 1.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        } else {
          const angle = Math.atan2(ty - py, tx - px)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(angle)
          ctx.fillStyle = effect.shape === 'dagger' ? '#d6dde6' : '#c9a36b'
          ctx.fillRect(-4, -0.5, 7, 1)
          ctx.fillStyle = effect.shape === 'dagger' ? '#3a2e40' : '#f3eadb'
          ctx.fillRect(-5, -1, 2, 2)
          ctx.restore()
        }
      } else if (effect.kind === 'burst') {
        // Pixels flying out and falling; every third one is a bright spark.
        const base = effect.x * 7.3 + effect.y * 3.1
        for (let k = 0; k < 9; k++) {
          const angle = base + k * 0.7
          const speed = 9 + ((k * 5) % 7) * 2.2
          const x = px + Math.cos(angle) * speed * t
          const y = py + Math.sin(angle) * speed * t * 0.8 + t * t * 9
          ctx.globalAlpha = 1 - t * t
          ctx.fillStyle = k % 3 === 0 ? '#ffffff' : (effect.color ?? '#ffd34d')
          const s = t < 0.55 ? 2 : 1
          ctx.fillRect(Math.round(x), Math.round(y), s, s)
        }
        ctx.globalAlpha = 1
      } else if (effect.kind === 'note') {
        const x = Math.round(px + Math.sin(t * 5) * 4)
        const y = Math.round(py - t * 28)
        ctx.globalAlpha = 1 - t * t
        ctx.fillStyle = '#120d16'
        ctx.fillRect(x - 1, y - 1, 5, 4)
        ctx.fillStyle = effect.color ?? '#ffd34d'
        ctx.fillRect(x, y, 3, 2)
        ctx.fillRect(x + 2, y - 5, 1, 6)
        if (effect.text === '2') {
          ctx.fillRect(x + 5, y + 1, 3, 2)
          ctx.fillRect(x + 7, y - 4, 1, 6)
          ctx.fillRect(x + 2, y - 5, 6, 1)
        } else {
          ctx.fillRect(x + 3, y - 4, 2, 1)
        }
        ctx.globalAlpha = 1
      } else if (effect.kind === 'coin') {
        const y = py - t * 10
        ctx.globalAlpha = 1 - t * t
        ctx.fillStyle = '#b07d1a'
        ctx.fillRect(px - 2, y, 4, 4)
        ctx.fillStyle = '#f2c544'
        ctx.fillRect(px - 2 + Math.round(Math.sin(t * 12)), y, 3, 3)
        ctx.globalAlpha = 1
      } else if (effect.kind === 'spark') {
        ctx.fillStyle = `rgba(150, 255, 190, ${1 - t})`
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + t * 3
          ctx.fillRect(px + Math.cos(a) * t * 7, py - t * 8 + Math.sin(a) * 2, 1.5, 1.5)
        }
      }
    }
  }

  /** Butterflies over the forest, a bird now and then. Pure functions of time: no state to keep. */
  private drawWildlife(ctx: CanvasRenderingContext2D): void {
    const top = this.map.forestY * T
    const height = (this.map.rows - this.map.forestY) * T
    const width = this.map.cols * T
    const colors = ['#ffd34d', '#ff8ad8', '#f3f3f3', '#7fe0c8']
    for (let k = 0; k < 7; k++) {
      const x = ((k * 173 + this.time * (6 + k)) % width + width) % width
      const y = top + 12 + ((k * 61) % (height - 30)) + Math.sin(this.time * 1.7 + k) * 8
      const flap = Math.sin(this.time * 14 + k) > 0 ? 2 : 1
      ctx.fillStyle = colors[k % colors.length]!
      ctx.fillRect(x - flap, y, flap, 2)
      ctx.fillRect(x + 1, y, flap, 2)
    }
    // On the trail: a deer, a rabbit and a fox cross now and then.
    for (const walker of WALKERS) {
      const pose = walkerAt(walker, this.time, this.map.cols)
      if (!pose) continue
      const column = Math.max(0, Math.min(this.map.cols - 1, Math.floor(pose.x)))
      drawWalker(ctx, walker.kind, pose.x * T, (this.map.trailAt(column) + 1) * T - 2, pose.dir, this.time)
    }
    // On the pond: two ducks, and fish that jump.
    for (let k = 0; k < 2; k++) {
      drawDuck(ctx, duckAt(k, this.time, this.map.pond), this.time)
      const fish = fishAt(k, this.time, this.map.pond)
      if (fish) drawFish(ctx, fish)
    }
    const cycle = this.time % 26
    if (cycle < 9) {
      const x = (cycle / 9) * (width + 40) - 20
      const y = top - 18 + Math.sin(cycle * 2) * 4
      const wing = Math.sin(this.time * 10) > 0 ? -1 : 1
      ctx.fillStyle = '#2b1d2e'
      ctx.fillRect(x - 3, y + wing, 3, 1)
      ctx.fillRect(x, y, 1, 1)
      ctx.fillRect(x + 1, y + wing, 3, 1)
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const z = camera.zoom
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // Room signs, like the office plates in the reference video.
    const count = this.occupancy()
    for (const room of this.map.rooms) {
      // Top rooms wear their sign on the top wall, bottom rooms on the bottom one: never over the corridor.
      const sign = camera.toScreen((room.x + room.w / 2) * T, (room.isTop ? room.y : room.y + ROOM_H) * T)
      const title = room.name || 'Câmara selada'
      const color =
        room.kind === 'sealed' ? '#8a7d6a' : room.kind === 'project' ? '#f5e6c8' : room.kind === 'tesouro' ? '#ffe066' : '#ffd9a0'
      this.pill(ctx, sign.x, sign.y - 4, title, color, count.get(room.project ?? room.name) || undefined, z)
      if (room.kind === 'tesouro' && this.market) {
        const note = this.market.busy ? '📰 lendo as notícias…' : `📰 ${this.market.updatedLabel || 'notícias do dia'}`
        this.pill(ctx, sign.x, sign.y + (room.isTop ? 22 : -30), note, '#c9b8a0', undefined, Math.max(2, z - 1))
      }
    }
    this.drawTableResults(ctx, camera)
    const cave = camera.toScreen((this.map.fire.x + 0.5) * T, 1.2 * T)
    this.pill(ctx, cave.x, cave.y, 'Caverna', '#ffb366', undefined, z)
    const forest = camera.toScreen((this.map.gate.x + 0.5) * T, (this.map.forestY + 1.4) * T)
    this.pill(ctx, forest.x, forest.y, 'Portão · Floresta', '#9fe08a', count.get('Floresta') || undefined, z)

    // Name tags and speech bubbles.
    const font = Math.max(14, Math.min(19, z * 5))
    for (const actor of [...this.actors.values()].sort((a, b) => a.y - b.y)) {
      if (actor.isHidden) continue
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
      if (!bubble || bubble.until <= this.time || actor.isHidden) continue
      const head = camera.toScreen((actor.x + 0.5) * T, actor.y * T)
      ctx.font = `500 ${font}px "VT323", monospace`
      // Headlines are long: the merchant's bubbles get three lines, everyone else's two.
      const textLines = this.wrap(ctx, bubble.text, 250, actor.residentId === 'mercador' ? 3 : 2)
      const width = Math.max(...textLines.map(l => ctx.measureText(l).width)) + 14
      const lineHeight = font + 1
      const height = textLines.length * lineHeight + 9
      let bottom = head.y - 10
      for (let tries = 0; tries < 6; tries++) {
        const clash = placed.find(
          r => head.x - width / 2 < r.right && head.x + width / 2 > r.left && bottom - height < r.bottom && bottom > r.top,
        )
        if (!clash) break
        bottom = clash.top - 4
      }
      placed.push({ left: head.x - width / 2, right: head.x + width / 2, top: bottom - height, bottom })
      this.bubble(ctx, head.x, head.y - 4, bottom, textLines, lineHeight, width, height, bubble.isAlert)
    }

    for (const effect of this.effects) {
      if (effect.kind === 'z') {
        const t = effect.age / effect.ttl
        const p = camera.toScreen((effect.x + Math.sin(t * 6) * 0.2) * T, (effect.y - t * 1.2) * T)
        ctx.globalAlpha = 1 - t
        ctx.font = `700 ${font + Math.round(t * 6)}px "VT323", monospace`
        ctx.fillStyle = '#cfe3ff'
        ctx.fillText(effect.text ?? 'z', p.x, p.y)
        ctx.globalAlpha = 1
        continue
      }
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

  /** Over each game table: the last round's dice, cards or d20 for a moment, then the score. */
  private drawTableResults(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const z = camera.zoom
    const font = Math.max(14, Math.min(19, z * 5))
    const tables = this.map.room('jogos').tables
    for (const [index, table] of this.tables) {
      const spot = tables[index]
      if (!spot) continue
      const p = camera.toScreen((spot.center.x + 0.5) * T, spot.center.y * T)
      const fresh = table.last && this.time - table.last.at < RESULT_TIME ? table.last : undefined
      if (fresh?.game === 'rpg') {
        // Beside the master, at the table's height: above it the players' bubbles would cover the roll.
        const side = camera.toScreen((spot.center.x - 1.9) * T, (spot.center.y + 0.5) * T)
        this.drawD20(ctx, side.x - font * 1.6, side.y, font, fresh.values[1], fresh.values[0])
      } else if (fresh && fresh.game !== 'braco') {
        const faces = fresh.values.map(v => (fresh.game === 'cartas' ? cardFace(v) : String(v)))
        const size = font + 8
        faces.forEach((face, side) => {
          const x = p.x + (side === 0 ? -size * 0.7 : size * 0.7)
          const isWinner = side === fresh.winner
          ctx.fillStyle = fresh.game === 'cartas' ? '#fdf7ea' : '#ffffff'
          ctx.strokeStyle = isWinner ? '#ffd34d' : '#2b1d2e'
          ctx.lineWidth = 2
          const w = fresh.game === 'cartas' ? size * 0.75 : size
          ctx.beginPath()
          ctx.roundRect(x - w / 2, p.y - size - 4, w, size, 4)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = fresh.game === 'cartas' && side === 1 ? '#c0392b' : '#2b1d2e'
          ctx.font = `700 ${font}px "VT323", monospace`
          ctx.fillText(face, x, p.y - size / 2 - 3)
        })
      } else {
        const score = TABLE_GAMES[index] === 'rpg' ? `Mestre ${table.score[0]} × ${table.score[1]} Grupo` : `${table.score[0]} × ${table.score[1]}`
        this.pill(ctx, p.x, p.y - 10, score, '#ffd9a0', undefined, Math.max(2, z - 1))
      }
    }
  }

  /** A d20 (a hexagon) with the roll, and the difficulty beside it. */
  private drawD20(ctx: CanvasRenderingContext2D, x: number, y: number, font: number, roll: number, dc: number): void {
    const r = font * 0.9
    ctx.fillStyle = roll === 20 ? '#ffd34d' : roll === 1 ? '#e8462b' : '#a983ff'
    ctx.strokeStyle = '#2b1d2e'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#120d16'
    ctx.font = `700 ${font}px "VT323", monospace`
    ctx.fillText(String(roll), x, y + 1)
    ctx.font = `600 ${font - 3}px "VT323", monospace`
    ctx.fillStyle = 'rgba(18, 13, 22, 0.85)'
    const label = `CD ${dc}`
    const w = ctx.measureText(label).width + 8
    this.roundRect(ctx, x + r + 2, y - font / 2, w, font, 4)
    ctx.fillStyle = '#ffd9a0'
    ctx.fillText(label, x + r + 2 + w / 2, y + 1)
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

  /** Breaks a bubble's text into lines of at most `maxWidth`, shortening the last one (uses the current ctx.font). */
  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const lines: string[] = []
    let current = ''
    for (const word of text.split(' ')) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate
      else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
    if (lines.length > maxLines) {
      lines.length = maxLines
      lines[maxLines - 1] = `${lines[maxLines - 1]}…`
    }
    return lines.map(line => {
      let fitted = line
      while (fitted.length > 4 && ctx.measureText(fitted).width > maxWidth) fitted = `${fitted.slice(0, -2)}…`
      return fitted
    })
  }

  /** A speech bubble whose bottom edge sits at `bottom`, with a tail down to the head at (x, headY). */
  private bubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    headY: number,
    bottom: number,
    lines: string[],
    lineHeight: number,
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
    lines.forEach((line, i) => ctx.fillText(line, x, top + 5 + lineHeight * (i + 0.5) + 1))
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }
}
