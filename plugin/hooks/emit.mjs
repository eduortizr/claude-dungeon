#!/usr/bin/env node
// Forwards any hook event to the Claude Dungeon server.
// Agent calls are sent by route.mjs instead, after it picks their class.
import { readPayload, send, toEvent } from './lib.mjs'

const payload = await readPayload()
const isAgentCall = payload.hook_event_name === 'PreToolUse' && ['Agent', 'Task'].includes(payload.tool_name)
if (!isAgentCall) await send(toEvent(payload))
