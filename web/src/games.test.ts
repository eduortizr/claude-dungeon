import { describe, expect, it } from 'vitest'
import { cardFace, playRound, taunt } from './games'

/** A fake Math.random that returns the given values in order, then repeats the last. */
function sequence(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]!
}

describe('playRound', () => {
  it('rolls dice and gives the round to the higher one', () => {
    // 0.9 -> 6, 0.1 -> 1
    expect(playRound('dados', sequence(0.9, 0.1))).toEqual({ game: 'dados', values: [6, 1], winner: 0 })
  })

  it('rerolls ties so there is always a winner', () => {
    // 0.5, 0.5 tie (4 x 4), then 0.1 -> 1 and 0.99 -> 6
    expect(playRound('dados', sequence(0.5, 0.5, 0.1, 0.99))).toEqual({ game: 'dados', values: [1, 6], winner: 1 })
  })

  it('stays in range for many rounds', () => {
    for (let i = 0; i < 500; i++) {
      const { values, winner } = playRound('cartas')
      expect(values[0]).toBeGreaterThanOrEqual(1)
      expect(values[1]).toBeLessThanOrEqual(13)
      expect(values[winner]).toBeGreaterThan(values[1 - winner]!)
    }
  })

  it('decides arm wrestling by a coin flip', () => {
    expect(playRound('braco', sequence(0.7)).winner).toBe(1)
  })
})

describe('taunt and cards', () => {
  it('fills in names and hits', () => {
    expect(taunt('win', { winner: 'Lyra', loser: 'Orin', hits: 42 }, sequence(0))).toBe('Ha! Paga a próxima rodada, Orin!')
    expect(taunt('win', { winner: 'Lyra', loser: 'Orin', hits: 42 }, sequence(0.2))).toBe('42 golpes hoje e ainda tenho energia pra isso!')
  })

  it('does not brag about hits with none', () => {
    for (let r = 0; r < 1; r += 0.05) {
      expect(taunt('win', { winner: 'Lyra', loser: 'Orin', hits: 0 }, () => r)).not.toContain('golpes')
    }
  })

  it('names card faces', () => {
    expect([1, 10, 11, 13].map(cardFace)).toEqual(['A', '10', 'J', 'K'])
  })
})
