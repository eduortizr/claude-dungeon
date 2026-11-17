/** Single tiles as image URLs, for the HTML side panel (portraits, class icons). */
import { TILE_SIZE, drawTile } from './tiles'

const cache = new Map<string, string>()
let sheet: HTMLImageElement | undefined

export function setSheet(image: HTMLImageElement): void {
  sheet = image
}

export function spriteUrl(tile: number, scale = 2): string {
  const key = `${tile}@${scale}`
  const cached = cache.get(key)
  if (cached) return cached
  if (!sheet) return ''
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE_SIZE * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  drawTile(ctx, sheet, tile, 0, 0, TILE_SIZE * scale)
  const url = canvas.toDataURL()
  cache.set(key, url)
  return url
}
