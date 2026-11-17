import { describe, expect, it } from 'vitest'
import { summarizeTranscript } from '../src/transcript'

const row = (value: unknown) => JSON.stringify(value)

describe('summarizeTranscript', () => {
  it('sums usage once per assistant message and keeps the last model', () => {
    const jsonl = [
      row({ type: 'user', message: { role: 'user', content: 'oi' } }),
      // A streamed reply: two rows, same id. Only the last one counts.
      row({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5-5', usage: { input_tokens: 5, output_tokens: 1 } } }),
      row({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5-5', usage: { input_tokens: 5, output_tokens: 40 } } }),
      row({
        type: 'assistant',
        message: {
          id: 'm2',
          model: 'claude-opus-5-5',
          usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 7 },
        },
      }),
      '{"type":"assistant", "broken', // a half-written line
      '',
    ].join('\n')

    expect(summarizeTranscript(jsonl)).toEqual({
      usage: { inputTokens: 7, outputTokens: 50, cacheReadTokens: 100, cacheWriteTokens: 7 },
      model: 'claude-opus-5-5',
    })
  })

  it('ignores synthetic model names', () => {
    const jsonl = row({ type: 'assistant', message: { id: 'x', model: '<synthetic>', usage: { output_tokens: 1 } } })
    expect(summarizeTranscript(jsonl).model).toBeUndefined()
  })
})
