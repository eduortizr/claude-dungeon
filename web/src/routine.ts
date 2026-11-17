/**
 * What a guild member does between missions. Pure, so it is unit-tested apart
 * from the drawing: every minute they move on to the next activity of the
 * cycle, each class a step ahead of the one before, and always come back to
 * training in between. A member summoned to a project room leaves from
 * wherever it is (the scene handles that).
 */
export type Activity = 'treino' | 'taverna' | 'jogos' | 'floresta'

/** One minute per slot. */
export const ROUTINE_SLOT_MS = 60_000

/** Training is half the day; the rest is a drink, a game and a walk in the forest. */
export const ROUTINE: readonly Activity[] = ['treino', 'taverna', 'jogos', 'treino', 'floresta', 'treino']

/** What the member at `index` (its position in the guild list) is doing at `now` (ms). */
export function guildActivity(index: number, now: number): Activity {
  const slot = Math.floor(now / ROUTINE_SLOT_MS)
  return ROUTINE[(((slot + index) % ROUTINE.length) + ROUTINE.length) % ROUTINE.length]!
}
