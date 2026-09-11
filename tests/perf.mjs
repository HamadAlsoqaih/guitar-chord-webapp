import { IPAD_LANDSCAPE, iPadContext, launch, touchDrag } from './browser.mjs'

/**
 * Frame-time probe.
 *
 * NOTE: this runs on SwiftShader (CPU rasterisation), not a GPU. Absolute numbers
 * mean nothing for an iPad — CPU rasterising is dominated by fill rate in a way a
 * GPU is not. What IS meaningful is the *ratio* between configurations, since they
 * differ only in how many pixels get shaded, which is exactly what the quality
 * tiers change.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function sample(page, label, extra = '') {
  const before = await page.evaluate(() => window.__r3fInfo?.frames ?? 0)
  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(now - last)
      last = now
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  })
  await wait(3500)
  const stats = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const f = window.__frames.slice(5).sort((a, b) => a - b)
    const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))] ?? 0
    return { median: at(0.5), p95: at(0.95), frames: f.length, info: window.__r3fInfo || null }
  })
  const drawn = ((stats.info?.frames ?? 0) - before) / 3.5
  console.log(
    `${label.padEnd(26)} median ${stats.median.toFixed(1).padStart(6)}ms  p95 ${stats.p95
      .toFixed(1)
      .padStart(6)}ms  drawn/s ${drawn.toFixed(1).padStart(5)}  ` +
      (stats.info ? `calls ${stats.info.calls} tris ${stats.info.triangles}` : '') +
      extra
  )
  return stats
}

async function measure(browser, quality) {
  const ctx = await iPadContext(browser, IPAD_LANDSCAPE)
  const page = await ctx.newPage()
  await page.goto(`${BASE}?quality=${quality}`, { waitUntil: 'networkidle' })
  await wait(6000)

  await sample(page, `${quality}: idle`)
  // Under load: a roll with the metronome running.
  await page.click('.bpm-btn').catch(() => {})
  await touchDrag(page, '.machine-slot', { dy: 100, steps: 14 })
  await sample(page, `${quality}: rolling`)
  await ctx.close()
}

const browser = await launch()
for (const q of ['high', 'medium', 'low']) await measure(browser, q)
await browser.close()
