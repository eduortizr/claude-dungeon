import { describe, expect, it } from 'vitest'
import { cardFace, playRound, rpgLines, rpgScene, taunt } from './games'

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

describe('Masmorras & Dragões', () => {
  it('rolls a d20 against a difficulty from 10 to 18', () => {
    for (let i = 0; i < 300; i++) {
      const { values } = playRound('rpg')
      expect(values[0]).toBeGreaterThanOrEqual(10)
      expect(values[0]).toBeLessThanOrEqual(18)
      expect(values[1]).toBeGreaterThanOrEqual(1)
      expect(values[1]).toBeLessThanOrEqual(20)
    }
  })

  it('gives the round to the player when the roll meets the difficulty', () => {
    // 0.5 -> difficulty 14; 0.7 -> roll 15
    expect(playRound('rpg', sequence(0.5, 0.7))).toEqual({ game: 'rpg', values: [14, 15], winner: 1 })
    // 0.5 -> difficulty 14; 0.6 -> roll 13
    expect(playRound('rpg', sequence(0.5, 0.6)).winner).toBe(0)
  })

  it('always passes on a 20 and always fails on a 1', () => {
    expect(playRound('rpg', sequence(0.99, 0.99))).toMatchObject({ values: [18, 20], winner: 1 })
    expect(playRound('rpg', sequence(0, 0))).toMatchObject({ values: [10, 1], winner: 0 })
  })

  it('cheers a natural 20 and fills in the roll', () => {
    expect(rpgLines({ game: 'rpg', values: [18, 20], winner: 1 }, sequence(0)).player).toBe('VINTE NATURAL!!! 🎲')
    expect(rpgLines({ game: 'rpg', values: [14, 15], winner: 1 }, sequence(0)).player).toBe('Passei! (15 contra CD 14)')
  })

  it('has a scene for the master to describe', () => {
    expect(rpgScene(sequence(0))).toMatch(/Role/)
  })
})
