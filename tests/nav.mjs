import { IPAD_LANDSCAPE, IPAD_PORTRAIT, iPadContext, launch, waitFor3d } from './browser.mjs'

/**
 * Where the tab bar actually sits.
 *
 * Added on a real complaint: added to the iPad Home Screen as a standalone web app,
 * the bar floated well above the bottom of the screen with a dead band under it.
 * The cause was arithmetic rather than art — the bar reserved the whole
 * `env(safe-area-inset-bottom)` below its contents, on top of its own centring
 * slack, so the labels sat `--nav-h / 2 + inset` up. On a phone that is the normal
 * iOS tab bar; with the larger inset a standalone iPad reports it is a gap.
 *
 * A headless browser reports a zero inset, so the cap cannot be exercised by
 * `env()` alone. The last case overrides `--nav-safe` with a large value to stand in
 * for a device that reports one, and checks that the bar's contents move by the cap
 * rather than by the whole of it — which is the part that was broken.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}

/** The bar's bottom edge, and how far its labels sit above the bottom of the screen. */
const readNav = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('.nav')
    const button = nav.querySelector('button')
    const bar = nav.getBoundingClientRect()
    const btn = button.getBoundingClientRect()
    return {
      viewport: window.innerHeight,
      barBottom: bar.bottom,
      barHeight: bar.height,
      labelUp: window.innerHeight - (btn.top + btn.height / 2),
      navSafe: getComputedStyle(nav).paddingBottom,
    }
  })

const browser = await launch()

for (const [label, viewport] of [
  ['landscape', IPAD_LANDSCAPE],
  ['portrait', IPAD_PORTRAIT],
]) {
  const ctx = await iPadContext(browser, viewport)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await waitFor3d(page)
  await wait(1500)

  console.log(`\n${label}`)
  const nav = await readNav(page)

  // The bar is the last flex child of a fixed, full-height app: its background has
  // to run all the way to the bottom edge, however tall it is.
  check(
    'the bar reaches the bottom of the screen',
    Math.abs(nav.barBottom - nav.viewport) < 1,
    `${nav.barBottom.toFixed(1)} of ${nav.viewport}`
  )

  // The number the complaint was about. A native iOS tab bar puts its labels about
  // 45px up; 50 leaves room for the capped inset without letting the gap creep back.
  check(
    'and its labels sit near it',
    nav.labelUp <= 50,
    `${nav.labelUp.toFixed(1)}px up`
  )

  // Stand in for a device that reports a large inset.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--nav-safe', 'min(60px, 14px)')
  })
  await wait(200)
  const capped = await readNav(page)

  check(
    'a device reporting a 60px inset only spends the 14px cap',
    Math.abs(capped.labelUp - nav.labelUp - 14) < 1 && capped.labelUp <= 50,
    `${capped.labelUp.toFixed(1)}px up, padding ${capped.navSafe}`
  )

  // And prove the override reaches the rule at all, so the case above is not passing
  // because nothing was applied.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--nav-safe', '60px')
  })
  await wait(200)
  const uncapped = await readNav(page)
  check(
    'without the cap the same inset spends all 60 of it',
    Math.abs(uncapped.labelUp - nav.labelUp - 60) < 1 && uncapped.labelUp > 50,
    `${uncapped.labelUp.toFixed(1)}px up, padding ${uncapped.navSafe}`
  )
  check(
    'and the bar still reaches the bottom',
    Math.abs(uncapped.barBottom - uncapped.viewport) < 1,
    `${uncapped.barBottom.toFixed(1)} of ${uncapped.viewport}`
  )

  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
