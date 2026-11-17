import { describe, expect, it } from 'vitest'
import type { HookEvent, WorldState } from '../../shared/types'
import { OFFLINE_TTL_MS, SILENT_TTL_MS, TIMELINE_LIMIT, emptyWorld, prune, reduce, roomOf } from '../src/state'

const SESSION = 'session-1'
let clock = 1_000

function ev(event: HookEvent['event'], extra: Partial<HookEvent> = {}): HookEvent {
  clock += 1_000
  return { event, ts: clock, session_id: SESSION, cwd: 'C:\\code\\loja-api', ...extra }
}

function run(...events: HookEvent[]): WorldState {
  return events.reduce(reduce, emptyWorld())
}

function hero(state: WorldState) {
  const found = state.heroes[SESSION]
  if (!found) throw new Error('hero missing')
  return found
}

describe('reduce', () => {
  it('creates a hero on the first event, in the room of its project', () => {
    const state = run(ev('SessionStart', { source: 'startup' }))
    expect(hero(state)).toMatchObject({ room: 'loja-api', status: 'idle' })
    expect(hero(state).name).toMatch(/^[A-Z]/)
  })

  it('never mutates the state it was given', () => {
    const before = run(ev('SessionStart'))
    const snapshot = structuredClone(before)
    reduce(before, ev('UserPromptSubmit', { prompt: 'oi' }))
    expect(before).toEqual(snapshot)
  })

  it('goes to work on a prompt and back to rest on Stop', () => {
    const working = run(ev('SessionStart'), ev('UserPromptSubmit', { prompt: 'corrige o login' }))
    expect(hero(working)).toMatchObject({ status: 'working', action: 'Pensando…' })
    expect(hero(working).workingSince).toBeDefined()

    const resting = reduce(working, ev('Stop'))
    expect(hero(resting)).toMatchObject({ status: 'idle', workingSince: undefined })
    expect(hero(resting).timeline.at(-1)?.text).toMatch(/^Missão concluída em \d+s$/)
  })

  it('describes tool calls and counts them as hits', () => {
    const state = run(
      ev('UserPromptSubmit'),
      ev('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'C:\\code\\src\\state.ts' } }),
    )
    expect(hero(state).action).toBe('Lendo o pergaminho state.ts')
    expect(hero(state).hits).toBe(1)
    expect(hero(state).stats.toolCalls).toBe(1)
  })

  it('turns an Agent call into a party member and pairs it with its subagent', () => {
    const state = run(
      ev('UserPromptSubmit'),
      ev('PreToolUse', {
        tool_name: 'Agent',
        tool_use_id: 'call-1',
        tool_input: { subagent_type: 'guild:ladino', description: 'achar rotas', prompt: '...' },
      }),
      ev('SubagentStart', { agent_id: 'agent-9', agent_type: 'guild:ladino' }),
      ev('PreToolUse', { agent_id: 'agent-9', tool_name: 'Grep', tool_input: { pattern: 'router' } }),
    )
    const [member] = hero(state).party
    expect(member).toMatchObject({
      id: 'call-1',
      agentId: 'agent-9',
      cls: 'ladino',
      model: 'haiku',
      status: 'working',
      action: 'Rastreando "router"',
      toolCalls: 1,
    })
    // The subagent's own call does not count as the hero's.
    expect(hero(state).stats.toolCalls).toBe(1)

    const done = reduce(state, ev('SubagentStop', { agent_id: 'agent-9' }))
    expect(hero(done).party[0]).toMatchObject({ status: 'done', action: 'Missão cumprida' })
  })

  it('keeps a model given on the Agent call over the class default', () => {
    const state = run(
      ev('PreToolUse', {
        tool_name: 'Agent',
        tool_use_id: 'c',
        tool_input: { subagent_type: 'guild:mago', model: 'sonnet', description: 'x' },
      }),
    )
    expect(hero(state).party[0]?.model).toBe('sonnet')
  })

  it('adds a member for a subagent it never saw being called', () => {
    const state = run(ev('SubagentStart', { agent_id: 'a1', agent_type: 'Explore' }))
    expect(hero(state).party[0]).toMatchObject({ id: 'a1', cls: 'ladino', status: 'working' })
  })

  it('waits on a notification', () => {
    const state = run(ev('UserPromptSubmit'), ev('Notification', { message: 'Claude needs your permission to use Bash' }))
    expect(hero(state).status).toBe('waiting')
  })

  it('logs router decisions', () => {
    const state = run(
      ev('route', { route: { from: 'general-purpose', to: 'guild:clerigo', description: 'rodar testes', reason: 'teste' } }),
    )
    expect(hero(state).timeline.at(-1)).toMatchObject({ kind: 'route' })
    expect(hero(state).timeline.at(-1)?.text).toContain('Clérigo')
  })

  it('stores usage read from the transcript', () => {
    const usage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }
    const state = run(ev('usage', { usage, model: 'claude-opus-5-5' }))
    expect(hero(state).stats.usage).toEqual(usage)
    expect(hero(state).model).toBe('claude-opus-5-5')
  })

  it('caps the timeline', () => {
    const events = Array.from({ length: TIMELINE_LIMIT + 20 }, () => ev('PreToolUse', { tool_name: 'Read' }))
    expect(hero(run(...events)).timeline).toHaveLength(TIMELINE_LIMIT)
  })

  it('finishes working members when the session ends', () => {
    const state = run(
      ev('PreToolUse', { tool_name: 'Agent', tool_use_id: 'c', tool_input: { description: 'x' } }),
      ev('SessionEnd'),
    )
    expect(hero(state).status).toBe('offline')
    expect(hero(state).party[0]?.status).toBe('done')
  })

  it('ignores events with no session', () => {
    const state = emptyWorld()
    expect(reduce(state, { event: 'Stop', ts: 1, session_id: '' })).toBe(state)
  })
})

describe('prune', () => {
  it('removes heroes that left and marks silent ones offline', () => {
    const left = run(ev('SessionEnd'))
    expect(prune(left, clock + OFFLINE_TTL_MS + 1).heroes).toEqual({})

    const silent = run(ev('UserPromptSubmit'))
    expect(hero(prune(silent, clock + SILENT_TTL_MS + 1)).status).toBe('offline')
  })

  it('returns the same object when nothing changed', () => {
    const state = run(ev('SessionStart'))
    expect(prune(state, clock + 1)).toBe(state)
  })
})

describe('roomOf', () => {
  it('uses the last folder of the path', () => {
    expect(roomOf('/home/ana/projetos/blog/')).toBe('blog')
    expect(roomOf('C:\\Users\\ana\\api')).toBe('api')
    expect(roomOf(undefined)).toBe('Sem projeto')
  })
})

describe('chronicle', () => {
  it('records a party member when it comes back, and keeps it after the hero is pruned', () => {
    const state = run(
      ev('UserPromptSubmit', { prompt: 'arruma o login' }),
      ev('PreToolUse', {
        tool_name: 'Agent',
        tool_use_id: 'call-1',
        tool_input: { subagent_type: 'ladino-pesquisador', description: 'pesquisar tardígrados' },
      }),
      ev('SubagentStart', { agent_id: 'agent-1', agent_type: 'ladino-pesquisador' }),
      ev('PreToolUse', { agent_id: 'agent-1', tool_name: 'WebSearch', tool_input: { query: 'tardigrade' } }),
      ev('SubagentStop', { agent_id: 'agent-1' }),
    )
    expect(state.chronicle).toEqual([
      expect.objectContaining({
        id: `${SESSION}/call-1`,
        cls: 'ladino',
        type: 'ladino-pesquisador',
        description: 'pesquisar tardígrados',
        project: 'loja-api',
        status: 'done',
        toolCalls: 1,
      }),
    ])

    const gone = prune(reduce(state, ev('SessionEnd')), clock + OFFLINE_TTL_MS + 1)
    expect(gone.heroes).toEqual({})
    expect(gone.chronicle).toHaveLength(1) // SessionEnd is not a Stop: the unfinished prompt is not a mission
  })

  it('records the main session finishing a prompt, with the prompt and its own hits', () => {
    const state = run(
      ev('UserPromptSubmit', { prompt: 'primeira' }),
      ev('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }),
      ev('Stop'),
      ev('UserPromptSubmit', { prompt: 'arruma o login' }),
      ev('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }),
      ev('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }),
      ev('Stop'),
    )
    const last = state.chronicle?.at(-1)
    expect(last).toMatchObject({ cls: 'mestre', type: 'mestre', status: 'done', toolCalls: 2 })
    expect(last?.description).toContain('arruma o login')
    expect(state.chronicle).toHaveLength(2)
  })

  it('does not record a Stop with no mission in progress', () => {
    expect(run(ev('SessionStart'), ev('Stop')).chronicle).toEqual([])
  })
})
