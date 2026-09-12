import { IPAD_LANDSCAPE, iPadContext, launch, waitFor3d } from './browser.mjs'

/**
 * Where the main thread goes.
 *
 * Long tasks are what a person feels as the app stuttering, so this records them
 * through startup and then through a drag — the one gesture that runs code on every
 * pointer event. Numbers only; what to do about them is a separate decision.
 *
 *   node tests/profile.mjs [label]
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const label = process.argv[2] || 'now'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await launch()
const ctx = await iPadContext(browser, IPAD_LANDSCAPE)

// Watch from the very first byte: the long tasks that matter most are at startup.
await ctx.addInitScript(() => {
  window.__long = []
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__long.push({ start: Math.round(entry.startTime), ms: Math.round(entry.duration) })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* no longtask support; the frame-time half still works */
  }
})

const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await waitFor3d(page)
await wait(6000)

const startup = await page.evaluate(() => {
  const tasks = window.__long.slice()
  const total = tasks.reduce((n, t) => n + t.ms, 0)
  const worst = tasks.slice().sort((a, b) => b.ms - a.ms).slice(0, 5)
  const nav = performance.getEntriesByType('navigation')[0]
  return {
    tasks: tasks.length,
    blockedMs: total,
    worst,
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
  }
})

// A drag across the screen: a pointermove every frame, and whatever each one costs.
await page.evaluate(() => {
  window.__long = []
  window.__frames = []
  let last = performance.now()
  const tick = (now) => {
    window.__frames.push(now - last)
    last = now
    window.__raf = requestAnimationFrame(tick)
  }
  window.__raf = requestAnimationFrame(tick)
})
await page.evaluate(async () => {
  const el = document.querySelector('.char')
  const r = el.getBoundingClientRect()
  const base = { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: 1 }
  let x = r.left + r.width / 2
  let y = r.top + r.height / 2
  el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y }))
  for (let i = 0; i < 40; i++) {
    x += 12
    y -= 6
    el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }))
    await new Promise((r2) => setTimeout(r2, 16))
  }
  el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x, clientY: y }))
})
await wait(3000)

const drag = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  const f = window.__frames.slice(3).sort((a, b) => a - b)
  const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))] ?? 0
  const tasks = window.__long.slice()
  return {
    frames: f.length,
    median: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    longTasks: tasks.length,
    blockedMs: tasks.reduce((n, t) => n + t.ms, 0),
  }
})

console.log(`[${label}] startup: ${startup.tasks} long tasks, ${startup.blockedMs}ms blocked`)
console.log(`[${label}] worst:  ${startup.worst.map((t) => `${t.ms}ms@${t.start}`).join(', ')}`)
console.log(`[${label}] drag:    median ${drag.median}ms  p95 ${drag.p95}ms  ${drag.longTasks} long tasks (${drag.blockedMs}ms)`)
await browser.close()
