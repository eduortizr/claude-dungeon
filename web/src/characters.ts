/**
 * Characters drawn for this project (the sheet has no merchant or alchemist):
 * 16×16 pixel maps, one letter per pixel, with a small palette each. Their
 * sprite ids are negative so they never clash with a sheet index; `drawSprite`
 * picks the right source for any id.
 */
import { TILE_SIZE, drawTile } from './tiles'

interface PixelArt {
  palette: Record<string, string>
  rows: string[]
}

const OUTLINE = '#1a1220'

/** The old merchant of the Câmara de ouro: red cap, round spectacles, a long white beard, a quill in hand. */
const MERCADOR: PixelArt = {
  palette: {
    k: OUTLINE,
    r: '#b8323e',
    R: '#7a1f2a',
    y: '#f2c544',
    Y: '#b07d1a',
    s: '#e8b796',
    S: '#c48a6a',
    w: '#f1ede4',
    W: '#bdb6aa',
    e: '#2b2b3a',
    o: '#9fd8ff',
    p: '#5a2f8a',
    P: '#36195a',
    b: '#6a4428',
    q: '#fdf7ea',
  },
  rows: [
    '................',
    '.....kkkkkk.....',
    '....krryyrrk....',
    '....kRRRRRRk....',
    '...kWSssssSWk...',
    '...kWyoyyoyWk.q.',
    '...kWssSSssWk.q.',
    '....kwwSSwwk..q.',
    '...kpwwwwwwpk.k.',
    '..kpPwwwwwwPpks.',
    '..kpPywWwwyPpk..',
    '..kspPywwyPPk...',
    '...kPPbyybPPk...',
    '...kpPPppPPpk...',
    '...kPPPkkPPPk...',
    '....kkk..kkk....',
  ],
}

/** The alchemist of the Biblioteca: a teal hood, brass goggles, a stained apron, a green flask. */
const ALQUIMISTA: PixelArt = {
  palette: {
    k: OUTLINE,
    g: '#2f7a72',
    G: '#1d4f4a',
    y: '#d9a441',
    o: '#7fe0c8',
    s: '#e8b796',
    S: '#c48a6a',
    e: '#2b2b3a',
    a: '#d9cfb8',
    A: '#a89c82',
    m: '#7dd36b',
    d: '#3a2e40',
    h: '#8a4a2a',
  },
  rows: [
    '................',
    '......kkkk......',
    '.....kggggk.....',
    '....kgGGGGgk....',
    '...kgyoyyoygk...',
    '...kgsssssSgk...',
    '...kgsesseSgk...',
    '....kgsSSsgk....',
    '...kggaaaagGk...',
    '..kgGaAaaAaGgk..',
    '..ksgaamaaaGgkk.',
    '..kkgaAaaAagkmk.',
    '...kgaaaaaaGkmk.',
    '...kGgAAAAgGkk..',
    '...kGGGkkGGGk...',
    '....kdd..ddk....',
  ],
}

/**
 * The Mestre do Claude, who runs the sala de jogos: a friendly wizard in
 * Claude's coral robe and a purple hat with a star, a white beard, a staff
 * topped by a glowing d20. His dragon pet is drawn apart (props.ts).
 */
const MESTRE: PixelArt = {
  palette: {
    k: OUTLINE,
    p: '#6a4fd0',
    P: '#43309a',
    y: '#ffd34d',
    s: '#f0c2a0',
    e: '#2b2b3a',
    m: '#b5473c',
    b: '#f1ede4',
    c: '#d97757',
    C: '#a8553a',
    h: '#6a4428',
    q: '#c9b0ff',
  },
  rows: [
    '................',
    '.......kk.......',
    '......kppk......',
    '.....kpppPk.....',
    '....kppypPPk....',
    '.kkPPPPPPPPPPkk.',
    '...kssssssssk.qq',
    '...ksessssesk.hq',
    '..kbbbbmmbbbbk.h',
    '..kbbbbbbbbbbk.h',
    '..kcCbbbbbbCck.h',
    '.kccccccccccckh.',
    '.kcccCyyyyCcckh.',
    '.kcccccccccccck.',
    '..kCCCCCCCCCCk..',
    '...kkk....kkk...',
  ],
}

/** The taverna's minstrel: a red cap with a feather, a teal tunic and a lute. */
const MENESTREL: PixelArt = {
  palette: {
    k: OUTLINE,
    R: '#b8323e',
    D: '#7a1f2a',
    f: '#f3eadb',
    s: '#e8b796',
    e: '#2b2b3a',
    m: '#b5473c',
    t: '#2f8a8a',
    T: '#1d5656',
    y: '#e0b04a',
    l: '#a8672e',
    L: '#6a3f1c',
    b: '#4a3020',
  },
  rows: [
    '................',
    '......kkkk...ff.',
    '.....kRRRRk.ff..',
    '....kRRRRRRkf...',
    '...kDDDDDDDDk...',
    '...kssssssssk...',
    '...ksessssesk...',
    '....kssmmssk....',
    '...kTttttttTk...',
    '..kllLtttttTk...',
    '.kllyLtttttTk...',
    '.kllLsttttTk....',
    '..kllLkkttTk....',
    '...kkk.kttk.....',
    '.....kbbkbbk....',
    '.....kkk.kkk....',
  ],
}

export const CUSTOM_SPRITES = { mercador: -1, alquimista: -2, mestre: -3, menestrel: -4 } as const

const ART: Record<number, PixelArt> = { [-1]: MERCADOR, [-2]: ALQUIMISTA, [-3]: MESTRE, [-4]: MENESTREL }
const rendered = new Map<number, HTMLCanvasElement>()

/** The pixel map as a 16×16 canvas (white silhouette when `white`). Built once per sprite. */
function canvasFor(id: number, white = false): HTMLCanvasElement {
  const key = white ? id - 1000 : id
  const cached = rendered.get(key)
  if (cached) return cached
  const art = ART[id]!
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d')!
  art.rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const color = art.palette[ch]
      if (!color) return
      ctx.fillStyle = white ? '#fff' : color
      ctx.fillRect(x, y, 1, 1)
    })
  })
  rendered.set(key, canvas)
  return canvas
}

export function isCustomSprite(id: number): boolean {
  return id < 0 && id in ART
}

/** Draws a sheet tile or one of the custom characters. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  sprite: number,
  dx: number,
  dy: number,
  size = TILE_SIZE,
  flip = false,
): void {
  if (!isCustomSprite(sprite)) {
    drawTile(ctx, sheet, sprite, dx, dy, size, flip)
    return
  }
  const source = canvasFor(sprite)
  if (!flip) {
    ctx.drawImage(source, dx, dy, size, size)
    return
  }
  ctx.save()
  ctx.translate(dx + size, dy)
  ctx.scale(-1, 1)
  ctx.drawImage(source, 0, 0, size, size)
  ctx.restore()
}

/** For tests and previews: the raw pixel rows of a custom character. */
export function pixelRows(id: number): readonly string[] {
  return ART[id]?.rows ?? []
}
