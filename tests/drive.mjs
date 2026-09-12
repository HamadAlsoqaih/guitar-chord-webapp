import { mkdir } from 'node:fs/promises'
import {
  IPAD_LANDSCAPE,
  IPAD_PORTRAIT,
  dragLever,
  dragReel,
  iPadContext,
  launch,
  machineState,
  touchDrag,
  touchTap,
  waitFor3d,
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

const chords = async (page) => (await machineState(page)).chords
const spinning = async (page) => (await machineState(page)).spinning

/**
 * How far the machine came to leaving the canvas, in pixels, over `samples` reads.
 * Negative is clearance; positive means part of it was cropped.
 */
async function worstOverflow(page, samples = 8, gap = 300) {
  let worst = { side: 'none', over: -Infinity }
  for (let i = 0; i < samples; i++) {
    const frame = await page.evaluate(() => {
      const f = window.__chordRollerFrame?.()
      if (!f) return null
      return {
        top: f.canvas.top - f.machine.top,
        bottom: f.machine.bottom - f.canvas.bottom,
        left: f.canvas.left - f.machine.left,
        right: f.machine.right - f.canvas.right,
      }
    })
    if (frame) {
      for (const [side, over] of Object.entries(frame)) {
        if (over > worst.over) worst = { side, over }
      }
    }
    await new Promise((r) => setTimeout(r, gap))
  }
  return worst
}


async function run() {
  await mkdir(OUT, { recursive: true })
  const browser = await launch()
  const ctx = await iPadContext(browser, IPAD_LANDSCAPE)
  const page = await ctx.newPage()
  const noise = []
  watchConsole(page, noise)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await waitFor3d(page)
  await wait(500)

  console.log('\nPractice page')
  check('header title', (await page.textContent('.header h1')) === 'Chord Roller')
  check('subtitle locked', (await page.textContent('.header p')) === 'Pull the lever to roll')
  check('WebGL machine took over', (await page.$$('.machine-slot canvas')).length === 1)
  check('DOM fallback removed', (await page.$$('.fb-reel')).length === 0)
  const initial = await machineState(page)
  check('3 reels by default', initial.reelCount === 3)
  check('pool has 6 chords', initial.pool.length === 6, initial.pool.join(','))
  check('bpm shows 80', (await page.textContent('.bpm-num')) === '80')
  await page.screenshot({ path: `${OUT}/01-practice.png` })

  console.log('\nLever')
  await dragLever(page, { dy: 110 })
  await wait(400)
  check('reels spinning after pull', await spinning(page))
  // The pull dollies the camera in, which magnifies everything in frame. Watch the
  // whole push and make sure the machine never grows past the canvas.
  const framing = await worstOverflow(page, 10, 300)
  check(
    'machine stays in frame through the push',
    framing.over < 0,
    `${framing.side} ${framing.over.toFixed(1)}px`
  )
  await wait(1400)
  check('reels settled', !(await spinning(page)))
  check('three results on the payline', (await chords(page)).length === 3)
  await page.screenshot({ path: `${OUT}/02-after-spin.png` })

  console.log('\nShort pull does not spin')
  const held = await chords(page)
  await dragLever(page, { dy: 40, steps: 8 })
  await wait(400)
  check('no spin below threshold', !(await spinning(page)))
  check('reels unchanged', (await chords(page)).join() === held.join())

  console.log('\nTap to pull')
  await dragLever(page, { tap: true })
  /*
   * Wait for the spin rather than assuming a latency. The tap plays the whole pull
   * for the user — about half a second of animation before the reels are released —
   * and this runs on a software rasteriser at a few frames a second, so the moment
   * it lands moves around. What is being checked is that a tap rolls at all.
   */
  const tapSpun = await page
    .waitForFunction(() => window.__chordRoller.state().spinning, null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false)
  check('tap triggered a spin', tapSpun)
  await wait(3400)

  console.log('\nManual mode')
  await page.click('.header-actions .icon-btn:first-child')
  check('subtitle unlocked', (await page.textContent('.header p')) === 'Scroll a reel or pull the lever')
  const manualBefore = (await chords(page))[0]
  await dragReel(page, 0, { dy: -130 })
  await wait(400)
  const manualAfter = (await chords(page))[0]
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
  await wait(900)
  check('6 reels rendered', (await machineState(page)).reelCount === 6)
  await page.screenshot({ path: `${OUT}/04-six-reels.png` })
  await dragLever(page, { dy: 110 })
  await wait(5200)
  check('6-reel spin settles', !(await spinning(page)))
  check('six results on the payline', (await chords(page)).length === 6)

  await page.click('.nav button:nth-child(2)')
  await wait(250)
  for (let i = 0; i < 4; i++) await page.click(minus)
  await page.click('.nav button:first-child')
  await wait(900)
  check('2 reels rendered', (await machineState(page)).reelCount === 2)
  await dragLever(page, { dy: 110 })
  await wait(2800)
  check('2-reel spin settles', !(await spinning(page)))

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

  console.log('\nMulti-touch')
  // The previous section left us on Settings, where the machine is unmounted.
  await page.click('.nav button:first-child')
  await waitFor3d(page)
  await wait(400)
  await page.click('.header-actions .icon-btn:first-child')
  const twoBefore = await chords(page)
  // Two fingers scrubbing two drums at once must move both, independently.
  await Promise.all([dragReel(page, 0, { dy: -130 }), dragReel(page, 1, { dy: 130 })])
  await wait(500)
  const twoAfter = await chords(page)
  check('two reels scrub at once', twoBefore[0] !== twoAfter[0] && twoBefore[1] !== twoAfter[1],
    `${twoBefore.join()} -> ${twoAfter.join()}`)
  await page.click('.header-actions .icon-btn:first-child')

  // A stray second finger during a pull must not hijack or cancel the lever.
  const strayBefore = await chords(page)
  await Promise.all([
    dragLever(page, { dy: 110 }),
    (async () => {
      await wait(60)
      await dragReel(page, 1, { dy: 90 })
    })(),
  ])
  await wait(400)
  check('lever survives a stray second finger', await spinning(page))
  await wait(3400)
  check('spin completed', !(await spinning(page)) && (await chords(page)).length === strayBefore.length)

  console.log('\nCoco on the lever')
  const leverSpot = await page.evaluate(() => {
    const r = window.__chordRollerLever.rect()
    return r ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : null
  })
  check('lever reports a screen position', !!leverSpot)
  if (leverSpot) {
    await page.evaluate(
      async ({ x, y }) => {
        const el = document.querySelector('.char')
        const r = el.getBoundingClientRect()
        const base = { pointerId: 40, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: 1 }
        const wait2 = (ms) => new Promise((res) => setTimeout(res, ms))
        const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: from.x, clientY: from.y }))
        for (let i = 1; i <= 12; i++) {
          const cx = from.x + ((x - from.x) * i) / 12
          const cy = from.y + ((y - from.y) * i) / 12
          el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: cx, clientY: cy }))
          await wait2(14)
        }
        el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x, clientY: y }))
      },
      leverSpot
    )
    await wait(700)
    check('dropping Coco on the lever pulls it', await spinning(page))
    await wait(3600)
  }

  console.log('\nOrientation change')
  await page.setViewportSize(IPAD_PORTRAIT)
  await wait(1200)
  const rotated = await page.evaluate(() => {
    const nav = document.querySelector('.nav').getBoundingClientRect()
    const slot = document.querySelector('.machine-slot').getBoundingClientRect()
    const coco = document.querySelector('.char').getBoundingClientRect()
    return {
      offCentre: Math.abs(slot.top + slot.height / 2 - nav.top / 2),
      cocoOnScreen: coco.left >= 0 && coco.right <= window.innerWidth && coco.bottom <= nav.top + 2,
    }
  })
  check('machine re-centres after rotating', rotated.offCentre <= 2, `off by ${Math.round(rotated.offCentre)}px`)
  check('Coco re-grounds after rotating', rotated.cocoOnScreen)
  await page.setViewportSize(IPAD_LANDSCAPE)
  await wait(900)

  console.log('\nCharacter size')
  /*
   * Two bugs met here. Writing width or height on a canvas resets its bitmap, so
   * resizing the filmed Coco wiped him off the screen and nothing repainted him —
   * he simply vanished. And since a character is positioned by its top left corner,
   * growing one left its feet through the floor.
   */
  await page.click('.nav button:last-child')
  await wait(300)
  // last-of-type, not last-child: the footer is the last child of the settings list.
  await page.click('.group:last-of-type .row')
  await wait(400)
  // Scoped to the sheet: the settings page behind it has a segmented control too.
  await page.click('.scrim .seg button:first-child') // the filmed Coco
  await wait(700)
  for (let i = 0; i < 6; i++) {
    await page.click('[aria-label="Bigger"]')
    await wait(120)
  }
  await wait(500)
  const resized = await page.evaluate(() => {
    const canvas = document.querySelector('[data-coco-canvas]')
    const char = document.querySelector('.char')
    const nav = document.querySelector('.nav').getBoundingClientRect()
    if (!canvas || !char) return null
    const g = canvas.getContext('2d', { willReadFrequently: true })
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height)
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 32) opaque++
    return {
      inked: opaque / (canvas.width * canvas.height),
      aboveFloor: nav.top - char.getBoundingClientRect().bottom,
      width: canvas.width,
    }
  })
  check('Coco is still drawn after resizing', !!resized && resized.inked > 0.02, `${((resized?.inked ?? 0) * 100).toFixed(1)}% inked`)
  check('and still standing on the floor', !!resized && Math.abs(resized.aboveFloor) < 24, `${Math.round(resized?.aboveFloor ?? -1)}px above`)
  // Put him back the way he was.
  for (let i = 0; i < 6; i++) {
    await page.click('[aria-label="Smaller"]')
    await wait(90)
  }
  await page.click('.scrim .seg button:nth-child(2)')
  await wait(300)
  await page.click('.sheet-close')
  await wait(300)
  await page.click('.nav button:first-child')
  await wait(600)

  console.log('\nTab switching')
  /*
   * Leaving the practice page used to unmount the machine, and with it the WebGL
   * context. A browser only keeps a few alive, so after a handful of visits to
   * settings it starts dropping them — which is how people ended up looking at the
   * DOM machine for the rest of the session. Marking the canvas proves the same one
   * survives, context and all.
   */
  await page.evaluate(() => {
    document.querySelector('.machine-slot canvas').dataset.mark = 'original'
  })
  for (let i = 0; i < 4; i++) {
    await page.click('.nav button:last-child')
    await wait(220)
    await page.click('.nav button:first-child')
    await wait(320)
  }
  const survived = await page.evaluate(() => {
    const canvas = document.querySelector('.machine-slot canvas')
    return {
      same: canvas?.dataset.mark === 'original',
      fallbacks: document.querySelectorAll('.fb-reel').length,
      ready: window.__chordRoller.state().ready3d,
    }
  })
  check('the machine survives four trips to settings', survived.same && survived.ready)
  check('no DOM fallback after coming back', survived.fallbacks === 0)

  console.log('\nPersistence')
  await page.reload({ waitUntil: 'networkidle' })
  await waitFor3d(page)
  await wait(400)
  check('reel count persisted', (await machineState(page)).reelCount === 2)

  console.log('\nPortrait')
  const pctx = await iPadContext(browser, IPAD_PORTRAIT)
  const ppage = await pctx.newPage()
  watchConsole(ppage, noise)
  await ppage.goto(BASE, { waitUntil: 'networkidle' })
  await waitFor3d(ppage)
  await wait(600)
  check('portrait renders the machine', (await ppage.$$('.machine-slot canvas')).length === 1)
  const overflow = await ppage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('no horizontal overflow in portrait', overflow <= 1, `overflow ${overflow}`)
  await ppage.screenshot({ path: `${OUT}/06-portrait.png` })

  console.log('\nConsole')
  // SwiftShader emits its own driver performance notes; they are the test rig, not the app.
  const real = noise.filter(
    (n) => !/favicon|Download the React DevTools|GPU stall due to ReadPixels|GL Driver Message/i.test(n)
  )
  check('no console errors or warnings', real.length === 0)
  real.slice(0, 6).forEach((n) => console.log('      ' + n.replace(/\s+/g, ' ').slice(0, 200)))

  await browser.close()

  console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}`)
  if (failures.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
