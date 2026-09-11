import { mkdir } from 'node:fs/promises'
import {
  IPAD_LANDSCAPE,
  IPAD_PORTRAIT,
  iPadContext,
  launch,
  touchDrag,
  touchTap,
  watchConsole,
} from './browser.mjs'

const BASE = process.env.APP_URL || 'http://localhost:5173'
const OUT = 'tests/out'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const failures = []
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name} ${detail}`)
    failures.push(`${name} ${detail}`)
  }
}

const reelText = (page) =>
  page.$$eval('.fb-main, [data-reel-value]', (els) => els.map((e) => e.textContent.trim()))

async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await launch()
  const ctx = await iPadContext(browser, IPAD_LANDSCAPE)
  const page = await ctx.newPage()
  const noise = []
  watchConsole(page, noise)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await wait(700)

  console.log('\nPractice page')
  check('header title', (await page.textContent('.header h1')) === 'Chord Machine')
  check('subtitle locked', (await page.textContent('.header p')) === 'Pull the lever to roll')
  check('3 reels by default', (await page.$$('.fb-reel')).length === 3)
  check(
    'marquee counts',
    (await page.textContent('.fb-marquee')).includes('3 REELS · 6 CHORDS'),
    await page.textContent('.fb-marquee')
  )
  check('bpm shows 80', (await page.textContent('.bpm-num')) === '80')
  await page.screenshot({ path: `${OUT}/01-practice.png` })

  console.log('\nLever')
  const before = await reelText(page)
  await touchDrag(page, '.fb-lever', { dy: 95, steps: 14 })
  await wait(300)
  check('reels spinning after pull', (await page.$$('[data-spin="true"]')).length > 0)
  await wait(3200)
  const after = await reelText(page)
  check('reels settled', (await page.$$('[data-spin="true"]')).length === 0)
  check('result changed or re-rolled', after.length === before.length)
  await page.screenshot({ path: `${OUT}/02-after-spin.png` })

  console.log('\nShort pull does not spin')
  await touchDrag(page, '.fb-lever', { dy: 30, steps: 8 })
  await wait(250)
  check('no spin below threshold', (await page.$$('[data-spin="true"]')).length === 0)

  console.log('\nTap to pull')
  await touchTap(page, '.fb-lever')
  await wait(500)
  check('tap triggered a spin', (await page.$$('[data-spin="true"]')).length > 0)
  await wait(3200)

  console.log('\nManual mode')
  await page.click('.header-actions .icon-btn:first-child')
  check('subtitle unlocked', (await page.textContent('.header p')) === 'Scroll a reel or pull the lever')
  const manualBefore = (await reelText(page))[0]
  await touchDrag(page, '.fb-reel:first-child', { dy: -90, steps: 10 })
  await wait(200)
  const manualAfter = (await reelText(page))[0]
  check('drag stepped the reel', manualBefore !== manualAfter, `${manualBefore} -> ${manualAfter}`)
  await page.click('.header-actions .icon-btn:first-child')

  console.log('\nMetronome')
  await page.click('.bpm-btn')
  await wait(1600)
  check('a beat cell is highlighted', (await page.$$('.cell-box[data-active="true"]')).length === 1)
  await page.click('.bpm-btn')
  await wait(200)
  check('highlight clears on stop', (await page.$$('.cell-box[data-active="true"]')).length === 0)

  console.log('\nStrum card')
  await page.click('.chip')
  await wait(150)
  await page.click('.strum-title')
  await wait(250)
  check('pattern picker opens', (await page.$$('.sheet')).length === 1)
  await page.click('.sheet-close')
  await wait(200)

  console.log('\nSettings')
  await page.click('.nav button:nth-child(2)')
  await wait(300)
  check('settings title', (await page.textContent('.header h1')) === 'Settings')
  check('known subtitle', (await page.textContent('.group:nth-of-type(2) .row:first-child .row-sub')) === '5 of 8 in the machine')
  await page.screenshot({ path: `${OUT}/03-settings.png` })

  // Reel count: step up to 6 and back down to 2, then confirm the machine follows.
  const plus = '.group:first-of-type .row:nth-child(2) .step-btn:last-child'
  const minus = '.group:first-of-type .row:nth-child(2) .step-btn:first-child'
  for (let i = 0; i < 3; i++) await page.click(plus)
  await page.click('.nav button:first-child')
  await wait(400)
  check('6 reels rendered', (await page.$$('.fb-reel')).length === 6)
  await page.screenshot({ path: `${OUT}/04-six-reels.png` })
  await touchDrag(page, '.fb-lever', { dy: 95, steps: 14 })
  await wait(4200)
  check('6-reel spin settles', (await page.$$('[data-spin="true"]')).length === 0)

  await page.click('.nav button:nth-child(2)')
  await wait(250)
  for (let i = 0; i < 4; i++) await page.click(minus)
  await page.click('.nav button:first-child')
  await wait(400)
  check('2 reels rendered', (await page.$$('.fb-reel')).length === 2)
  await touchDrag(page, '.fb-lever', { dy: 95, steps: 14 })
  await wait(2400)
  check('2-reel spin settles', (await page.$$('[data-spin="true"]')).length === 0)

  console.log('\nChord list editing')
  await page.click('.nav button:nth-child(2)')
  await wait(250)
  await page.click('.group:nth-of-type(2) .row:first-child')
  await wait(250)
  await page.fill('.field', 'Fmaj7')
  await page.click('.add-row .btn')
  await wait(200)
  check('chord added', (await page.textContent('.sheet-body')).includes('Fmaj7'))
  const items = await page.$$('.sheet-body .list-item')
  await items[items.length - 1].$eval('.icon-x', (el) => el.click())
  await wait(200)
  check('chord removed', !(await page.textContent('.sheet-body')).includes('Fmaj7'))
  await page.click('.sheet-close')

  console.log('\nCoco')
  await wait(300)
  const cocoBox = await page.$eval('.char', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  await touchDrag(page, '.char', { dx: -240, dy: -170, steps: 14, hold: 120 })
  await wait(1400)
  const cocoAfter = await page.$eval('.char', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  check('coco moved horizontally', Math.abs(cocoAfter.x - cocoBox.x) > 100, `${cocoBox.x} -> ${cocoAfter.x}`)
  check('coco fell back to the floor', Math.abs(cocoAfter.y - cocoBox.y) < 6, `${cocoBox.y} -> ${cocoAfter.y}`)
  await page.screenshot({ path: `${OUT}/05-coco.png` })

  console.log('\nPersistence')
  await page.reload({ waitUntil: 'networkidle' })
  await wait(700)
  check('reel count persisted', (await page.$$('.fb-reel')).length === 2)

  console.log('\nPortrait')
  const pctx = await iPadContext(browser, IPAD_PORTRAIT)
  const ppage = await pctx.newPage()
  watchConsole(ppage, noise)
  await ppage.goto(BASE, { waitUntil: 'networkidle' })
  await wait(800)
  check('portrait renders the machine', (await ppage.$$('.fb-reel')).length >= 2)
  const overflow = await ppage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('no horizontal overflow in portrait', overflow <= 1, `overflow ${overflow}`)
  await ppage.screenshot({ path: `${OUT}/06-portrait.png` })

  console.log('\nConsole')
  const real = noise.filter((n) => !/favicon|Download the React DevTools/i.test(n))
  check('no console errors or warnings', real.length === 0, real.slice(0, 4).join(' | '))

  await browser.close()

  console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}`)
  if (failures.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
