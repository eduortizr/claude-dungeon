import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorldState } from '../../shared/types'
import { startServer, type RunningServer } from '../src/app'

let dir: string
let server: RunningServer

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-dungeon-'))
  await mkdir(join(dir, 'web'))
  await writeFile(join(dir, 'web', 'index.html'), '<h1>map</h1>')
  server = await startServer({ port: 0, dataFile: join(dir, 'data', 'world.json'), webDist: join(dir, 'web') })
})

afterEach(async () => {
  await server.close()
  await rm(dir, { recursive: true, force: true })
})

const post = (body: unknown) =>
  fetch(`${server.url}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('startServer', () => {
  it('takes hook events and serves the world', async () => {
    const response = await post({ event: 'UserPromptSubmit', ts: 1, session_id: 's1', cwd: '/x/loja', prompt: 'oi' })
    expect(response.status).toBe(202)

    const world = (await (await fetch(`${server.url}/state`)).json()) as WorldState
    expect(world.heroes.s1).toMatchObject({ room: 'loja', status: 'working' })
  })

  it('rejects what is not a hook event', async () => {
    expect((await post({ hello: 'world' })).status).toBe(400)
  })

  it('serves the map and refuses paths outside it', async () => {
    expect(await (await fetch(`${server.url}/`)).text()).toBe('<h1>map</h1>')
    expect((await fetch(`${server.url}/..%2f..%2fdata%2fworld.json`)).status).not.toBe(200)
  })

  it('saves the world on close and loads it on the next start', async () => {
    await post({ event: 'SessionStart', ts: Date.now(), session_id: 's2', cwd: '/x/blog' })
    await server.close()
    const saved = JSON.parse(await readFile(join(dir, 'data', 'world.json'), 'utf8')) as WorldState
    expect(saved.heroes.s2?.room).toBe('blog')

    server = await startServer({ port: 0, dataFile: join(dir, 'data', 'world.json'), webDist: join(dir, 'web') })
    const world = (await (await fetch(`${server.url}/state`)).json()) as WorldState
    expect(world.heroes.s2?.room).toBe('blog')
  })

  it('fails to start on a port already in use', async () => {
    const port = Number(new URL(server.url).port)
    await expect(startServer({ port, dataFile: join(dir, 'other.json'), webDist: dir })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
  })
})
