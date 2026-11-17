#!/usr/bin/env node
// PreToolUse hook on the Agent tool: sends generic subagent calls to the right
// guild class, by rewriting `subagent_type` (Claude Code's `updatedInput`).
// Set GUILD_ROUTER=off to only watch, never re-route.
import { CLASSES, PLUGIN_NAME, classById } from './guild.mjs'
import { classify, shouldRoute } from './router.mjs'
import { readPayload, send, toEvent } from './lib.mjs'

const payload = await readPayload()
const input = payload.tool_input ?? {}
const enabled = process.env.GUILD_ROUTER !== 'off'

if (!enabled || !shouldRoute(input)) {
  await send(toEvent(payload))
  process.exit(0)
}

const { classId, reason } = classify(input)
const target = `${PLUGIN_NAME}:${classId}`
const updatedInput = { ...input, subagent_type: target }
const guildClass = classById(classId) ?? CLASSES[1]

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `Roteador da guilda: ${guildClass.name} (${guildClass.model}), ${reason}`,
      updatedInput,
    },
  }),
)

await Promise.all([
  send(
    toEvent(payload, {
      event: 'route',
      route: { from: input.subagent_type || 'general-purpose', to: target, description: input.description ?? '', reason },
    }),
  ),
  send(toEvent({ ...payload, tool_input: updatedInput })),
])
