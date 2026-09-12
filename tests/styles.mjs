import { writeFileSync } from 'node:fs'
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, iPadContext, launch, waitFor3d } from './browser.mjs'

/**
 * A fingerprint of how every element on every screen is laid out and painted.
 *
 * It exists to make "this change is invisible" a measurement rather than a promise.
 * Take one before a stylesheet change and one after: a deletion of rules nothing
 * uses has to produce an identical file, and any line that differs names the
 * element and the property that actually depended on the rule.
 *
 *   node tests/styles.mjs before.json
 *   …make the change, rebuild…
 *   node tests/styles.mjs after.json
 *   diff before.json after.json
 *
 * Anything that animates is left out on purpose — transform and opacity above all,
 * since the lamp chase, the neon flicker and the character's own placement all move
 * them. What is left is stable enough that two runs of an unchanged app agree
 * exactly, which is checked before the file is trusted for anything.
 */
const BASE = process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/'
const out = process.argv[2] || 'tests/out/styles.json'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Everything a stylesheet can decide, minus everything that moves on its own. */
const PROPERTIES = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'overflow',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'padding', 'gap', 'flex', 'flexDirection', 'alignItems', 'justifyContent',
  'gridTemplateColumns', 'gridTemplateRows', 'justifySelf', 'alignSelf',
  'color', 'backgroundColor', 'backgroundImage', 'borderRadius', 'border', 'boxShadow',
  'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textAlign',
  'textTransform', 'backdropFilter', 'filter', 'visibility', 'pointerEvents',
  'animationName', 'animationDuration', 'transitionProperty', 'aspectRatio',
]

/** The tokens themselves, resolved for whichever theme is on. */
const TOKENS = [
  '--font-ui', '--font-script', '--blue', '--red', '--bg-0', '--bg-1', '--panel',
  '--panel-2', '--sunk', '--edge', '--edge-strong', '--ink', '--dim', '--on-accent',
  '--shadow-1', '--shadow-2', '--shadow-pop', '--glow-blue', '--glow-red', '--radius',
  '--radius-lg', '--nav-h', '--tap', '--machine-top', '--machine-h', '--machine-w',
  '--strum-gap',
]

const collect = ({ properties, tokens }) => {
    const root = getComputedStyle(document.documentElement)
    const path = (el) => {
      const parts = []
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const index = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0
        parts.unshift(`${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}[${index}]`)
      }
      return parts.join(' > ')
    }
    const elements = [...document.body.querySelectorAll('*')].map((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const entry = {
        el: path(el),
        box: [rect.left, rect.top, rect.width, rect.height].map((v) => Math.round(v * 100) / 100),
      }
      for (const property of properties) {
        /*
         * A canvas reports its drawing buffer through aspect-ratio as `auto W / H`,
         * and the machine's buffer is deliberately adaptive — the performance
         * monitor walks the device pixel ratio down when frames get expensive. It
         * is set by JavaScript, never by a stylesheet, so reading it here would
         * only record how busy the machine was when the snapshot ran.
         */
        if (property === 'aspectRatio' && el.tagName === 'CANVAS') continue
        entry[property] = cs[property]
      }
      return entry
    })
    const values = {}
    for (const token of tokens) values[token] = root.getPropertyValue(token).trim()
  return { tokens: values, elements }
}

async function snap(page, label, store) {
  store[label] = await page.evaluate(collect, { properties: PROPERTIES, tokens: TOKENS })
}

const browser = await launch()
const result = {}

/** Practice and settings, at a given size, in both themes. */
async function tour(viewport, name, reelCount) {
  const ctx = await iPadContext(browser, viewport)
  const page = await ctx.newPage()
  await page.addInitScript((n) => {
    localStorage.setItem('chord-roller-v1', JSON.stringify({ reelCount: n }))
  }, reelCount)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await waitFor3d(page)
  await wait(4000)
  await snap(page, `${name}/practice-light`, result)

  await page.click('.header-actions .icon-btn:last-child')
  await wait(1200)
  await snap(page, `${name}/practice-dark`, result)
  await page.click('.header-actions .icon-btn:last-child')
  await wait(1200)

  await page.click('.nav button:last-child')
  await wait(800)
  await snap(page, `${name}/settings`, result)

  // Each sheet in turn: they carry rules nothing else does.
  const sheets = [
    ['chords', '.group:nth-of-type(2) .row:first-child'],
    ['patterns', '.group:nth-of-type(2) .row:nth-child(3)'],
    ['coco', '.group:last-child .row'],
  ]
  for (const [label, selector] of sheets) {
    const opened = await page.click(selector).then(() => true).catch(() => false)
    if (!opened) continue
    await wait(700)
    await snap(page, `${name}/sheet-${label}`, result)
    await page.click('.sheet-close').catch(() => {})
    await wait(500)
  }
  await ctx.close()
}

await tour(IPAD_LANDSCAPE, 'landscape-3', 3)
await tour(IPAD_PORTRAIT, 'portrait-3', 3)
await tour(IPAD_LANDSCAPE, 'landscape-6', 6)
await tour(IPAD_LANDSCAPE, 'landscape-2', 2)

// The loading skeleton: hold the 3D chunk back so it stays on screen.
{
  const ctx = await iPadContext(browser)
  await ctx.route(/MachineCanvas-.*\.js$/, async (route) => {
    await wait(20000)
    await route.abort()
  })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await wait(3000)
  await snap(page, 'skeleton', result)
  await ctx.close()
}

// The DOM machine: the one screen the deleted loader rules used to live beside.
{
  const ctx = await iPadContext(browser)
  await ctx.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      return kind === 'webgl2' ? null : real.call(this, kind, ...rest)
    }
  })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await wait(4000)
  await snap(page, 'dom-machine', result)
  await ctx.close()
}

await browser.close()
writeFileSync(out, JSON.stringify(result, null, 1))
const screens = Object.keys(result)
console.log(
  `wrote ${out}: ${screens.length} screens, ` +
    `${screens.reduce((n, k) => n + result[k].elements.length, 0)} elements`
)
