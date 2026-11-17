/**
 * Pixel art for what the Tiny Dungeon sheet does not have: trees, bookshelves,
 * gold, targets, a half-dissected monster. Each prop is drawn with a few
 * rectangles at 16×16 (tall ones reach into the tile above), so it sits next
 * to the Kenney tiles without looking pasted in. `time` drives the animated
 * ones (flames, bubbles, the ticker).
 */
import type { Prop, PropKind } from './map'
import { TILE_SIZE } from './tiles'

const T = TILE_SIZE

/** Props drawn flat under everyone (rugs, flowers, wall decorations); the rest is sorted by depth. */
export const GROUND_PROPS: ReadonlySet<PropKind> = new Set<PropKind>([
  'rug',
  'runes',
  'coins',
  'flowers',
  'mushrooms',
  'fireplace',
  'lantern',
  'menu',
  'poster',
  'gameshelf',
  'dartboard',
  'ticker',
])

/** Props that are targets in the training room; they wobble or flash after a hit. */
export const TARGETS: ReadonlySet<PropKind> = new Set<PropKind>(['dummy', 'archery', 'daggers', 'crystal', 'orb'])

type Ctx = CanvasRenderingContext2D

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** A cheap stable "random" per tile, for colors that vary from prop to prop. */
function seed(x: number, y: number, k = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453
  return n - Math.floor(n)
}

function glow(ctx: Ctx, x: number, y: number, radius: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, radius)
  g.addColorStop(0, color.replace('ALPHA', String(alpha)))
  g.addColorStop(1, color.replace('ALPHA', '0'))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  ctx.restore()
}

function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry = 2): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** A small flame: three stacked blobs that sway. */
function flame(ctx: Ctx, cx: number, cy: number, time: number, scale = 1): void {
  const sway = Math.round(Math.sin(time * 7 + cx) * scale)
  const tall = Math.round(Math.abs(Math.sin(time * 5 + cy)) * 2 * scale)
  rect(ctx, '#e8462b', cx - 3 * scale, cy - 3 * scale - tall, 6 * scale, 5 * scale + tall)
  rect(ctx, '#ff9a2e', cx - 2 * scale + sway, cy - 5 * scale - tall, 4 * scale, 6 * scale)
  rect(ctx, '#ffe066', cx - 1 * scale + sway, cy - 2 * scale - tall, 2 * scale, 3 * scale)
}

export interface PropContext {
  time: number
  /** Seconds since this target was last hit (training room). */
  hitAge: number
  /** The Câmara de ouro's merchant is reading fresh news: the ticker runs faster. */
  marketBusy: boolean
}

export function drawProp(ctx: Ctx, prop: Prop, c: PropContext): void {
  const px = prop.x * T
  const py = prop.y * T
  const v = prop.variant
  const { time } = c
  const wobble = c.hitAge < 0.4 ? Math.round(Math.sin(c.hitAge * 40) * 2 * (1 - c.hitAge / 0.4)) : 0
  const flash = c.hitAge < 0.15

  switch (prop.kind) {
    // ---- forest ------------------------------------------------------------
    case 'tree': {
      const greens = [
        ['#2f6b3a', '#4c9a4f', '#1f4a2a'],
        ['#3a7a34', '#62ad4f', '#24522a'],
        ['#2c5f40', '#4a8f5c', '#1b4030'],
      ][v % 3] as [string, string, string]
      shadow(ctx, px + 8, py + 15, 7, 2.5)
      rect(ctx, '#5a3a22', px + 6, py + 7, 4, 9)
      rect(ctx, '#7a5030', px + 6, py + 7, 1, 9)
      rect(ctx, greens[0], px + 1, py - 6, 14, 12)
      rect(ctx, greens[0], px + 3, py - 9, 10, 3)
      rect(ctx, greens[0], px, py - 3, 16, 7)
      rect(ctx, greens[1], px + 3, py - 7, 6, 4)
      rect(ctx, greens[1], px + 2, py - 3, 4, 3)
      rect(ctx, greens[2], px + 9, py + 1, 6, 3)
      rect(ctx, greens[2], px + 2, py + 3, 5, 2)
      break
    }
    case 'pine': {
      const [base, light] = [['#24573f', '#3b7d5a'], ['#2a6247', '#468a63'], ['#1f4d3a', '#336e50']][v % 3] as [string, string]
      shadow(ctx, px + 8, py + 15, 6, 2)
      rect(ctx, '#5a3a22', px + 7, py + 11, 2, 5)
      for (let k = 0; k < 4; k++) {
        const w = 4 + k * 4
        const y = py - 10 + k * 5
        rect(ctx, base, px + 8 - w / 2, y, w, 6)
        rect(ctx, light, px + 8 - w / 2, y, Math.max(2, w / 3), 2)
      }
      break
    }
    case 'bush':
      rect(ctx, '#2f6b3a', px + 2, py + 8, 12, 7)
      rect(ctx, '#3f8a46', px + 4, py + 6, 8, 3)
      rect(ctx, '#56a85a', px + 4, py + 8, 3, 2)
      if (v === 1) {
        rect(ctx, '#d64545', px + 9, py + 9, 2, 2)
        rect(ctx, '#d64545', px + 5, py + 11, 2, 2)
      }
      break
    case 'flowers': {
      const colors = ['#ffd34d', '#ff8ad8', '#f3f3f3', '#9b7bff']
      for (let k = 0; k < 4; k++) {
        const fx = px + 2 + Math.floor(seed(prop.x, prop.y, k) * 12)
        const fy = py + 3 + Math.floor(seed(prop.x, prop.y, k + 9) * 10)
        rect(ctx, '#3f8a46', fx, fy + 2, 1, 2)
        rect(ctx, colors[(k + v) % colors.length]!, fx - 1, fy, 3, 2)
      }
      break
    }
    case 'mushrooms':
      rect(ctx, '#e8dcc0', px + 4, py + 11, 2, 4)
      rect(ctx, '#c0392b', px + 2, py + 8, 6, 3)
      rect(ctx, '#fff', px + 3, py + 9, 1, 1)
      rect(ctx, '#fff', px + 6, py + 8, 1, 1)
      rect(ctx, '#e8dcc0', px + 11, py + 12, 2, 3)
      rect(ctx, '#d35400', px + 9, py + 10, 6, 2)
      rect(ctx, '#fff', px + 11, py + 10, 1, 1)
      break
    case 'log':
      shadow(ctx, px + 8, py + 14, 9, 2)
      rect(ctx, '#5a3a22', px - 2, py + 7, 18, 7)
      rect(ctx, '#7a5030', px - 2, py + 7, 18, 2)
      rect(ctx, '#c49a6c', px + 13, py + 7, 4, 7)
      rect(ctx, '#8a6440', px + 14, py + 9, 2, 3)
      rect(ctx, '#3f8a46', px + 2, py + 6, 3, 2) // moss
      break
    case 'stump':
      shadow(ctx, px + 8, py + 15, 6, 2)
      rect(ctx, '#5a3a22', px + 3, py + 8, 10, 7)
      rect(ctx, '#c49a6c', px + 3, py + 6, 10, 3)
      rect(ctx, '#8a6440', px + 6, py + 7, 4, 1)
      break
    case 'reeds':
      for (let k = 0; k < 4; k++) {
        const rx = px + 2 + k * 4
        const h = 9 + ((k + v) % 3) * 2
        rect(ctx, '#4c8a3f', rx, py + 16 - h, 1, h)
        if (k % 2 === 0) rect(ctx, '#6b4426', rx - 1, py + 16 - h, 3, 4)
      }
      break

    // ---- taverna -----------------------------------------------------------
    case 'fireplace': {
      rect(ctx, '#5f5a6b', px - 1, py + 1, 18, 15)
      rect(ctx, '#7a7588', px - 1, py + 1, 18, 3)
      rect(ctx, '#1a1014', px + 3, py + 6, 10, 10)
      rect(ctx, '#5a3a22', px + 4, py + 13, 8, 2)
      flame(ctx, px + 8, py + 12, time)
      glow(ctx, px + 8, py + 18, 34 + Math.sin(time * 9) * 2, 'rgba(255, 150, 60, ALPHA)', 0.28)
      break
    }
    case 'lantern':
      rect(ctx, '#3a2e40', px + 7, py + 2, 2, 4)
      rect(ctx, '#2b1d2e', px + 5, py + 6, 6, 7)
      rect(ctx, '#ffd34d', px + 6, py + 7, 4, 5)
      glow(ctx, px + 8, py + 10, 26 + Math.sin(time * 4) * 1.5, 'rgba(255, 200, 90, ALPHA)', 0.22)
      break
    case 'menu':
      rect(ctx, '#5a3a22', px + 1, py + 2, 14, 12)
      rect(ctx, '#23302a', px + 2, py + 3, 12, 10)
      for (let k = 0; k < 3; k++) rect(ctx, '#e6e1d3', px + 4, py + 5 + k * 3, 5 + (k % 2) * 3, 1)
      break
    case 'mugs': {
      const spots = [
        [3, 2],
        [10, 4],
        [6, 7],
      ]
      for (let k = 0; k < 2 + (v % 2); k++) {
        const [mx, my] = spots[k]!
        rect(ctx, '#b07d3a', px + mx!, py + my!, 3, 4)
        rect(ctx, '#f3eadb', px + mx!, py + my! - 1, 3, 1)
        rect(ctx, '#8a5a2a', px + mx! + 3, py + my! + 1, 1, 2)
      }
      break
    }
    case 'rug':
      rect(ctx, '#6e2230', px - 16, py, 48, 32)
      rect(ctx, '#c9a36b', px - 14, py + 2, 44, 1)
      rect(ctx, '#c9a36b', px - 14, py + 29, 44, 1)
      rect(ctx, '#c9a36b', px - 14, py + 2, 1, 28)
      rect(ctx, '#c9a36b', px + 29, py + 2, 1, 28)
      rect(ctx, '#8a2f3e', px - 8, py + 10, 32, 12)
      rect(ctx, '#d9b16a', px + 6, py + 14, 4, 4)
      break

    // ---- sala de jogos -----------------------------------------------------
    case 'poster':
      rect(ctx, '#e8d9b0', px + 2, py + 2, 12, 13)
      rect(ctx, '#c0392b', px + 5, py + 5, 6, 4) // a little red dragon
      rect(ctx, '#c0392b', px + 4, py + 4, 2, 2)
      rect(ctx, '#c0392b', px + 10, py + 9, 2, 2)
      rect(ctx, '#ffd34d', px + 6, py + 6, 1, 1)
      rect(ctx, '#2b1d2e', px + 4, py + 12, 8, 1)
      break
    case 'gameshelf': {
      rect(ctx, '#5a3a22', px, py + 3, 16, 12)
      const colors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12']
      for (let k = 0; k < 5; k++) rect(ctx, colors[k]!, px + 1 + k * 3, py + 4 + (k % 2), 2, 4 - (k % 2))
      for (let k = 0; k < 3; k++) rect(ctx, colors[(k + 2) % 5]!, px + 1, py + 9 + k * 2, 14, 1)
      break
    }
    case 'dartboard':
      ctx.fillStyle = '#1a1014'
      ctx.beginPath()
      ctx.arc(px + 8, py + 8, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c0392b'
      ctx.beginPath()
      ctx.arc(px + 8, py + 8, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f3eadb'
      ctx.beginPath()
      ctx.arc(px + 8, py + 8, 2, 0, Math.PI * 2)
      ctx.fill()
      rect(ctx, '#ffd34d', px + 10, py + 5, 3, 1)
      rect(ctx, '#ffd34d', px + 5, py + 9, 3, 1)
      break
    case 'd20': {
      shadow(ctx, px + 8, py + 15, 6)
      rect(ctx, '#5f5a6b', px + 3, py + 11, 10, 4)
      const hue = v === 0 ? ['#7d4fd6', '#a983ff', '#4c2f8a'] : ['#c0392b', '#ff6b5a', '#7a1f1a']
      ctx.fillStyle = hue[0]!
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 2
        ctx.lineTo(px + 8 + Math.cos(a) * 7, py + 4 + Math.sin(a) * 7)
      }
      ctx.fill()
      rect(ctx, hue[1]!, px + 5, py - 1, 6, 2)
      ctx.fillStyle = '#fff'
      ctx.font = '700 6px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('20', px + 8, py + 5)
      break
    }
    case 'rpgtable': {
      // Parchment map with a grid and minis, the master's screen on the left side.
      rect(ctx, '#e8d9b0', px - 2, py + 2, 20, 10)
      ctx.fillStyle = 'rgba(90, 58, 34, 0.35)'
      for (let gx = 0; gx < 20; gx += 4) ctx.fillRect(px - 2 + gx, py + 2, 1, 10)
      for (let gy = 0; gy < 10; gy += 4) ctx.fillRect(px - 2, py + 2 + gy, 20, 1)
      rect(ctx, '#6b8f5a', px + 9, py + 4, 5, 3) // a forest on the map
      rect(ctx, '#5f8fc9', px + 1, py + 8, 4, 2) // a lake
      rect(ctx, '#c0392b', px + 6, py + 5, 2, 3) // the dragon mini
      rect(ctx, '#ffd34d', px + 12, py + 8, 1, 2) // party minis
      rect(ctx, '#5fd38d', px + 14, py + 8, 1, 2)
      rect(ctx, '#9b7bff', px + 13, py + 9, 1, 2)
      rect(ctx, '#7a1f1a', px - 4, py - 2, 5, 12) // master's screen
      rect(ctx, '#ffd34d', px - 3, py - 1, 3, 1)
      rect(ctx, '#ffd34d', px - 3, py + 8, 3, 1)
      const roll = Math.floor(time * 0.7) % 2 === 0
      rect(ctx, roll ? '#fdf7ea' : '#a983ff', px + 3, py + 9, 2, 2) // a die
      break
    }

    // ---- sala de treinamento -----------------------------------------------
    case 'runes': {
      const pulse = 0.45 + Math.sin(time * 2) * 0.2
      ctx.save()
      ctx.strokeStyle = `rgba(169, 131, 255, ${pulse})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(px + 8, py + 13, 13, 6, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(px + 8, py + 13, 9, 4, 0, 0, Math.PI * 2)
      ctx.stroke()
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + time * 0.6
        ctx.fillStyle = `rgba(255, 211, 77, ${pulse + 0.2})`
        ctx.fillRect(Math.round(px + 8 + Math.cos(a) * 11) - 1, Math.round(py + 13 + Math.sin(a) * 5) - 1, 2, 2)
      }
      ctx.restore()
      break
    }
    case 'dummy': {
      shadow(ctx, px + 8, py + 15, 5)
      rect(ctx, '#5a3a22', px + 7, py + 8, 2, 7)
      const body = flash ? '#fff' : '#c9a36b'
      rect(ctx, body, px + 4 + wobble, py + 5, 8, 6)
      rect(ctx, body, px + 2 + wobble, py + 6, 12, 2)
      rect(ctx, flash ? '#fff' : '#e0c48a', px + 5 + wobble, py + 1, 6, 4)
      rect(ctx, '#8a2a2a', px + 7 + wobble, py + 7, 2, 2)
      break
    }
    case 'archery': {
      shadow(ctx, px + 8, py + 15, 6)
      rect(ctx, '#5a3a22', px + 3, py + 9, 2, 7)
      rect(ctx, '#5a3a22', px + 11, py + 9, 2, 7)
      const rings = ['#f3eadb', '#c0392b', '#f3eadb', '#c0392b', '#ffd34d']
      rings.forEach((color, k) => {
        ctx.fillStyle = flash && k === 4 ? '#fff' : color
        ctx.beginPath()
        ctx.arc(px + 8 + wobble, py + 6, 7 - k * 1.4, 0, Math.PI * 2)
        ctx.fill()
      })
      rect(ctx, '#5a3a22', px + 10 + wobble, py + 3, 4, 1) // arrows stuck in it
      rect(ctx, '#5a3a22', px + 2 + wobble, py + 8, 4, 1)
      break
    }
    case 'daggers': {
      shadow(ctx, px + 8, py + 15, 6)
      rect(ctx, '#5a3a22', px + 7, py + 11, 2, 5)
      rect(ctx, '#8a5a33', px + 2 + wobble, py + 1, 12, 11)
      rect(ctx, '#6b4426', px + 2 + wobble, py + 1, 12, 1)
      rect(ctx, '#c0392b', px + 6 + wobble, py + 5, 4, 3) // target painted on
      rect(ctx, '#f3eadb', px + 7 + wobble, py + 6, 2, 1)
      for (const [dx, dy] of [
        [4, 3],
        [10, 8],
        [8, 4],
      ]) {
        rect(ctx, '#d6dde6', px + dx! + wobble, py + dy!, 1, 3)
        rect(ctx, '#3a2e40', px + dx! + wobble, py + dy! + 3, 1, 1)
      }
      break
    }
    case 'crystal': {
      const bob = Math.round(Math.sin(time * 2.5) * 1.5)
      shadow(ctx, px + 8, py + 15, 5)
      rect(ctx, '#5f5a6b', px + 4, py + 12, 8, 3)
      const color = flash ? '#ffffff' : '#5fc9ff'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(px + 8, py - 1 + bob)
      ctx.lineTo(px + 13, py + 5 + bob)
      ctx.lineTo(px + 8, py + 11 + bob)
      ctx.lineTo(px + 3, py + 5 + bob)
      ctx.fill()
      rect(ctx, '#c9f0ff', px + 6, py + 2 + bob, 2, 4)
      glow(ctx, px + 8, py + 5 + bob, flash ? 24 : 14, 'rgba(95, 201, 255, ALPHA)', flash ? 0.6 : 0.25)
      break
    }
    case 'orb': {
      const bob = Math.round(Math.sin(time * 2) * 2)
      shadow(ctx, px + 8, py + 15, 5)
      rect(ctx, '#7a5030', px + 6, py + 10, 4, 5)
      rect(ctx, '#ffd34d', px + 5, py + 9, 6, 2)
      ctx.fillStyle = flash ? '#fff' : '#ffb347'
      ctx.beginPath()
      ctx.arc(px + 8, py + 4 + bob, 4, 0, Math.PI * 2)
      ctx.fill()
      rect(ctx, '#fff3c4', px + 6, py + 2 + bob, 2, 2)
      for (let k = 0; k < 3; k++) {
        const a = time * 3 + (k / 3) * Math.PI * 2
        rect(ctx, '#ffe066', Math.round(px + 8 + Math.cos(a) * 7), Math.round(py + 4 + bob + Math.sin(a) * 3), 1, 1)
      }
      glow(ctx, px + 8, py + 4 + bob, flash ? 28 : 16, 'rgba(255, 190, 80, ALPHA)', flash ? 0.6 : 0.25)
      break
    }

    // ---- biblioteca --------------------------------------------------------
    case 'bookshelf': {
      rect(ctx, '#4a2e1a', px, py - 10, 16, 26)
      rect(ctx, '#6b4426', px + 1, py - 9, 14, 24)
      const colors = ['#8e2a2a', '#2a4f8e', '#2f6b3a', '#8a6a2a', '#5a2a6e', '#3a3a4a']
      for (let shelf = 0; shelf < 3; shelf++) {
        const sy = py - 8 + shelf * 8
        rect(ctx, '#2b1a10', px + 1, sy, 14, 7)
        let bx = px + 2
        let k = 0
        while (bx < px + 14) {
          const w = 1 + Math.floor(seed(prop.x, shelf, k + v) * 2)
          const h = 4 + Math.floor(seed(prop.x, shelf, k + 7) * 3)
          rect(ctx, colors[Math.floor(seed(prop.x + v, shelf, k) * colors.length)]!, bx, sy + 7 - h, w, h)
          bx += w + (seed(prop.x, k, shelf) < 0.2 ? 1 : 0)
          k++
        }
        rect(ctx, '#4a2e1a', px + 1, sy + 7, 14, 1)
      }
      break
    }
    case 'readtable': {
      shadow(ctx, px + 8, py + 15, 8)
      rect(ctx, '#5a3a22', px - 1, py + 4, 18, 8)
      rect(ctx, '#7a5030', px - 1, py + 4, 18, 2)
      rect(ctx, '#5a3a22', px, py + 12, 2, 4)
      rect(ctx, '#5a3a22', px + 14, py + 12, 2, 4)
      // An open book.
      rect(ctx, '#f3eadb', px + 2, py + 5, 5, 5)
      rect(ctx, '#e6d9bd', px + 7, py + 5, 5, 5)
      for (let k = 0; k < 3; k++) {
        rect(ctx, '#9a8a74', px + 3, py + 6 + k * 1.5, 3, 0.5)
        rect(ctx, '#9a8a74', px + 8, py + 6 + k * 1.5, 3, 0.5)
      }
      // A candle.
      rect(ctx, '#f3eadb', px + 14, py + 1, 2, 5)
      const f = Math.sin(time * 11 + v) > 0 ? 1 : 0
      rect(ctx, '#ffb347', px + 14, py - 1 - f, 2, 2 + f)
      glow(ctx, px + 15, py, 18, 'rgba(255, 200, 100, ALPHA)', 0.18)
      if (v === 1) rect(ctx, '#2a4f8e', px + 1, py + 2, 5, 2) // a stack of books
      break
    }
    case 'dissection': {
      // A stone slab with a monster on its back, belly open, pinned, tools on a tray.
      shadow(ctx, px + 8, py + 15, 10)
      rect(ctx, '#5f5a6b', px - 3, py + 5, 22, 9)
      rect(ctx, '#7a7588', px - 3, py + 5, 22, 2)
      rect(ctx, '#4a4658', px - 1, py + 14, 3, 2)
      rect(ctx, '#4a4658', px + 14, py + 14, 3, 2)
      // Body.
      rect(ctx, '#5f9b4a', px - 1, py + 4, 15, 7)
      rect(ctx, '#4c8a3f', px - 1, py + 9, 15, 2)
      // Head with an X eye and a tongue.
      rect(ctx, '#5f9b4a', px + 13, py + 3, 6, 6)
      rect(ctx, '#1a1014', px + 15, py + 4, 1, 1)
      rect(ctx, '#1a1014', px + 17, py + 4, 1, 1)
      rect(ctx, '#1a1014', px + 16, py + 5, 1, 1)
      rect(ctx, '#c45a7a', px + 18, py + 7, 2, 1)
      // The open belly: ribs and organs.
      rect(ctx, '#7a1f2a', px + 2, py + 5, 9, 4)
      rect(ctx, '#d65a6e', px + 3, py + 6, 3, 2)
      rect(ctx, '#e8a0a8', px + 7, py + 6, 2, 2)
      rect(ctx, '#9b4a8a', px + 6, py + 7, 2, 1)
      for (let k = 0; k < 4; k++) rect(ctx, '#f3eadb', px + 2 + k * 3, py + 5, 1, 4)
      // Pins and a dripping cut.
      rect(ctx, '#d6dde6', px + 1, py + 3, 1, 2)
      rect(ctx, '#d6dde6', px + 11, py + 3, 1, 2)
      const drip = Math.floor(time * 2) % 4
      rect(ctx, '#7dd36b', px + 5, py + 11 + drip, 1, 1)
      // Tray with a scalpel.
      rect(ctx, '#c9c2b0', px - 3, py + 1, 6, 2)
      rect(ctx, '#d6dde6', px - 2, py + 1, 4, 1)
      break
    }
    case 'cauldron': {
      flame(ctx, px + 8, py + 15, time, 1)
      rect(ctx, '#1a1014', px + 2, py + 5, 12, 9)
      rect(ctx, '#2b2b3a', px + 1, py + 4, 14, 3)
      rect(ctx, '#5fd38d', px + 3, py + 4, 10, 2)
      for (let k = 0; k < 3; k++) {
        const phase = (time * 0.9 + k / 3) % 1
        const bx = px + 4 + k * 4 + Math.round(Math.sin((time + k) * 3))
        ctx.fillStyle = `rgba(125, 255, 155, ${1 - phase})`
        ctx.fillRect(bx, py + 3 - phase * 12, 2, 2)
      }
      glow(ctx, px + 8, py + 4, 18, 'rgba(95, 211, 141, ALPHA)', 0.25)
      break
    }
    case 'labbench': {
      rect(ctx, '#5a3a22', px - 1, py + 6, 18, 8)
      rect(ctx, '#7a5030', px - 1, py + 6, 18, 2)
      rect(ctx, '#4a2e1a', px, py + 14, 2, 2)
      rect(ctx, '#4a2e1a', px + 14, py + 14, 2, 2)
      const liquids = ['#5fd38d', '#c0392b', '#5fc9ff', '#9b7bff', '#ffd34d']
      const color = liquids[v % liquids.length]!
      if (v % 3 === 0) {
        // A round flask on a stand, bubbling.
        ctx.fillStyle = '#d6e6f0'
        ctx.beginPath()
        ctx.arc(px + 6, py + 2, 4, 0, Math.PI * 2)
        ctx.fill()
        rect(ctx, color, px + 3, py + 2, 7, 3)
        rect(ctx, '#d6e6f0', px + 5, py - 5, 2, 4)
        rect(ctx, '#9aa6b0', px + 7, py - 5, 6, 1) // a tube to the next flask
        if (Math.floor(time * 3) % 2 === 0) rect(ctx, '#fff', px + 5, py + 1, 1, 1)
      } else if (v % 3 === 1) {
        // Test tubes in a rack.
        for (let k = 0; k < 3; k++) {
          rect(ctx, '#d6e6f0', px + 3 + k * 4, py - 1, 2, 7)
          rect(ctx, liquids[(v + k) % liquids.length]!, px + 3 + k * 4, py + 2, 2, 4)
        }
        rect(ctx, '#7a5030', px + 2, py + 4, 12, 2)
      } else {
        // A tall bottle and a mortar.
        rect(ctx, '#d6e6f0', px + 3, py - 3, 4, 9)
        rect(ctx, color, px + 3, py + 1, 4, 5)
        rect(ctx, '#7a7588', px + 9, py + 2, 5, 4)
        rect(ctx, '#c9c2b0', px + 12, py - 1, 1, 4)
      }
      break
    }
    case 'jars':
      rect(ctx, '#4a2e1a', px, py - 2, 16, 18)
      for (let k = 0; k < 2; k++) {
        const jy = py + k * 8
        rect(ctx, '#2b1a10', px + 1, jy - 1, 14, 7)
        for (let j = 0; j < 2; j++) {
          const jx = px + 2 + j * 7
          rect(ctx, 'rgba(125, 200, 140, 0.8)', jx, jy, 5, 6)
          rect(ctx, '#9aa6b0', jx, jy - 1, 5, 1)
          if ((k + j) % 2 === 0) {
            rect(ctx, '#f3eadb', jx + 1, jy + 2, 3, 3) // an eye
            rect(ctx, '#2a4f8e', jx + 2, jy + 3, 1, 1)
          } else {
            rect(ctx, '#c45a7a', jx + 1, jy + 1, 1, 4) // a tentacle
            rect(ctx, '#c45a7a', jx + 2, jy + 4, 2, 1)
          }
        }
      }
      break
    case 'skull':
      rect(ctx, '#2a4f8e', px + 2, py + 11, 12, 2)
      rect(ctx, '#8e2a2a', px + 3, py + 9, 10, 2)
      rect(ctx, '#e8e2d0', px + 5, py + 3, 6, 6)
      rect(ctx, '#e8e2d0', px + 6, py + 8, 4, 1)
      rect(ctx, '#1a1014', px + 6, py + 5, 1, 2)
      rect(ctx, '#1a1014', px + 9, py + 5, 1, 2)
      break

    // ---- câmara de ouro ----------------------------------------------------
    case 'gold': {
      const h = [6, 9, 13][v] ?? 6
      shadow(ctx, px + 8, py + 15, 7)
      ctx.fillStyle = '#b07d1a'
      ctx.beginPath()
      ctx.moveTo(px, py + 15)
      ctx.lineTo(px + 8, py + 15 - h)
      ctx.lineTo(px + 16, py + 15)
      ctx.fill()
      ctx.fillStyle = '#f2c544'
      ctx.beginPath()
      ctx.moveTo(px + 2, py + 14)
      ctx.lineTo(px + 8, py + 16 - h)
      ctx.lineTo(px + 13, py + 14)
      ctx.fill()
      rect(ctx, '#fff3c4', px + 6, py + 17 - h, 2, 2)
      for (let k = 0; k < 4; k++) rect(ctx, '#ffe066', px + 2 + k * 4, py + 13 - (k % 2) * 2, 2, 1)
      const twinkle = (time * 0.7 + seed(prop.x, prop.y)) % 1
      if (twinkle < 0.18) {
        const sx = px + 4 + Math.floor(seed(prop.x, prop.y, Math.floor(time)) * 8)
        const sy = py + 15 - h + 3
        rect(ctx, '#fff', sx, sy - 2, 1, 5)
        rect(ctx, '#fff', sx - 2, sy, 5, 1)
      }
      break
    }
    case 'coins':
      for (let k = 0; k < 3; k++) {
        const cx = px + 3 + Math.floor(seed(prop.x, prop.y, k) * 10)
        const cy = py + 5 + Math.floor(seed(prop.x, prop.y, k + 3) * 8)
        rect(ctx, '#b07d1a', cx, cy + 1, 3, 1)
        rect(ctx, '#f2c544', cx, cy, 3, 1)
      }
      rect(ctx, '#b07d1a', px + 10, py + 9, 3, 4) // a little stack
      rect(ctx, '#f2c544', px + 10, py + 9, 3, 1)
      rect(ctx, '#f2c544', px + 10, py + 11, 3, 1)
      break
    case 'scale':
      shadow(ctx, px + 8, py + 15, 5)
      rect(ctx, '#b07d1a', px + 7, py + 3, 2, 12)
      rect(ctx, '#b07d1a', px + 4, py + 14, 8, 2)
      {
        const tilt = Math.round(Math.sin(time * 1.3) * 1.5)
        rect(ctx, '#f2c544', px + 1, py + 3 - tilt, 14, 1)
        rect(ctx, '#f2c544', px, py + 7 - tilt, 5, 2)
        rect(ctx, '#f2c544', px + 11, py + 7 + tilt, 5, 2)
        rect(ctx, '#ffe066', px + 1, py + 6 - tilt, 3, 1)
      }
      break
    case 'tradetable': {
      // Three tiles wide: ledger, quill and ink, an abacus, stacks of coins, the morning paper.
      shadow(ctx, px + 8, py + 15, 22, 3)
      rect(ctx, '#3d2414', px - 15, py + 3, 46, 10)
      rect(ctx, '#5a3a22', px - 15, py + 3, 46, 2)
      rect(ctx, '#b07d1a', px - 15, py + 12, 46, 1)
      rect(ctx, '#3d2414', px - 13, py + 13, 3, 3)
      rect(ctx, '#3d2414', px + 26, py + 13, 3, 3)
      // Ledger, open, with columns of numbers.
      rect(ctx, '#f3eadb', px + 2, py + 4, 6, 7)
      rect(ctx, '#e6d9bd', px + 8, py + 4, 6, 7)
      for (let k = 0; k < 4; k++) {
        rect(ctx, k % 2 ? '#c0392b' : '#2f6b3a', px + 3, py + 5 + k * 1.5, 4, 0.6)
        rect(ctx, '#7a6a54', px + 9, py + 5 + k * 1.5, 4, 0.6)
      }
      // Quill and inkpot.
      rect(ctx, '#1a1014', px + 16, py + 6, 3, 3)
      rect(ctx, '#f3eadb', px + 17, py + 1, 1, 6)
      rect(ctx, '#f3eadb', px + 18, py + 1, 2, 2)
      // Abacus.
      rect(ctx, '#7a5030', px - 12, py + 4, 9, 6)
      for (let k = 0; k < 3; k++) {
        const slide = Math.round(Math.sin(time * 1.7 + k) * 2)
        rect(ctx, '#c9a36b', px - 11, py + 5 + k * 2, 7, 1)
        rect(ctx, '#c0392b', px - 9 + slide, py + 5 + k * 2, 2, 1)
      }
      // Coins and the paper.
      for (let k = 0; k < 3; k++) {
        rect(ctx, '#b07d1a', px + 22 + k * 3, py + 10 - k, 2, 2 + k)
        rect(ctx, '#f2c544', px + 22 + k * 3, py + 10 - k, 2, 1)
      }
      rect(ctx, '#d9d4c7', px + 21, py + 3, 8, 5)
      rect(ctx, '#2b1d2e', px + 22, py + 4, 6, 1)
      rect(ctx, '#7a7588', px + 22, py + 6, 4, 0.6)
      break
    }
    case 'ticker': {
      // A board on the wall with a candlestick chart that keeps scrolling.
      rect(ctx, '#3d2414', px - 16, py + 1, 48, 14)
      rect(ctx, '#0f1a14', px - 15, py + 2, 46, 12)
      rect(ctx, '#f2c544', px - 16, py + 1, 48, 1)
      const speed = c.marketBusy ? 3 : 0.8
      const shift = Math.floor(time * speed)
      for (let k = 0; k < 11; k++) {
        const n = k + shift
        const up = seed(n, 3) > 0.45
        const h = 2 + Math.floor(seed(n, 7) * 6)
        const base = py + 4 + Math.floor(seed(n, 11) * 4)
        rect(ctx, up ? '#5fd38d' : '#e8462b', px - 13 + k * 4, base, 2, h)
        rect(ctx, up ? '#5fd38d' : '#e8462b', px - 12 + k * 4, base - 1, 0.6, h + 2)
      }
      if (c.marketBusy && Math.floor(time * 2) % 2 === 0) rect(ctx, '#ffd34d', px + 28, py + 3, 2, 2)
      break
    }
  }
}
