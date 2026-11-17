#!/usr/bin/env node
// SessionStart: announces the hero to the map and tells the main session it
// is the guild master, with the table of who to delegate what to.
import { CLASSES, PLUGIN_NAME } from './guild.mjs'
import { readPayload, send, toEvent } from './lib.mjs'

const payload = await readPayload()
await send(toEvent(payload))

const roster = CLASSES.map(c => `- ${PLUGIN_NAME}:${c.id} (${c.name}, ${c.model}): ${c.when}`).join('\n')

const context = `Você é o Mestre da guilda (plugin "${PLUGIN_NAME}"). Quando uma tarefa tiver uma parte que se beneficia de um subagente, delegue com a ferramenta Agent para a classe certa, cada uma em um modelo escolhido para o tipo de trabalho:
${roster}
Use subagent_type com o nome completo (ex.: ${PLUGIN_NAME}:ladino). Tarefas simples você resolve sozinho; não delegue só para delegar. Um Agent genérico (general-purpose) é redirecionado automaticamente por um roteador de palavras-chave.`

process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }),
)
