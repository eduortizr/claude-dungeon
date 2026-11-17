import { describe, expect, it } from 'vitest'
import { Camera } from './camera'

describe('Camera.fit with a focus area', () => {
  // View 1000x600 px; the world is 3000x500 px, so at zoom 2 the view shows 500 world px wide.
  const arena = { x: 2000, y: 100, width: 400, height: 300 }

  it('brings an off-screen arena into view when the map is wider than the screen', () => {
    const camera = new Camera()
    camera.fit(1000, 600, 3000, 500, false, arena)
    expect(camera.x).toBeLessThanOrEqual(arena.x)
    expect(camera.x + 1000 / camera.zoom).toBeGreaterThanOrEqual(arena.x + arena.width)
  })

  it('keeps the usual view (the cave on the left) when the arena is already in sight', () => {
    const camera = new Camera()
    camera.fit(1000, 600, 3000, 500, false, { x: 50, y: 100, width: 300, height: 300 })
    expect(camera.x).toBe(0)
  })

  it('changes nothing when the whole map fits', () => {
    const plain = new Camera()
    const focused = new Camera()
    plain.fit(2000, 1200, 400, 300)
    focused.fit(2000, 1200, 400, 300, false, { x: 300, y: 100, width: 90, height: 90 })
    expect([focused.x, focused.y, focused.zoom]).toEqual([plain.x, plain.y, plain.zoom])
  })

  it('never goes past the map edges', () => {
    const camera = new Camera()
    camera.fit(1000, 600, 3000, 500, false, { x: 2900, y: 0, width: 100, height: 100 })
    expect(camera.x + 1000 / camera.zoom).toBeLessThanOrEqual(3000)
  })
})
