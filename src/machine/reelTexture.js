import * as THREE from 'three'
import { REEL_FACE, reelRadius } from './geometry.js'

/**
 * Builds the printed strip that wraps around a reel drum.
 *
 * Every reel shows the same chord pool, so one texture serves all six drums — only
 * their rotation differs. That keeps this to two textures total (sharp + blurred)
 * no matter how many reels are on screen.
 *
 * Mapping notes, because the orientation is easy to get wrong:
 *   - On a CylinderGeometry, uv.u runs around the circumference and uv.v runs along
 *     the axis. After the drum is laid on its side, u is the vertical screen axis
 *     and v is the horizontal one.
 *   - So chords are laid out along canvas X (one vertical strip each) and each
 *     glyph is drawn rotated a quarter turn to read upright on screen.
 *   - Laying the drum on its side maps uv.v = 1 to screen-left, so with the default
 *     flipY that quarter turn is a rotation. Forcing flipY = false makes it a
 *     reflection instead and every letter comes out mirrored.
 */

/**
 * Real slot reels carry ~20 symbols so the curve between neighbours stays gentle.
 * A 3-chord pool wrapped once round a drum would put 120° between chords and the
 * neighbours would be edge-on, so the pool is repeated until it reaches this many.
 */
const TARGET_CELLS = 18

/** Texture resolution along the drum's width. */
const FACE_PX = 640

const KNOW = '#2f6df0'
const LEARN = '#f4443f'

/** How many cells go around the drum, always a whole number of pool repeats. */
export function cellsAround(poolLength) {
  const repeats = Math.max(1, Math.round(TARGET_CELLS / poolLength))
  return poolLength * repeats
}

/**
 * Cells run one way round the drum and pool indices the other, so that the chord
 * shown *above* the payline is the pool entry *before* the current one — matching
 * the original app's above/below ordering.
 */
export const poolIndexForCell = (cell, poolLength) => (((-cell % poolLength) + poolLength) % poolLength)

/** The cell to stop on so that `poolIndex` ends up on the payline. */
export const cellForPoolIndex = (poolIndex, poolLength, cells) => {
  const base = (((-poolIndex % poolLength) + poolLength) % poolLength)
  // Land on a random one of the repeated copies so repeat spins don't look identical.
  const copies = Math.max(1, Math.floor(cells / poolLength))
  return base + poolLength * Math.floor(Math.random() * copies)
}

function paperBackdrop(ctx, x, y, w, h) {
  // Slight warm-white with the edges falling off, so cells read as separate tiles
  // even before the lighting shades the curve.
  const grad = ctx.createLinearGradient(x, 0, x + w, 0)
  grad.addColorStop(0, '#c8ccd6')
  grad.addColorStop(0.14, '#fdfdff')
  grad.addColorStop(0.86, '#fdfdff')
  grad.addColorStop(1, '#c8ccd6')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
}

function paperGrain(ctx, width, height) {
  const grain = document.createElement('canvas')
  grain.width = 128
  grain.height = 128
  const gctx = grain.getContext('2d')
  const img = gctx.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 226 + Math.random() * 29
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 26
  }
  gctx.putImageData(img, 0, 0)
  const pattern = ctx.createPattern(grain, 'repeat')
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, width, height)
}

/**
 * @param {{name: string, tone: 'know'|'learn'}[]} pool
 * @returns {{ texture: THREE.CanvasTexture, blurred: THREE.CanvasTexture, cells: number }}
 */
export function buildReelTexture(pool) {
  const cells = cellsAround(pool.length)
  const radius = reelRadius(cells)
  const faceWidth = REEL_FACE
  // Total width is set by the drum's proportions, so cells stay square-ish on screen
  // whatever the pool size: circumference / faceWidth * resolution.
  const totalPx = Math.round(((2 * Math.PI * radius) / faceWidth) * FACE_PX)
  const cellPx = totalPx / cells

  const canvas = document.createElement('canvas')
  canvas.width = totalPx
  canvas.height = FACE_PX
  const ctx = canvas.getContext('2d')

  for (let k = 0; k < cells; k++) {
    const x = k * cellPx
    paperBackdrop(ctx, x, 0, cellPx, FACE_PX)
  }
  paperGrain(ctx, totalPx, FACE_PX)

  // Seam lines between cells (they run around the drum, so they read as horizontal).
  ctx.strokeStyle = 'rgba(30,36,56,0.16)'
  ctx.lineWidth = Math.max(2, cellPx * 0.012)
  for (let k = 0; k < cells; k++) {
    const x = k * cellPx
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, FACE_PX)
    ctx.stroke()
  }

  const fontPx = Math.round(cellPx * 0.82)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  for (let k = 0; k < cells; k++) {
    const chord = pool[poolIndexForCell(k, pool.length)]
    const label = chord.name
    // Long names (Cmaj7) have to shrink to stay inside their cell.
    const size = label.length > 2 ? Math.round(fontPx * (2 / label.length) ** 0.55) : fontPx

    ctx.save()
    ctx.translate(k * cellPx + cellPx / 2, FACE_PX / 2)
    ctx.rotate(Math.PI / 2)
    ctx.font = `900 ${size}px Archivo, system-ui, sans-serif`
    ctx.strokeStyle = chord.tone === 'learn' ? LEARN : KNOW
    ctx.lineWidth = Math.max(3, size * 0.055)
    ctx.strokeText(label, 0, 0)
    ctx.fillStyle = '#16192a'
    ctx.fillText(label, 0, 0)
    ctx.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  return { texture, blurred: blurAcross(canvas, cells), cells }
}

/**
 * A copy smeared along the spin direction, crossfaded in while the drum is moving.
 * Smearing here costs one texture; a real motion-blur pass costs a velocity buffer
 * and a full-screen shader every frame.
 */
function blurAcross(source, cells) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  const steps = 9
  // About a third of a cell: enough to read as speed, little enough that the
  // shapes of the chords still flicker past instead of turning to grey mush.
  const spread = source.width / cells / 3
  ctx.globalAlpha = 1 / steps
  for (let i = 0; i < steps; i++) {
    const offset = ((i / (steps - 1)) * 2 - 1) * spread
    // Wrap the smear so the seam between the last and first cell stays continuous.
    ctx.drawImage(source, offset, 0)
    ctx.drawImage(source, offset - source.width, 0)
    ctx.drawImage(source, offset + source.width, 0)
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** The plate under the reels: engraved, backlit metal. */
export function buildMarqueeTexture(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#14161d'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 52px Archivo, system-ui, sans-serif'
  // Offset dark copy first: the letters read as cut into the metal, lit from behind.
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3)
  ctx.fillStyle = '#dfe6ff'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** The neon sign, drawn as a bright core inside a soft halo — how neon actually reads. */
export function buildNeonTexture(text = 'Chord Roller') {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const cx = canvas.width / 2
  const cy = canvas.height / 2 + 6
  const font = '400 128px Pacifico, cursive'
  ctx.font = font
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Outer halo, then the tube wall, then the hot core.
  ctx.shadowColor = '#ff2d4f'
  ctx.shadowBlur = 46
  ctx.strokeStyle = '#ff2d4f'
  ctx.lineWidth = 16
  ctx.strokeText(text, cx, cy)
  ctx.strokeText(text, cx, cy)

  ctx.shadowBlur = 18
  ctx.strokeStyle = '#ff6b7f'
  ctx.lineWidth = 9
  ctx.strokeText(text, cx, cy)

  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff0f2'
  ctx.lineWidth = 3.5
  ctx.strokeText(text, cx, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
