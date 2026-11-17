import type { ClassId } from './guild'

/**
 * What a Claude Code hook sends to the server: the hook's own stdin payload
 * (snake_case, as Claude Code writes it) plus `event` and `ts` stamped by
 * `plugin/hooks/emit.mjs`. Large fields are trimmed before sending.
 */
export interface HookEvent {
  event: HookEventName
  ts: number
  session_id: string
  cwd?: string
  transcript_path?: string
  tool_name?: string
  tool_use_id?: string
  tool_input?: Record<string, unknown>
  tool_error?: boolean
  prompt?: string
  message?: string
  source?: string
  reason?: string
  agent_id?: string
  agent_type?: string
  /** `route` events: what the router decided for an Agent call. */
  route?: RouteDecision
  /** `usage` events: totals the server read from the session transcript. */
  usage?: TokenUsage
  model?: string
}

export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Notification'
  | 'Stop'
  | 'SessionEnd'
  | 'route'
  | 'usage'

export interface RouteDecision {
  from: string
  to: string
  description: string
  reason: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export type HeroStatus = 'working' | 'waiting' | 'idle' | 'offline'

export type TimelineKind = 'session' | 'prompt' | 'tool' | 'route' | 'agent' | 'notice' | 'stop'

export interface TimelineEntry {
  ts: number
  kind: TimelineKind
  text: string
  /** Set when the entry belongs to a party member (subagent). */
  memberId?: string
}

export interface PartyMember {
  /** Stable key: the Agent call's tool_use_id, or the subagent id when no call was seen. */
  id: string
  /** Set by SubagentStart; the subagent's own tool calls carry it as `agent_id`. */
  agentId?: string
  type: string
  cls: ClassId
  model: string | null
  description: string
  status: 'working' | 'done' | 'failed'
  action: string
  toolCalls: number
  startedAt: number
  endedAt?: number
}

export interface HeroStats {
  prompts: number
  toolCalls: number
  subagents: number
  usage: TokenUsage
}

export interface Hero {
  id: string
  name: string
  sprite: number
  /** The project the session runs in: the last folder of its cwd. */
  room: string
  cwd: string
  status: HeroStatus
  action: string
  model?: string
  startedAt: number
  lastEventAt: number
  /** When the current working streak began, for "Em combate há 3 min". */
  workingSince?: number
  /** Bumped on every tool call, so the map can play an attack per call. */
  hits: number
  party: PartyMember[]
  timeline: TimelineEntry[]
  stats: HeroStats
}

export interface WorldState {
  heroes: Record<string, Hero>
  updatedAt: number
}

/** One highlight from the market briefing: the headline, why it matters, and its tone. */
export interface MarketHighlight {
  title: string
  why: string
  tone: 'positivo' | 'negativo' | 'neutro'
}

/**
 * The market news the merchant in the Câmara de ouro reads out, taken from a
 * local briefing file written by another agent (see server/src/market.ts).
 * Only news goes here: nothing about anyone's portfolio.
 */
export interface MarketFeed {
  /** Short one-line headlines. */
  headlines: string[]
  highlights: MarketHighlight[]
  /** When the briefing was written, as the agent labeled it ("17/11 10:08"). */
  updatedLabel: string
  /** When the briefing was written, epoch ms. */
  updatedAt: number
  /** The briefing agent is running right now. */
  busy: boolean
}
