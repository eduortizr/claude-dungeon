import { describe, expect, it } from 'vitest'
import { CUSTOM_SPRITES, pixelRows } from './characters'

describe('custom characters', () => {
  it('are 16x16 pixel maps', () => {
    for (const id of Object.values(CUSTOM_SPRITES)) {
      const rows = pixelRows(id)
      expect(rows, `sprite ${id}`).toHaveLength(16)
      for (const row of rows) expect(row, `sprite ${id}`).toHaveLength(16)
    }
  })
})
