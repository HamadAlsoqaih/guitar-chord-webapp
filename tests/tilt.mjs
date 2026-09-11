import { deviceToScreen } from '../src/machine/tilt.js'

/**
 * The axis mapping on its own.
 *
 * This is the whole of the bug that made "tilt with the iPad" do nothing in
 * landscape, and it is pure arithmetic, so it can be checked without a browser or a
 * gyroscope — neither of which is available here anyway.
 */
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${detail ? `   ${detail}` : ''}`)
}
const near = (a, b) => Math.abs(a - b) < 1e-9

// Portrait: the device axes already are the screen axes.
const portrait = deviceToScreen(20, 5, 0)
check('portrait: sideways is gamma', near(portrait.x, 20), `x ${portrait.x}`)
check('portrait: forwards is beta', near(portrait.y, 5), `y ${portrait.y}`)

// Landscape: tilting the tablet sideways shows up in beta, and that has to be what
// moves the machine sideways. Reading gamma here is what left it motionless.
const landscape = deviceToScreen(0, 20, 90)
check('landscape: sideways comes from beta', near(landscape.x, 20), `x ${landscape.x}`)
check('landscape: and does not leak into pitch', near(landscape.y, 0), `y ${landscape.y}`)

// The other landscape, holding it the other way up.
const landscapeLeft = deviceToScreen(0, 20, -90)
check('landscape the other way: sideways flips', near(landscapeLeft.x, -20), `x ${landscapeLeft.x}`)

// Upside down.
const upside = deviceToScreen(20, 5, 180)
check('upside down: both axes invert', near(upside.x, -20) && near(upside.y, -5))

// A tilt of a given size stays that size whichever way the tablet is held.
for (const angle of [0, 90, 180, 270]) {
  const t = deviceToScreen(12, 9, angle)
  check(
    `magnitude survives rotation at ${angle}°`,
    near(Math.hypot(t.x, t.y), Math.hypot(12, 9)),
    Math.hypot(t.x, t.y).toFixed(4)
  )
}

console.log(failures ? `\n${failures} failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
