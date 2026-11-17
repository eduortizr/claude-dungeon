import { describe, expect, it } from 'vitest'
import { ago, count, duration, escapeHtml, modelName } from './format'

describe('format', () => {
  it('formats durations', () => {
    expect(duration(5_400)).toBe('5 s')
    expect(duration(3 * 60_000 + 10_000)).toBe('3 min')
    expect(duration(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 5 min')
    expect(ago(0, 12_000)).toBe('há 12 s')
  })

  it('formats counts like the stats panel', () => {
    expect(count(950)).toBe('950')
    expect(count(17_800)).toBe('17,8 mil')
    expect(count(4_100_000)).toBe('4,1 M')
    expect(count(2_000)).toBe('2 mil')
  })

  it('names models', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-haiku-5-5-20260101')).toBe('Haiku 5.5')
    expect(modelName('sonnet')).toBe('Sonnet')
    expect(modelName(null)).toBe('herda da sessão')
  })

  it('escapes html', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
  })
})
