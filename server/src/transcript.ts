/**
 * Reads token usage from a Claude Code transcript (one JSON object per line).
 * Assistant rows carry `message.usage`; a streamed reply is written as several
 * rows sharing one `message.id`, so each id is counted once (its last row).
 */
import { readFile } from 'node:fs/promises'
import type { TokenUsage } from '../../shared/types'

export interface TranscriptSummary {
  usage: TokenUsage
  model?: string
}

interface UsageRow {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export function summarizeTranscript(jsonl: string): TranscriptSummary {
  const byMessage = new Map<string, UsageRow>()
  let model: string | undefined

  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let row: { type?: string; message?: { id?: string; model?: string; usage?: UsageRow } }
    try {
      row = JSON.parse(line)
    } catch {
      continue // a line being written while we read it
    }
    const message = row.message
    if (row.type !== 'assistant' || !message?.usage) continue
    byMessage.set(message.id ?? `row-${byMessage.size}`, message.usage)
    if (message.model && !message.model.startsWith('<')) model = message.model
  }

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  for (const row of byMessage.values()) {
    usage.inputTokens += row.input_tokens ?? 0
    usage.outputTokens += row.output_tokens ?? 0
    usage.cacheReadTokens += row.cache_read_input_tokens ?? 0
    usage.cacheWriteTokens += row.cache_creation_input_tokens ?? 0
  }
  return model ? { usage, model } : { usage }
}

export async function readTranscript(path: string): Promise<TranscriptSummary | undefined> {
  try {
    return summarizeTranscript(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}
