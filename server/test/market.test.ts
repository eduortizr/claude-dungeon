import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startServer, type RunningServer } from '../src/app'
import { BRIEFING_FILE, STATUS_FILE, parseBriefing, resolveMarketDir } from '../src/market'

const BRIEFING = {
  pilula: ['Mercado cai com temor fiscal', '', 42],
  destaques: [
    { titulo: 'Banco: queda após o balanço', por_que: 'Paga dividendos.', tom: 'negativo', acoes: ['ler o release'] },
    { titulo: 'Petróleo: subvenção', por_que: 'Receita extra.', tom: 'quem sabe' },
    { por_que: 'sem título' },
  ],
  cetico: 'não vai para o mapa',
  quando: '17/11 10:08',
  ts: 1794920893.6,
}

describe('parseBriefing', () => {
  it('keeps headlines, titles, reasons and tones, and nothing else', () => {
    const feed = parseBriefing(BRIEFING, { agente_ocupado: false })!
    expect(feed).toEqual({
      headlines: ['Mercado cai com temor fiscal'],
      highlights: [
        { title: 'Banco: queda após o balanço', why: 'Paga dividendos.', tone: 'negativo' },
        { title: 'Petróleo: subvenção', why: 'Receita extra.', tone: 'neutro' },
      ],
      updatedLabel: '17/11 10:08',
      updatedAt: 1794920893600,
      busy: false,
    })
    expect(JSON.stringify(feed)).not.toContain('não vai para o mapa')
  })

  it('reports the agent at work', () => {
    expect(parseBriefing(BRIEFING, { agente_ocupado: true })?.busy).toBe(true)
  })

  it('has nothing to show without news', () => {
    expect(parseBriefing(undefined)).toBeUndefined()
    expect(parseBriefing({ pilula: [], destaques: [] })).toBeUndefined()
    expect(parseBriefing('garbage')).toBeUndefined()
  })
})

describe('the market feed on the server', () => {
  let dir: string
  let server: RunningServer

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'claude-dungeon-market-'))
    await writeFile(join(dir, BRIEFING_FILE), JSON.stringify(BRIEFING))
    await writeFile(join(dir, STATUS_FILE), JSON.stringify({ agente_ocupado: true }))
    server = await startServer({ port: 0, dataFile: join(dir, 'world.json'), webDist: join(dir, 'none'), marketDir: dir })
  })

  afterEach(async () => {
    await server.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('serves the feed read from the briefing folder', async () => {
    const feed = await (await fetch(`${server.url}/market`)).json()
    expect(feed).toMatchObject({ headlines: ['Mercado cai com temor fiscal'], busy: true })
  })

  it('finds the folder in the environment, then in config.json', async () => {
    expect(await resolveMarketDir(dir, { CLAUDE_DUNGEON_MARKET_DIR: '/from/env' })).toBe('/from/env')
    expect(await resolveMarketDir(dir, {})).toBeUndefined()
    await writeFile(join(dir, 'config.json'), JSON.stringify({ marketDir: '/from/config' }))
    expect(await resolveMarketDir(dir, {})).toBe('/from/config')
  })
})
