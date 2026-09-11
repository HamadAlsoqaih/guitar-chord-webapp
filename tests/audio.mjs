import { chromium } from 'playwright'
import { EXECUTABLE, IPAD_LANDSCAPE } from './browser.mjs'

/**
 * What the machine actually plays during a roll.
 *
 * There is no listening to it from here, so this taps the audio graph instead: every
 * scheduled voice is recorded as it starts, and a processor node in front of the
 * speakers sees every sample that comes out. That is enough to prove the rattle
 * tracks the drums rather than the frame rate, that each drum lands on its own note,
 * and that none of it is silent or clipping.
 *
 * Note the frame rate here: the tests run on a software rasteriser at a few frames a
 * second, so the tick count is a floor, not what a tablet would produce.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(name, ok, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: [
    '--no-sandbox',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    // Synthetic pointer events are not trusted gestures, so the audio context would
    // otherwise stay suspended and every sound would be a no-op.
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const ctx = await browser.newContext({
  viewport: IPAD_LANDSCAPE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

await ctx.addInitScript(() => {
  const Original = window.AudioContext
  window.__audio = { starts: [], blocks: [], t0: 0 }
  window.AudioContext = class extends Original {
    get destination() {
      if (!this.__tap) {
        const real = Object.getOwnPropertyDescriptor(window.BaseAudioContext.prototype, 'destination')
        const speakers = real.get.call(this)
        const tap = this.createScriptProcessor(2048, 1, 1)
        tap.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0)
          let peak = 0
          for (let i = 0; i < input.length; i++) {
            const v = Math.abs(input[i])
            if (v > peak) peak = v
          }
          window.__audio.blocks.push({
            t: Math.round(performance.now() - (window.__audio.t0 || performance.now())),
            peak,
          })
          event.outputBuffer.getChannelData(0).set(input)
        }
        tap.connect(speakers)
        this.__tap = tap
        window.__audio.ctx = this
      }
      return this.__tap
    }
  }
  for (const Node of [window.AudioBufferSourceNode, window.OscillatorNode]) {
    const start = Node.prototype.start
    Node.prototype.start = function (...args) {
      window.__audio.starts.push({
        t: performance.now(),
        kind: Node === window.AudioBufferSourceNode ? 'buffer' : 'osc',
        hz: this.frequency ? Math.round(this.frequency.value) : null,
      })
      return start.apply(this, args)
    }
  }
})

const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__chordRoller?.state?.().ready3d === true, null, { timeout: 30000 })
await wait(4000)

// The app builds its audio context on the first touch anywhere.
await page.evaluate(() =>
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
)
await wait(400)
check('audio context is running', (await page.evaluate(() => window.__audio.ctx?.state)) === 'running')

await page.evaluate(() => {
  window.__audio.starts = []
  window.__audio.blocks = []
  window.__audio.t0 = performance.now()
})
await page.evaluate(() => {
  const rect = window.__chordRollerLever.rect()
  const canvas = document.querySelector('.machine-slot canvas')
  const base = {
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
  }
  const x = (rect.left + rect.right) / 2
  const y0 = (rect.top + rect.bottom) / 2
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y0 }))
  for (let i = 1; i <= 12; i++) {
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y0 + (110 * i) / 12 }))
  }
  window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x, clientY: y0 + 110 }))
})
await wait(6500)

const report = await page.evaluate(() => {
  const { blocks, starts, t0 } = window.__audio
  const ticks = starts.filter((s) => s.kind === 'buffer').map((s) => Math.round(s.t - t0))
  // The bell fundamentals: the first partial of each landing, one per drum.
  const bells = starts.filter((s) => s.kind === 'osc' && s.hz >= 1000 && s.hz <= 1600).map((s) => s.hz)
  return {
    ticks: ticks.length,
    firstTickMs: ticks[0] ?? null,
    lastTickMs: ticks[ticks.length - 1] ?? null,
    bells,
    peak: Math.max(0, ...blocks.map((b) => b.peak)),
    audibleBlocks: blocks.filter((b) => b.peak > 0.004).length,
    blocks: blocks.length,
  }
})

check('the drums rattle while they run', report.ticks >= 12, `${report.ticks} ticks`)
check('the rattle starts with the roll', report.firstTickMs !== null && report.firstTickMs < 1200, `${report.firstTickMs}ms`)
check('the rattle stops with it', report.lastTickMs !== null && report.lastTickMs < 4500, `${report.lastTickMs}ms`)
check('one bell per drum', report.bells.length === 3, report.bells.join(', '))
check(
  'each drum rings higher than the last',
  report.bells.every((hz, i) => i === 0 || hz > report.bells[i - 1]),
  report.bells.join(' < ')
)
check('something actually came out of it', report.audibleBlocks > 0, `${report.audibleBlocks}/${report.blocks} blocks`)
check('and it is not clipping', report.peak < 1, `peak ${report.peak.toFixed(3)}`)

await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
