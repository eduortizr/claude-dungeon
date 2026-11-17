/**
 * The market feed for the Câmara de ouro. Another local agent (a separate
 * project that runs `claude -p` a few times a day) writes a briefing of the
 * day's stock market news to a folder; the server reads two files from it:
 *
 *   overlay_briefing.json  { pilula: string[], destaques: [{ titulo, por_que, tom }], quando, ts }
 *   overlay_status.json    { agente_ocupado: boolean }   (optional)
 *
 * The folder comes from CLAUDE_DUNGEON_MARKET_DIR or from `marketDir` in a
 * `config.json` next to the world file. Without one, the room still has its
 * merchant, just with nothing new to read. Only headlines, the "why it
 * matters" line and the tone are kept: the briefing's other fields stay on disk.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MarketFeed, MarketHighlight } from '../../shared/types'

export const BRIEFING_FILE = 'overlay_briefing.json'
export const STATUS_FILE = 'overlay_status.json'

const MAX_HEADLINES = 8
const MAX_HIGHLIGHTS = 6
const MAX_TEXT = 400

const TONES = new Set<MarketHighlight['tone']>(['positivo', 'negativo', 'neutro'])

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Turns a parsed briefing (and status) into a feed; `undefined` when it has no news at all. */
export function parseBriefing(briefing: unknown, status?: unknown): MarketFeed | undefined {
  const b = (briefing ?? {}) as Record<string, unknown>
  const headlines = (Array.isArray(b.pilula) ? b.pilula : []).map(h => text(h, 200)).filter(Boolean).slice(0, MAX_HEADLINES)
  const highlights = (Array.isArray(b.destaques) ? b.destaques : [])
    .map((d): MarketHighlight => {
      const item = (d ?? {}) as Record<string, unknown>
      const tone = item.tom as MarketHighlight['tone']
      return { title: text(item.titulo, 200), why: text(item.por_que), tone: TONES.has(tone) ? tone : 'neutro' }
    })
    .filter(h => h.title)
    .slice(0, MAX_HIGHLIGHTS)
  if (headlines.length === 0 && highlights.length === 0) return undefined

  const seconds = typeof b.ts === 'number' && Number.isFinite(b.ts) ? b.ts : 0
  return {
    headlines,
    highlights,
    updatedLabel: text(b.quando, 40),
    updatedAt: Math.round(seconds * 1000),
    busy: (status as { agente_ocupado?: unknown } | undefined)?.agente_ocupado === true,
  }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

export async function readMarketFeed(dir: string): Promise<MarketFeed | undefined> {
  return parseBriefing(await readJson(join(dir, BRIEFING_FILE)), await readJson(join(dir, STATUS_FILE)))
}

/** A cheap fingerprint of the two files, to read them again only when one changed. */
export async function marketStamp(dir: string): Promise<string> {
  const times = await Promise.all(
    [BRIEFING_FILE, STATUS_FILE].map(name =>
      stat(join(dir, name)).then(
        s => s.mtimeMs,
        () => 0,
      ),
    ),
  )
  return times.join('/')
}

/** The briefing folder: the environment variable first, then `marketDir` in `<dataDir>/config.json`. */
export async function resolveMarketDir(dataDir: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  if (env.CLAUDE_DUNGEON_MARKET_DIR) return env.CLAUDE_DUNGEON_MARKET_DIR
  const config = (await readJson(join(dataDir, 'config.json'))) as { marketDir?: unknown } | undefined
  return typeof config?.marketDir === 'string' && config.marketDir ? config.marketDir : undefined
}
