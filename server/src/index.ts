/**
 * Local server: hooks POST events, the map listens on a Server-Sent Events
 * stream. Plain `node:http` on purpose: three routes do not need a framework.
 *
 *   POST /events   one HookEvent (from plugin/hooks/emit.mjs)
 *   GET  /state    the whole WorldState
 *   GET  /stream   SSE: a `state` message on every change
 *   GET  /*        the built map (web/dist), when it exists
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HookEvent, WorldState } from '../../shared/types'
import { emptyWorld, prune, reduce } from './state'
import { readTranscript } from './transcript'

const PORT = Number(process.env.PORT ?? 4747)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_FILE = join(ROOT, 'data', 'world.json')
const WEB_DIST = join(ROOT, 'web', 'dist')
const MAX_BODY = 1_000_000

let world: WorldState = emptyWorld()
const clients = new Set<ServerResponse>()

// ---- persistence -----------------------------------------------------------

async function load(): Promise<void> {
  try {
    world = prune(JSON.parse(await readFile(DATA_FILE, 'utf8')) as WorldState, Date.now())
  } catch {
    world = emptyWorld()
  }
}

let saveTimer: NodeJS.Timeout | undefined
function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true })
    await writeFile(DATA_FILE, JSON.stringify(world))
  }, 1000)
}

// ---- broadcasting ----------------------------------------------------------

let broadcastTimer: NodeJS.Timeout | undefined
/** Coalesces bursts of hook events into one message per 100 ms. */
function scheduleBroadcast(): void {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined
    const message = `event: state\ndata: ${JSON.stringify(world)}\n\n`
    for (const client of clients) client.write(message)
  }, 100)
}

function apply(event: HookEvent): void {
  world = reduce(world, event)
  scheduleBroadcast()
  scheduleSave()
}

async function applyWithUsage(event: HookEvent): Promise<void> {
  apply(event)
  // After each reply, read the session's transcript for tokens and model.
  if ((event.event === 'Stop' || event.event === 'SessionEnd') && event.transcript_path) {
    const summary = await readTranscript(event.transcript_path)
    if (summary) {
      apply({ event: 'usage', ts: Date.now(), session_id: event.session_id, usage: summary.usage, model: summary.model })
    }
  }
}

// ---- HTTP ------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isHookEvent(value: unknown): value is HookEvent {
  const v = value as Partial<HookEvent> | null
  return typeof v?.session_id === 'string' && typeof v.event === 'string' && typeof v.ts === 'number'
}

function send(res: ServerResponse, status: number, body: string, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
}

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  if (!existsSync(WEB_DIST)) {
    send(res, 404, 'Map not built: run `npm run dev` (dev) or `npm start` (build + serve).', 'text/plain')
    return
  }
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '')
  const file = resolve(WEB_DIST, relative === '' ? 'index.html' : relative)
  if (!file.startsWith(WEB_DIST + sep)) {
    send(res, 403, 'Forbidden', 'text/plain')
    return
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    send(res, 404, 'Not found', 'text/plain')
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'POST' && url.pathname === '/events') {
    try {
      const event: unknown = JSON.parse(await readBody(req))
      if (!isHookEvent(event)) {
        send(res, 400, JSON.stringify({ error: 'expected { event, ts, session_id }' }))
        return
      }
      send(res, 202, '{"ok":true}')
      await applyWithUsage(event)
    } catch (error) {
      send(res, 400, JSON.stringify({ error: (error as Error).message }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    send(res, 200, JSON.stringify(world))
    return
  }

  if (req.method === 'GET' && url.pathname === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(`event: state\ndata: ${JSON.stringify(world)}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (req.method === 'GET') {
    await serveStatic(res, url.pathname)
    return
  }

  send(res, 405, 'Method not allowed', 'text/plain')
})

// Housekeeping: drop heroes that left, and keep idle proxies from closing the stream.
setInterval(() => {
  const next = prune(world, Date.now())
  if (next !== world) {
    world = next
    scheduleBroadcast()
    scheduleSave()
  }
  for (const client of clients) client.write(': ping\n\n')
}, 30_000)

await load()
server.listen(PORT, '127.0.0.1', () => {
  console.log(`⚔  Claude Dungeon server on http://localhost:${PORT}`)
})
