/**
 * The Coco clip is filmed on a black background. These helpers lift him off it at
 * runtime so he can stand anywhere on the page without a black box around him.
 *
 * Two passes:
 *   1. findCrop  — locate the non-black bounding box once, so he fills his canvas.
 *   2. matte     — flood-fill the dark background inward from the canvas border and
 *                  punch it to transparent, then erase the bright halo left on the
 *                  new edge. Flood-filling from the border (rather than keying every
 *                  dark pixel) keeps dark pixels *inside* him — hair, outlines — opaque.
 */

const LUMA_FLOOR = 34
const DARK_CEILING = 62
const FRINGE_FLOOR = 150

/** Bounding box of the visible subject inside the video frame. */
export function findCrop(video) {
  const w = 160
  const h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const ctx = off.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)

  let data
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return null // tainted canvas — fall back to the full frame
  }

  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > LUMA_FLOOR) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0 || x1 - x0 < 4 || y1 - y0 < 4) return null

  const padX = (x1 - x0) * 0.06
  const padY = (y1 - y0) * 0.04
  const kx = video.videoWidth / w
  const ky = video.videoHeight / h
  const sx = Math.max(0, (x0 - padX) * kx)
  const sy = Math.max(0, (y0 - padY) * ky)
  return {
    sx,
    sy,
    sw: Math.min(video.videoWidth - sx, (x1 - x0 + 1 + padX * 2) * kx),
    sh: Math.min(video.videoHeight - sy, (y1 - y0 + 1 + padY * 2) * ky),
  }
}

/** Scratch buffers, reallocated only when the canvas size changes. */
const scratch = { mask: null, stack: null, size: 0 }

export function matte(ctx, width, height) {
  let image
  try {
    image = ctx.getImageData(0, 0, width, height)
  } catch {
    return
  }
  const d = image.data
  const n = width * height

  if (scratch.size !== n) {
    scratch.mask = new Uint8Array(n)
    scratch.stack = new Int32Array(n)
    scratch.size = n
  }
  const mask = scratch.mask
  const stack = scratch.stack
  mask.fill(0)

  let sp = 0
  const isDark = (k) => {
    const i = k * 4
    return Math.max(d[i], d[i + 1], d[i + 2]) <= DARK_CEILING
  }
  const seed = (k) => {
    if (!mask[k] && isDark(k)) {
      mask[k] = 1
      stack[sp++] = k
    }
  }

  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }

  while (sp > 0) {
    const k = stack[--sp]
    const x = k % width
    const y = (k / width) | 0
    if (x > 0) seed(k - 1)
    if (x < width - 1) seed(k + 1)
    if (y > 0) seed(k - width)
    if (y < height - 1) seed(k + width)
  }

  for (let k = 0; k < n; k++) d[k * 4 + 3] = mask[k] ? 0 : 255

  // Bright pixels that survived right on the new edge read as a white halo.
  const fringe = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x
      const i = k * 4
      if (!d[i + 3]) continue
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 < FRINGE_FLOOR) continue
      const edge =
        (x > 0 && !d[i - 4 + 3]) ||
        (x < width - 1 && !d[i + 4 + 3]) ||
        (y > 0 && !d[i - width * 4 + 3]) ||
        (y < height - 1 && !d[i + width * 4 + 3])
      if (edge) fringe.push(i)
    }
  }
  for (let j = 0; j < fringe.length; j++) d[fringe[j] + 3] = 0

  ctx.putImageData(image, 0, 0)
}
