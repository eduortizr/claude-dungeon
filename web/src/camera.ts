/**
 * Pan (drag) and zoom (wheel) over the map. Zoom stays an integer so every
 * 16 px tile covers a whole number of screen pixels and the pixel art stays crisp.
 */
import type { Point } from './pathfinding'

const MIN_ZOOM = 1
const MAX_ZOOM = 7
const CLICK_SLOP = 4

export class Camera {
  zoom = 3
  /** World pixel shown at the canvas's top-left corner. */
  x = 0
  y = 0
  /** Canvas pixels per CSS pixel (devicePixelRatio): pointer events come in CSS pixels. */
  pixelRatio = 1
  private hasUserMoved = false

  /** Centers the world, as large as fits; keeps the user's view once they moved it. */
  fit(viewWidth: number, viewHeight: number, worldWidth: number, worldHeight: number, force = false): void {
    if (this.hasUserMoved && !force) return
    const fits = Math.floor(Math.min(viewWidth / worldWidth, viewHeight / worldHeight))
    this.zoom = Math.min(MAX_ZOOM, Math.max(2, fits))
    this.x = (worldWidth - viewWidth / this.zoom) / 2
    this.y = (worldHeight - viewHeight / this.zoom) / 2
    if (this.x > 0) this.x = 0 // wider than the screen: start from the cave on the left
  }

  toWorld(screenX: number, screenY: number): Point {
    return { x: screenX / this.zoom + this.x, y: screenY / this.zoom + this.y }
  }

  toScreen(worldX: number, worldY: number): Point {
    return { x: Math.round((worldX - this.x) * this.zoom), y: Math.round((worldY - this.y) * this.zoom) }
  }

  attach(canvas: HTMLCanvasElement, onClick: (world: Point) => void): void {
    let drag: { x: number; y: number; moved: number } | undefined

    canvas.addEventListener('pointerdown', event => {
      drag = { x: event.clientX, y: event.clientY, moved: 0 }
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', event => {
      if (!drag) return
      const dx = (event.clientX - drag.x) * this.pixelRatio
      const dy = (event.clientY - drag.y) * this.pixelRatio
      drag = { x: event.clientX, y: event.clientY, moved: drag.moved + Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) }
      if (drag.moved > CLICK_SLOP) {
        this.x -= dx / this.zoom
        this.y -= dy / this.zoom
        this.hasUserMoved = true
        canvas.classList.add('dragging')
      }
    })
    canvas.addEventListener('pointerup', event => {
      if (drag && drag.moved <= CLICK_SLOP) {
        const rect = canvas.getBoundingClientRect()
        onClick(this.toWorld((event.clientX - rect.left) * this.pixelRatio, (event.clientY - rect.top) * this.pixelRatio))
      }
      drag = undefined
      canvas.classList.remove('dragging')
    })
    canvas.addEventListener(
      'wheel',
      event => {
        event.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const sx = (event.clientX - rect.left) * this.pixelRatio
        const sy = (event.clientY - rect.top) * this.pixelRatio
        const before = this.toWorld(sx, sy)
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + (event.deltaY < 0 ? 1 : -1)))
        if (zoom === this.zoom) return
        this.zoom = zoom
        // Keep the point under the cursor where it was.
        this.x = before.x - sx / zoom
        this.y = before.y - sy / zoom
        this.hasUserMoved = true
      },
      { passive: false },
    )
  }
}
