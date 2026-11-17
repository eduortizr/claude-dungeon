/**
 * The Kenney "Tiny Dungeon" sheet (CC0): 12 columns of 16×16 tiles, packed.
 * Indices below were picked from the sheet; see web/public/assets.
 */
export const TILE_SIZE = 16
const SHEET_COLUMNS = 12

export const TILE = {
  dirt: 0,
  pebbles: 12,
  stones: 24,
  wall: 40,
  sand: 48,
  sandAlt: 49,
  banner: 29,
  door: 45,
  crate: 63,
  tomb: 64,
  table: 72,
  anvil: 74,
  crateAlt: 75,
  barkeep: 85,
  barrel: 82,
  chest: 89,
  chestBig: 90,
  /** Dagger, sword, axe, hammer: the training room's weapon rack. */
  weapons: [105, 106, 107, 117],
} as const

/** Monsters that guard a project's room, picked by the project's name. */
export const MONSTERS = [108, 109, 110, 120, 121, 122, 123] as const

export function drawTile(
  ctx: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  tile: number,
  dx: number,
  dy: number,
  size = TILE_SIZE,
  flip = false,
): void {
  const sx = (tile % SHEET_COLUMNS) * TILE_SIZE
  const sy = Math.floor(tile / SHEET_COLUMNS) * TILE_SIZE
  if (!flip) {
    ctx.drawImage(sheet, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, size, size)
    return
  }
  ctx.save()
  ctx.translate(dx + size, dy)
  ctx.scale(-1, 1)
  ctx.drawImage(sheet, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, size, size)
  ctx.restore()
}

/** A white silhouette of every tile, for the hit flash. Built once from the sheet. */
export function whiteSheet(sheet: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = sheet.width
  canvas.height = sheet.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(sheet, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}
