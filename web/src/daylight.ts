/**
 * Day and night on the map, from the local clock. Pure, so it is unit-tested
 * apart from the drawing: it is night from 18:30 to 06:00, and the change takes
 * a few minutes (the map darkens from 18:30 to 18:35 and brightens from 05:55
 * to 06:00), so the screen never jumps.
 */
export const NIGHT_STARTS = 18.5 * 60
export const NIGHT_ENDS = 6 * 60
/** Minutes the dusk and the dawn last. */
export const TWILIGHT = 5

/** How dark it is: 0 in full day, 1 in full night. */
export function nightLevel(date: Date): number {
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
  if (minute >= NIGHT_STARTS) return Math.min(1, (minute - NIGHT_STARTS) / TWILIGHT)
  if (minute < NIGHT_ENDS) return Math.min(1, (NIGHT_ENDS - minute) / TWILIGHT)
  return 0
}
