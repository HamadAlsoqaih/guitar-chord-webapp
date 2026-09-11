/**
 * The balloon artwork is outline-only: a black line drawing on a fully transparent
 * background (measured: 4.8% of pixels carry any ink at all, 89% of that ink is
 * near-black). In the original design it always sat over the dark machine cabinet,
 * so the empty interior read as part of the art. On this page it floats over a light
 * background and the thin outline all but disappears — and any text inside it lands
 * on whatever happens to be behind.
 *
 * So the interior gets filled before the image is ever shown. The fill is derived
 * from the artwork itself rather than drawn by hand: flooding inwards from the edge
 * of the canvas marks everything *outside* the balloon, and whatever the flood never
 * reaches is interior — the cloud body and each of the tail circles, exactly as
 * drawn, including the notches between the lobes.
 *
 * The fill is painted first and the original drawn on top, so the outline keeps its
 * own anti-aliasing and the seam between fill and line never shows.
 *
 * The result is handed back as a canvas rather than an image URL, and the balloon is
 * drawn into a canvas on the page. An <img> loses this fight: next to a WebGL scene
 * Chromium discards the decoded bitmap after a few seconds, and the balloon — text
 * and all — silently stops painting while every computed style still reads visible.
 * A canvas owns its pixels, so there is nothing to discard and nothing to re-decode.
 */
const cache = new Map()

/** Alpha above which a pixel counts as line, and so blocks the flood. */
const INK_ALPHA = 80
/** How far the fill is grown under the outline, in pixels. */
const BLEED = 2

export function filledBubble(src) {
  const hit = cache.get(src)
  if (hit) return hit
  const job = build(src).catch(() => null)
  cache.set(src, job)
  return job
}

function load(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function build(src) {
  const img = await load(src)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const alpha = ctx.getImageData(0, 0, w, h).data

  // 0 = interior (fill it), 1 = line, 2 = outside.
  const map = new Uint8Array(w * h)
  for (let i = 0; i < map.length; i++) if (alpha[i * 4 + 3] > INK_ALPHA) map[i] = 1

  // Flood from the border. An explicit stack rather than recursion: at this size a
  // recursive fill blows the call stack on the first long run.
  const stack = []
  for (let x = 0; x < w; x++) {
    stack.push(x, (h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + w - 1)
  }
  while (stack.length) {
    const i = stack.pop()
    if (map[i] !== 0) continue
    map[i] = 2
    const x = i % w
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (i >= w) stack.push(i - w)
    if (i < map.length - w) stack.push(i + w)
  }

  // Grow the fill outwards under the line, so no light seam survives between the
  // painted interior and the anti-aliased edge of the drawing.
  let region = new Uint8Array(map.length)
  for (let i = 0; i < map.length; i++) region[i] = map[i] === 2 ? 0 : 1
  for (let pass = 0; pass < BLEED; pass++) region = grow(region, w, h)

  const fill = ctx.createImageData(w, h)
  const out = fill.data
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue
    const p = i * 4
    out[p] = 255
    out[p + 1] = 255
    out[p + 2] = 255
    out[p + 3] = 255
  }

  ctx.clearRect(0, 0, w, h)
  ctx.putImageData(fill, 0, 0)
  ctx.drawImage(img, 0, 0)
  return canvas
}

/** Draw the finished balloon into `target` at `box` CSS pixels. */
export function paintBubble(target, art, box) {
  if (!target || !art || !box) return false
  // Two device pixels per CSS pixel is the point where the outline stops showing
  // stair steps; beyond that it is memory for nothing.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const px = Math.round(box * dpr)
  if (target.width !== px || target.height !== px) {
    target.width = px
    target.height = px
  }
  const ctx = target.getContext('2d')
  ctx.clearRect(0, 0, px, px)
  ctx.drawImage(art, 0, 0, px, px)
  return true
}

function grow(region, w, h) {
  const next = new Uint8Array(region.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (region[i]) {
        next[i] = 1
        continue
      }
      if (
        (x > 0 && region[i - 1]) ||
        (x < w - 1 && region[i + 1]) ||
        (y > 0 && region[i - w]) ||
        (y < h - 1 && region[i + w])
      ) {
        next[i] = 1
      }
    }
  }
  return next
}
