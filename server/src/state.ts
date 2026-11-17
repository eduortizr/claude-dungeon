/**
 * The world as a pure reducer: `reduce(state, event)` returns the next state
 * and never mutates the one it was given. Everything the map and the side
 * panel show is derived here, so it is unit-tested in isolation.
 */
import { GUILD, classOfAgentType, heroNameFor, heroSpriteFor } from '../../shared/guild'
import type { Hero, HookEvent, PartyMember, TimelineEntry, TimelineKind, WorldState } from '../../shared/types'
import { describeTool, truncate } from './describe'

export const TIMELINE_LIMIT = 100
export const PARTY_LIMIT = 12
/** An offline hero leaves the map after this long. */
export const OFFLINE_TTL_MS = 5 * 60_000
/** A session that went quiet this long (killed without SessionEnd) is offline. */
export const SILENT_TTL_MS = 3 * 60 * 60_000

const THINKING = 'Pensando…'
const RESTING = 'Descansando na caverna'

export function emptyWorld(): WorldState {
  return { heroes: {}, updatedAt: 0 }
}

export function roomOf(cwd: string | undefined): string {
  if (!cwd) return 'Sem projeto'
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
}

function newHero(event: HookEvent): Hero {
  return {
    id: event.session_id,
    name: heroNameFor(event.session_id),
    sprite: heroSpriteFor(event.session_id),
    room: roomOf(event.cwd),
    cwd: event.cwd ?? '',
    status: 'idle',
    action: 'Chegando à guilda',
    startedAt: event.ts,
    lastEventAt: event.ts,
    hits: 0,
    party: [],
    timeline: [],
    stats: {
      prompts: 0,
      toolCalls: 0,
      subagents: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  }
}

function log(hero: Hero, ts: number, kind: TimelineKind, text: string, memberId?: string): void {
  const entry: TimelineEntry = memberId ? { ts, kind, text, memberId } : { ts, kind, text }
  hero.timeline.push(entry)
  if (hero.timeline.length > TIMELINE_LIMIT) hero.timeline.splice(0, hero.timeline.length - TIMELINE_LIMIT)
}

function startWorking(hero: Hero, ts: number): void {
  if (hero.status !== 'working') hero.workingSince = ts
  hero.status = 'working'
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}min ${seconds % 60}s`
}

function memberByAgentId(hero: Hero, agentId: string | undefined): PartyMember | undefined {
  return agentId ? hero.party.find(m => m.agentId === agentId) : undefined
}

function addMember(hero: Hero, member: PartyMember): void {
  hero.party.push(member)
  hero.stats.subagents++
  // Keep every working member; drop the oldest finished ones past the limit.
  while (hero.party.length > PARTY_LIMIT) {
    const index = hero.party.findIndex(m => m.status !== 'working')
    if (index < 0) break
    hero.party.splice(index, 1)
  }
}

function memberFromCall(event: HookEvent): PartyMember {
  const input = event.tool_input ?? {}
  const type = typeof input.subagent_type === 'string' ? input.subagent_type : 'general-purpose'
  const cls = classOfAgentType(type)
  const model = typeof input.model === 'string' ? input.model : GUILD[cls].model
  return {
    id: event.tool_use_id ?? `call-${event.ts}`,
    type,
    cls,
    model,
    description: typeof input.description === 'string' ? input.description : 'missão sem nome',
    status: 'working',
    action: 'A caminho da dungeon',
    toolCalls: 0,
    startedAt: event.ts,
  }
}

function applyEvent(hero: Hero, event: HookEvent): void {
  const { ts } = event
  const member = memberByAgentId(hero, event.agent_id)

  switch (event.event) {
    case 'SessionStart':
      hero.status = 'idle'
      hero.action = RESTING
      log(hero, ts, 'session', event.source === 'resume' ? 'Voltou à guilda' : 'Entrou na guilda')
      break

    case 'UserPromptSubmit':
      startWorking(hero, ts)
      hero.action = THINKING
      hero.stats.prompts++
      log(hero, ts, 'prompt', `Nova missão: "${truncate(event.prompt ?? '', 70)}"`)
      break

    case 'PreToolUse': {
      const tool = event.tool_name ?? 'ferramenta'
      const line = describeTool(tool, event.tool_input)
      if (member) {
        member.action = line
        member.toolCalls++
        log(hero, ts, 'tool', `${GUILD[member.cls].name}: ${line}`, member.id)
        break
      }
      startWorking(hero, ts)
      hero.action = line
      hero.stats.toolCalls++
      hero.hits++
      if (tool === 'Agent' || tool === 'Task') {
        const called = memberFromCall(event)
        addMember(hero, called)
        log(hero, ts, 'agent', `Convocou ${GUILD[called.cls].name}: ${called.description}`, called.id)
      } else {
        log(hero, ts, 'tool', line)
      }
      break
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      const failed = event.event === 'PostToolUseFailure' || event.tool_error === true
      if (member) {
        member.action = THINKING
        if (failed) log(hero, ts, 'notice', `${GUILD[member.cls].name} errou o golpe (${event.tool_name})`, member.id)
        break
      }
      if (hero.status === 'working') hero.action = THINKING
      if (failed) log(hero, ts, 'notice', `Golpe falhou: ${event.tool_name}`)
      break
    }

    case 'SubagentStart': {
      if (member) break
      // Pair the subagent with the oldest Agent call still waiting for its id.
      const pending = hero.party.find(
        m => !m.agentId && m.status === 'working' && (!event.agent_type || m.type === event.agent_type),
      )
      if (pending) {
        pending.agentId = event.agent_id
        pending.action = THINKING
        break
      }
      const cls = classOfAgentType(event.agent_type)
      const id = event.agent_id ?? `agent-${ts}`
      addMember(hero, {
        id,
        agentId: event.agent_id,
        type: event.agent_type ?? 'general-purpose',
        cls,
        model: GUILD[cls].model,
        description: event.agent_type ?? 'subagente',
        status: 'working',
        action: THINKING,
        toolCalls: 0,
        startedAt: ts,
      })
      log(hero, ts, 'agent', `${GUILD[cls].name} entrou na party`, id)
      break
    }

    case 'SubagentStop':
      if (!member) break
      member.status = 'done'
      member.endedAt = ts
      member.action = 'Missão cumprida'
      log(
        hero,
        ts,
        'agent',
        `${GUILD[member.cls].name} voltou em ${formatDuration(ts - member.startedAt)}: ${member.description}`,
        member.id,
      )
      break

    case 'Notification':
      hero.status = 'waiting'
      hero.action = truncate(event.message ?? 'Aguardando você')
      log(hero, ts, 'notice', hero.action)
      break

    case 'Stop': {
      const took = hero.workingSince === undefined ? '' : ` em ${formatDuration(ts - hero.workingSince)}`
      hero.status = 'idle'
      hero.workingSince = undefined
      hero.action = RESTING
      log(hero, ts, 'stop', `Missão concluída${took}`)
      break
    }

    case 'SessionEnd':
      hero.status = 'offline'
      hero.workingSince = undefined
      hero.action = 'Deixou a guilda'
      for (const m of hero.party) {
        if (m.status === 'working') {
          m.status = 'done'
          m.endedAt = ts
        }
      }
      log(hero, ts, 'session', 'Saiu da guilda')
      break

    case 'route':
      if (event.route) {
        const to = GUILD[classOfAgentType(event.route.to)].name
        log(hero, ts, 'route', `Roteador enviou o ${to}: ${event.route.description} (${event.route.reason})`)
      }
      break

    case 'usage':
      if (event.usage) hero.stats.usage = { ...event.usage }
      if (event.model) hero.model = event.model
      break
  }
}

/** Applies one hook event. Unknown sessions are created on their first event. */
export function reduce(state: WorldState, event: HookEvent): WorldState {
  if (!event.session_id) return state
  const existing = state.heroes[event.session_id]
  const hero = existing ? structuredClone(existing) : newHero(event)

  if (event.cwd && event.cwd !== hero.cwd) {
    hero.cwd = event.cwd
    hero.room = roomOf(event.cwd)
  }
  hero.lastEventAt = Math.max(hero.lastEventAt, event.ts)
  applyEvent(hero, event)

  return {
    heroes: { ...state.heroes, [hero.id]: hero },
    updatedAt: Math.max(state.updatedAt, event.ts),
  }
}

/** Drops heroes that left long ago and marks silent ones offline. */
export function prune(state: WorldState, now: number): WorldState {
  let changed = false
  const heroes: Record<string, Hero> = {}
  for (const hero of Object.values(state.heroes)) {
    const silentFor = now - hero.lastEventAt
    if (hero.status === 'offline' && silentFor > OFFLINE_TTL_MS) {
      changed = true
      continue
    }
    if (hero.status !== 'offline' && silentFor > SILENT_TTL_MS) {
      heroes[hero.id] = { ...hero, status: 'offline', action: 'Sumiu na névoa', workingSince: undefined }
      changed = true
      continue
    }
    heroes[hero.id] = hero
  }
  return changed ? { heroes, updatedAt: now } : state
}
