import { compositedShot, iPadContext, launch } from './browser.mjs'

/** Load the app, wait for the 3D machine, and save a screenshot. */
const url = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const out = process.argv[2] || 'tests/out/10-3d.png'
const settle = Number(process.env.SETTLE || 7000)

const browser = await launch()
const ctx = await iPadContext(browser)
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() !== 'log') console.log('CONSOLE', m.type(), m.text().slice(0, 240))
})
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)))

await page.goto(url, { waitUntil: 'networkidle' })
await new Promise((r) => setTimeout(r, settle))

console.log(
  'canvas:',
  (await page.$$('canvas.machine-canvas')).length,
  '| fallback reels:',
  (await page.$$('.fb-reel')).length
)
if (!(await compositedShot(ctx, page, out))) await page.screenshot({ path: out })
console.log('wrote', out)
await browser.close()
