#!/usr/bin/env node
// Plays scripted sessions against the server so the map can be seen without
// running Claude Code: `npm run demo` (once) or `npm run demo -- --loop`.
// The Agent calls go through the real router, like in a live session.
import { classify } from '../plugin/hooks/router.mjs'

const SERVER = process.env.CLAUDE_DUNGEON_URL ?? 'http://127.0.0.1:4747'
const loop = process.argv.includes('--loop')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = Date.now().toString(36)

async function send(session, event, extra = {}) {
  const body = { event, ts: Date.now(), session_id: `${session.id}-${run}`, cwd: session.cwd, ...extra }
  try {
    await fetch(`${SERVER}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    console.error(`Server not reachable at ${SERVER}. Start it with \`npm run dev\`.`)
    process.exit(1)
  }
}

async function tool(session, name, input, extra = {}) {
  await send(session, 'PreToolUse', { tool_name: name, tool_input: input, ...extra })
  await sleep(900 + Math.random() * 900)
  await send(session, 'PostToolUse', { tool_name: name, ...extra })
  await sleep(300)
}

let callCount = 0
async function delegate(session, description, steps) {
  const { classId, reason } = classify({ description })
  const toolUseId = `call-${++callCount}-${run}`
  const agentId = `agent-${callCount}-${run}`
  const type = `guild:${classId}`
  await send(session, 'route', { route: { from: 'general-purpose', to: type, description, reason } })
  await send(session, 'PreToolUse', { tool_name: 'Agent', tool_use_id: toolUseId, tool_input: { subagent_type: type, description } })
  await sleep(1500)
  await send(session, 'SubagentStart', { agent_id: agentId, agent_type: type })
  await sleep(1200)
  for (const [name, input] of steps) await tool(session, name, input, { agent_id: agentId })
  await send(session, 'SubagentStop', { agent_id: agentId })
  await send(session, 'PostToolUse', { tool_name: 'Agent', tool_use_id: toolUseId })
}

const loja = { id: 'demo-loja', cwd: '/home/guilda/projetos/loja-api' }
const blog = { id: 'demo-blog', cwd: '/home/guilda/projetos/blog' }
const tcc = { id: 'demo-tcc', cwd: '/home/guilda/projetos/tcc-latex' }

async function lojaQuest() {
  await send(loja, 'SessionStart', { source: 'startup' })
  await sleep(2500)
  await send(loja, 'UserPromptSubmit', { prompt: 'Adiciona login com Google na loja e cobre com testes' })
  await sleep(1500)
  await tool(loja, 'Read', { file_path: 'src/auth/session.ts' })
  await delegate(loja, 'Onde fica a autenticação', [
    ['Grep', { pattern: 'passport' }],
    ['Glob', { pattern: 'src/**/auth*.ts' }],
    ['Read', { file_path: 'src/auth/strategies.ts' }],
  ])
  await tool(loja, 'Edit', { file_path: 'src/auth/google.ts' })
  await tool(loja, 'Write', { file_path: 'src/auth/google.test.ts' })
  await delegate(loja, 'Revisar e rodar os testes do login', [
    ['Bash', { command: 'npm test -- auth' }],
    ['Read', { file_path: 'src/auth/google.ts' }],
    ['Edit', { file_path: 'src/auth/google.ts' }],
    ['Bash', { command: 'npm test -- auth' }],
  ])
  await tool(loja, 'Bash', { command: 'git status' })
  await send(loja, 'Stop')
}

async function blogQuest() {
  await sleep(4000)
  await send(blog, 'SessionStart', { source: 'startup' })
  await sleep(5000)
  await send(blog, 'UserPromptSubmit', { prompt: 'Planeja a migração do blog para Astro' })
  await delegate(blog, 'Planejar a arquitetura da migração', [
    ['Read', { file_path: 'package.json' }],
    ['WebSearch', { query: 'astro content collections' }],
    ['Read', { file_path: 'src/pages/index.jsx' }],
  ])
  await send(blog, 'Notification', { message: 'Claude precisa da sua permissão para usar Bash' })
  await sleep(6000)
  await tool(blog, 'Bash', { command: 'npm create astro@latest' })
  await delegate(blog, 'Atualizar o README com o novo setup', [
    ['Read', { file_path: 'README.md' }],
    ['Edit', { file_path: 'README.md' }],
  ])
  await send(blog, 'Stop')
}

async function tccQuest() {
  await sleep(1500)
  await send(tcc, 'SessionStart', { source: 'resume' })
  await sleep(14000)
  await send(tcc, 'UserPromptSubmit', { prompt: 'Corrige as referências quebradas do capítulo 2' })
  await tool(tcc, 'Grep', { pattern: '\\cite{' })
  await tool(tcc, 'Read', { file_path: 'capitulos/02-revisao.tex' })
  await tool(tcc, 'Edit', { file_path: 'capitulos/02-revisao.tex' })
  await tool(tcc, 'Bash', { command: 'latexmk -pdf main.tex' })
  await send(tcc, 'Stop')
}

do {
  await Promise.all([lojaQuest(), blogQuest(), tccQuest()])
  console.log('Demo round finished.')
  if (loop) await sleep(8000)
} while (loop)
