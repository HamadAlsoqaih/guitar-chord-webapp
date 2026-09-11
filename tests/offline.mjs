import { iPadContext, launch, waitFor3d } from './browser.mjs'

/**
 * The cache: does the app open a second time without a network?
 *
 * The worker is registered after the first load finishes, so nothing that first
 * visit downloaded went through it — the page reports what it used afterwards and
 * the worker stores that. This checks the whole of that arrangement by cutting the
 * network and reloading, which is the only way to be sure it is the cache answering
 * and not a warm HTTP cache.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}

const browser = await launch()
const ctx = await iPadContext(browser)
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await waitFor3d(page)
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => {})
await wait(3500)

const first = await page.evaluate(async () => {
  const names = await caches.keys()
  const cache = names.length ? await caches.open(names[0]) : null
  const keys = cache ? await cache.keys() : []
  return {
    controlled: !!navigator.serviceWorker.controller,
    caches: names,
    urls: keys.map((r) => r.url),
  }
})
check('a worker is in charge after the first visit', first.controlled)
check('the page itself is cached', first.urls.some((u) => u.endsWith('/guitar-chord-webapp/')))
check('so are the bundles', first.urls.filter((u) => u.includes('/assets/') && u.endsWith('.js')).length >= 3,
  `${first.urls.filter((u) => u.includes('/assets/') && u.endsWith('.js')).length} scripts`)

await ctx.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => {
  check('the second visit loads with no network', false, e.message.split('\n')[0])
})
await wait(6000)
const offline = await page.evaluate(() => ({
  title: document.querySelector('.header h1')?.textContent ?? null,
  canvas: document.querySelectorAll('.machine-slot canvas').length,
  ready: window.__chordRoller?.state?.().ready3d ?? null,
}))
check('the app opens with no network', offline.title === 'Chord Machine', offline.title ?? 'no page')
check('and the 3D machine comes up', offline.canvas === 1 && offline.ready === true)

await ctx.setOffline(false)
await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
