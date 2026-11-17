// Shared by the hook scripts: read the hook payload, trim it, send it to the
// Claude Dungeon server. A hook must never slow down or break a session, so
// sending gives up quickly and silently when the server is not running.

const SERVER = process.env.CLAUDE_DUNGEON_URL ?? 'http://127.0.0.1:4747'
const TIMEOUT_MS = 700

/** Tool input fields the map shows; the rest (file contents, prompts) stays local. */
const KEPT_INPUT = ['file_path', 'notebook_path', 'command', 'pattern', 'description', 'subagent_type', 'model', 'url', 'query']

export async function readPayload() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function cut(value, max) {
  return typeof value === 'string' && value.length > max ? `${value.slice(0, max)}…` : value
}

/** Builds the event the server expects from a raw hook payload. */
export function toEvent(payload, overrides = {}) {
  const input = payload.tool_input ?? {}
  const toolInput = {}
  for (const key of KEPT_INPUT) {
    if (input[key] !== undefined) toolInput[key] = cut(input[key], 200)
  }
  const response = payload.tool_response
  const event = {
    event: payload.hook_event_name,
    ts: Date.now(),
    session_id: payload.session_id,
    cwd: payload.cwd,
    transcript_path: payload.transcript_path,
    tool_name: payload.tool_name,
    tool_use_id: payload.tool_use_id,
    tool_input: payload.tool_input ? toolInput : undefined,
    tool_error: Boolean(response && typeof response === 'object' && (response.is_error || response.error)),
    prompt: cut(payload.prompt, 300),
    message: cut(payload.message, 300),
    source: payload.source,
    reason: payload.reason,
    agent_id: payload.agent_id,
    agent_type: payload.agent_type,
    ...overrides,
  }
  return JSON.parse(JSON.stringify(event)) // drops the undefined fields
}

export async function send(event) {
  if (!event.session_id || !event.event) return
  try {
    await fetch(`${SERVER}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Server off or slow: the map just misses this event.
  }
}
