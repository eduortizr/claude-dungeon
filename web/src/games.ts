/**
 * The games idle heroes play in the sala de jogos, one per table, and what
 * they say about the result. Randomness is injected so rounds are testable.
 */

export type GameKind = 'dados' | 'cartas' | 'braco'

/** Which game each table of the sala de jogos holds. */
export const TABLE_GAMES: readonly GameKind[] = ['dados', 'cartas', 'braco', 'dados']

export const GAME_NAMES: Record<GameKind, string> = {
  dados: 'Dados',
  cartas: 'Cartas',
  braco: 'Queda de braço',
}

export interface Round {
  game: GameKind
  /** What each side rolled or drew (dice 1-6, cards 1-13); unused for arm wrestling. */
  values: [number, number]
  winner: 0 | 1
}

type Random = () => number

function pick(random: Random, max: number): number {
  return 1 + Math.floor(random() * max)
}

/** Plays one round. Dice and cards are rerolled on a tie, so there is always a winner. */
export function playRound(game: GameKind, random: Random = Math.random): Round {
  if (game === 'braco') return { game, values: [0, 0], winner: random() < 0.5 ? 0 : 1 }
  const max = game === 'dados' ? 6 : 13
  for (;;) {
    const a = pick(random, max)
    const b = pick(random, max)
    if (a !== b) return { game, values: [a, b], winner: a > b ? 0 : 1 }
  }
}

const CARD_FACES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function cardFace(value: number): string {
  return CARD_FACES[value - 1] ?? '?'
}

const WIN_LINES = [
  'Ha! Paga a próxima rodada, {loser}!',
  '{hits} golpes hoje e ainda tenho energia pra isso!',
  'Mais sorte no próximo deploy, {loser}!',
  'Isso que dá passar o dia lendo pergaminho!',
  'Invicto, igual meus testes!',
]

const LOSE_LINES = ['Revanche!', 'Foi sorte...', 'Eu tava deixando.', 'Meu teclado travou!', 'Melhor de três!']

/** A line for the winner or the loser, with {winner}, {loser} and {hits} filled in. */
export function taunt(
  side: 'win' | 'lose',
  vars: { winner: string; loser: string; hits: number },
  random: Random = Math.random,
): string {
  // Bragging about hits only makes sense with some hits to brag about.
  const lines = (side === 'win' ? WIN_LINES : LOSE_LINES).filter(line => vars.hits > 0 || !line.includes('{hits}'))
  return lines[Math.floor(random() * lines.length)]!
    .replace('{winner}', vars.winner)
    .replace('{loser}', vars.loser)
    .replace('{hits}', String(vars.hits))
}

export const TAVERN_TALK = [
  'Taverneiro, mais uma!',
  'Ouvi um merge conflict lá na dungeon.',
  'Dizem que tem um dragão no módulo de pagamentos.',
  'Meu escudo ainda tem marca de NullPointer.',
  'Quem deixou o TODO na sala 3?',
]
