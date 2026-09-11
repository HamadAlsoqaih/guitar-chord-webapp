import { IPAD_LANDSCAPE, iPadContext, launch, touchDrag } from './browser.mjs'

/**
 * Frame-time probe.
 *
 * NOTE: this runs on SwiftShader (CPU rasterisation), not a GPU. Absolute numbers
 * mean nothing for an iPad — CPU rasterising is dominated by fill rate in a way a
 * GPU is not. What IS meaningful is the *ratio* between configurations, since they
 * differ only in how many pixels get shaded.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function measure(browser, query, label) {
  const ctx = await iPadContext(browser, IPAD_LANDSCAPE)
  const page = await ctx.newPage()
  await page.goto(BASE + query, { waitUntil: 'networkidle' })
  await wait(6000)

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

  // Measure under load: a spin running with the metronome going.
  await page.click('.bpm-btn').catch(() => {})
  await touchDrag(page, '.machine-slot', { dy: 100, steps: 14 })
  await wait(5000)

  const stats = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const f = window.__frames.slice(5).sort((a, b) => a - b)
    const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))]
    const info = window.__r3fInfo || null
    return { count: f.length, median: at(0.5), p95: at(0.95), info }
  })

  console.log(
    `${label.padEnd(22)} median ${stats.median.toFixed(1).padStart(6)}ms  ` +
      `p95 ${stats.p95.toFixed(1).padStart(6)}ms  frames ${stats.count}` +
      (stats.info ? `  calls ${stats.info.calls} tris ${stats.info.triangles}` : '')
  )
  await ctx.close()
  return stats
}

const browser = await launch()
await measure(browser, '?glass=low', 'simple glass')
await measure(browser, '?gres=256', 'transmission 256')
await measure(browser, '?gres=1024', 'transmission 1024')
await measure(browser, '?gres=2048', 'transmission 2048')
await browser.close()
