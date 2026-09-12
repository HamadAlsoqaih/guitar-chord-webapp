import { IPAD_LANDSCAPE, iPadContext, launch, waitFor3d } from './browser.mjs'
import { advance, makeThrow, releaseVelocity } from '../src/coco/throwPhysics.js'

/**
 * Throwing a character.
 *
 * Two halves, because they answer different questions. The first runs the physics
 * on its own — where a body ends up is arithmetic, and arithmetic can be checked
 * exactly, including the property that matters most: the same throw must land in
 * the same place whatever the frame rate. The second drives the real app through
 * touch events to prove the gesture is wired to that arithmetic.
 *
 * The flick in the browser half is dispatched in one go rather than spread over
 * real time. These tests run on a software rasteriser at a few frames a second, so
 * a "fast" gesture paced by setTimeout is physically a slow drag — and the app is
 * right to treat it as one.
 */
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}

const BOUNDS = { minX: 4, maxX: 874, minY: 4, maxY: 521 }

/** Run a throw to rest, sampling as it goes. `fps` decides the frame length. */
function simulate(launchSpec, fps = 60, limit = 20) {
  const body = makeThrow(launchSpec)
  const dt = 1 / fps
  const path = []
  let elapsed = 0
  while (!advance(body, BOUNDS, dt) && elapsed < limit) {
    path.push({ x: body.x, y: body.y, rot: body.rot })
    elapsed += dt
  }
  return { body, path, elapsed }
}

console.log('\nThe physics on its own')

const flat = simulate({ x: 100, y: 100, vx: 1400, vy: -200 })
check('a throw travels in the direction it was thrown', Math.max(...flat.path.map((p) => p.x)) > 600)
check('and comes to rest', flat.body.resting, `after ${flat.elapsed.toFixed(1)}s`)
check('on the floor', Math.abs(flat.body.y - BOUNDS.maxY) < 0.5, `y ${flat.body.y.toFixed(1)}`)
check('and inside the walls', flat.body.x >= BOUNDS.minX - 0.5 && flat.body.x <= BOUNDS.maxX + 0.5)
check('having bounced off something', flat.body.bounces > 0, `${flat.body.bounces} bounces`)
check(
  'never leaving the screen on the way',
  flat.path.every((p) => p.x >= BOUNDS.minX - 0.5 && p.x <= BOUNDS.maxX + 0.5 && p.y >= BOUNDS.minY - 0.5 && p.y <= BOUNDS.maxY + 0.5)
)

const hard = simulate({ x: 100, y: 100, vx: 3800, vy: -600 })
const turned = hard.path.some((p, i) => i > 0 && p.x < hard.path[i - 1].x)
check('a hard throw reaches the far wall and comes back', turned && Math.max(...hard.path.map((p) => p.x)) > BOUNDS.maxX - 2)
check('hitting more than one wall', hard.body.bounces > 2, `${hard.body.bounces} bounces`)
check('it spins while it flies', Math.abs(hard.path[5].rot) > 1)

const dropped = simulate({ x: 400, y: 100, vx: 0, vy: 0 })
check('a body with no throw in it just falls', Math.abs(dropped.body.x - 400) < 1 && dropped.body.resting)

// The property the fixed timestep exists for.
const fast = simulate({ x: 100, y: 100, vx: 2200, vy: -400 }, 60)
const slow = simulate({ x: 100, y: 100, vx: 2200, vy: -400 }, 8)
check(
  'the same throw lands in the same place at 60fps and at 8fps',
  Math.abs(fast.body.x - slow.body.x) < 1,
  `${fast.body.x.toFixed(1)} vs ${slow.body.x.toFixed(1)}`
)

console.log('\nReading the release')
const now = 1000
const trail = [
  { x: 0, y: 0, t: now - 200 },
  { x: 100, y: 0, t: now - 100 },
  { x: 160, y: -20, t: now - 50 },
  { x: 220, y: -40, t: now },
]
const v = releaseVelocity(trail, 70, now)
check('velocity comes from the window, not the whole drag', Math.round(v.vx) === 1200, `${Math.round(v.vx)} px/s`)
const stalled = releaseVelocity([{ x: 0, y: 0, t: now - 20 }, { x: 0, y: 0, t: now }], 70, now)
check('a hand that stopped reads as stopped', stalled.speed === 0)

console.log('\nIn the app')
const browser = await launch()
const ctx = await iPadContext(browser, IPAD_LANDSCAPE)
const page = await ctx.newPage()
await page.goto(process.env.APP_URL || 'http://localhost:5173/guitar-chord-webapp/', { waitUntil: 'networkidle' })
await waitFor3d(page)
await new Promise((r) => setTimeout(r, 3500))

/**
 * Flick the character, then watch until he settles.
 *
 * Polling until he stops rather than for a fixed time, because these tests run at a
 * few frames a second: the simulation advances in clamped chunks, so a throw that
 * takes two seconds on a tablet takes a good deal longer here. That is the fixed
 * timestep behaving as designed — the path is the same, it is played slower.
 */
const fling = (dx, dy) =>
  page.evaluate(
    async ({ dx, dy }) => {
      const el = document.querySelector('.char')
      const r = el.getBoundingClientRect()
      const base = { pointerId: 5, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: 1 }
      let x = r.left + r.width / 2
      let y = r.top + r.height / 2
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y }))
      // Dispatched in one go: on a software rasteriser anything paced by a timer
      // is a slow drag, and a slow drag is not a throw.
      for (let i = 0; i < 6; i++) {
        x += dx
        y += dy
        el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }))
      }
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x, clientY: y }))

      const seen = []
      const nav = document.querySelector('.nav').getBoundingClientRect()
      /*
       * Watch rendered frames, not milliseconds. Stillness measured in wall-clock
       * time is meaningless here: at a couple of frames a second, a second of polls
       * can land inside a single frame and read as "he has stopped" while he is
       * mid-air. Counting frames that drew him in the same place cannot.
       */
      await new Promise((done) => {
        let still = 0
        let frames = 0
        const watch = () => {
          const b = el.getBoundingClientRect()
          const previous = seen[seen.length - 1]
          // The anchor is what the physics bounds: a spinning sprite's corners
          // reach past it, which is the rotation and not the simulation.
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
          seen.push({ l: b.left, t: b.top, r: b.right, b: b.bottom, ax: m.m41, ay: m.m42 })
          still =
            previous && Math.abs(previous.l - b.left) < 0.5 && Math.abs(previous.t - b.top) < 0.5
              ? still + 1
              : 0
          frames += 1
          if (still >= 10 || frames > 400) done()
          else requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)
      })
      return { seen, w: window.innerWidth, navTop: nav.top }
    },
    { dx, dy }
  )

// Thrown up and to the left, since he starts at the right-hand edge standing on
// the floor — a flat flick from there is over almost before it starts.
const left = await fling(-70, -45)
const anchors = left.seen.map((p) => p.ax)
const travelled = anchors[0] - Math.min(...anchors)
check('a flick sends him flying', travelled > 120, `${Math.round(travelled)}px of travel`)

/*
 * The bounce is proved by the direction reversing, not by catching the contact.
 * At four thousand pixels a second a frame covers seventy of them, so the sample
 * nearest the wall can sit a frame's travel away from it however hard he hits.
 */
const lowest = Math.min(...anchors)
check(
  'he reaches the far wall and comes back off it',
  lowest < 90 && anchors.slice(anchors.indexOf(lowest)).some((v) => v > lowest + 40),
  `within ${Math.round(lowest)}px of it, then back`
)
check(
  'the anchor never leaves the screen',
  left.seen.every((s) => s.ax >= 0 && s.ax <= left.w && s.ay >= 0 && s.ay <= left.navTop)
)
// The sprite is turning, so its corners reach past the anchor. Worth measuring
// rather than pretending otherwise — it should be a corner's worth, not a body's.
const overhang = Math.max(
  ...left.seen.map((s) => Math.max(-s.l, s.r - left.w, -s.t, s.b - left.navTop, 0))
)
check('and a spinning corner only grazes the edge', overhang < 40, `${Math.round(overhang)}px at most`)
const settled = left.seen[left.seen.length - 1]
check('he ends up on the floor', Math.abs(left.navTop - settled.b) < 24, `${Math.round(left.navTop - settled.b)}px above it`)

// The switch, through the settings page rather than a back door.
await page.click('.nav button:last-child')
await new Promise((r) => setTimeout(r, 600))
await page.click('[aria-label="Throw the characters"]')
await new Promise((r) => setTimeout(r, 400))
// Read from the control itself rather than a test hook: what the switch says is
// what the person using it sees.
check(
  'the switch turns it off',
  (await page.getAttribute('[aria-label="Throw the characters"]', 'aria-checked')) === 'false'
)
await page.click('.nav button:first-child')
await new Promise((r) => setTimeout(r, 900))

const off = await fling(70, -10)
const movedOff = Math.max(...off.seen.map((s) => s.r)) - off.seen[0].r
check('with it off he only falls', movedOff < 40, `${Math.round(movedOff)}px of travel`)
check('and still lands on the floor', Math.abs(off.navTop - off.seen[off.seen.length - 1].b) < 24)

await browser.close()
console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
