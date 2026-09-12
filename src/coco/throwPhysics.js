import {
  THROW_AIR_DRAG,
  THROW_CEILING_BOUNCE,
  THROW_FLOOR_BOUNCE,
  THROW_FLOOR_FRICTION,
  THROW_GRAVITY,
  THROW_GROUND_DRAG,
  THROW_MAX_FRAME_S,
  THROW_MAX_SPEED,
  THROW_MIN_BOUNCE_SPEED,
  THROW_REST_SPEED,
  THROW_SPIN_DRAG,
  THROW_SPIN_PER_SPEED,
  THROW_STEP_S,
  THROW_WALL_BOUNCE,
} from '../store/defaults.js'

/**
 * A thrown character.
 *
 * Kept apart from the component, and free of the DOM, for two reasons: the character
 * component should be about the character, and arithmetic that decides where
 * something lands is worth being able to test without a browser.
 *
 * Time is simulated in fixed steps rather than by frame. A variable step makes the
 * result depend on the frame rate — the same flick lands somewhere else on a busy
 * device than on an idle one, and a long frame can push a fast body clean through a
 * wall between one position and the next. Fixed steps, with a cap on how many of
 * them one frame may run, give the same trajectory at sixty frames a second and at
 * eight; a slow device plays it slower, which is the honest failure.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const MAX_STEPS = Math.ceil(THROW_MAX_FRAME_S / THROW_STEP_S)

/**
 * @param {{x: number, y: number, vx: number, vy: number, rot?: number}} launch
 * @returns a body, in screen pixels and seconds
 */
export function makeThrow({ x, y, vx, vy, rot = 0 }) {
  const speed = Math.hypot(vx, vy)
  // A flick can be faster than the simulation can resolve; hold it to something the
  // collision step can still catch against a wall.
  const scale = speed > THROW_MAX_SPEED ? THROW_MAX_SPEED / speed : 1
  return {
    x,
    y,
    vx: vx * scale,
    vy: vy * scale,
    rot,
    // Spin comes from the throw itself, so a hard sideways flick tumbles and a
    // gentle lob turns lazily.
    spin: vx * scale * THROW_SPIN_PER_SPEED,
    bounces: 0,
    resting: false,
    carry: 0,
  }
}

/**
 * Advance by one frame's worth of real time.
 *
 * @param bounds {{minX, maxX, minY, maxY}} where the character may be, its own top
 *   left corner being the point that is bounded
 * @returns true once it has come to rest
 */
export function advance(body, bounds, dt) {
  if (body.resting) return true
  body.carry += clamp(dt, 0, THROW_MAX_FRAME_S)
  let steps = 0
  while (body.carry >= THROW_STEP_S && steps < MAX_STEPS) {
    step(body, bounds)
    body.carry -= THROW_STEP_S
    steps += 1
    if (body.resting) break
  }
  return body.resting
}

function step(body, bounds) {
  const dt = THROW_STEP_S

  body.vy += THROW_GRAVITY * dt
  const drag = 1 - THROW_AIR_DRAG * dt
  body.vx *= drag
  body.vy *= drag

  body.x += body.vx * dt
  body.y += body.vy * dt
  body.rot += body.spin * dt
  body.spin *= 1 - THROW_SPIN_DRAG * dt

  // Walls: the outgoing angle mirrors the incoming one, which is what makes a hard
  // throw cross the screen and come back rather than stop dead.
  if (body.x <= bounds.minX) {
    body.x = bounds.minX
    body.vx = Math.abs(body.vx) * THROW_WALL_BOUNCE
    body.spin = -body.spin * THROW_WALL_BOUNCE
    body.bounces += 1
  } else if (body.x >= bounds.maxX) {
    body.x = bounds.maxX
    body.vx = -Math.abs(body.vx) * THROW_WALL_BOUNCE
    body.spin = -body.spin * THROW_WALL_BOUNCE
    body.bounces += 1
  }

  if (body.y <= bounds.minY) {
    body.y = bounds.minY
    body.vy = Math.abs(body.vy) * THROW_CEILING_BOUNCE
    body.bounces += 1
  }

  if (body.y < bounds.maxY) return

  // On the floor.
  body.y = bounds.maxY
  if (Math.abs(body.vy) > THROW_MIN_BOUNCE_SPEED) {
    body.vy = -Math.abs(body.vy) * THROW_FLOOR_BOUNCE
    body.vx *= THROW_FLOOR_FRICTION
    // Once it has hit the ground it rolls rather than spins on the spot.
    body.spin = body.vx * THROW_SPIN_PER_SPEED * 0.6
    body.bounces += 1
    return
  }

  body.vy = 0
  body.vx *= 1 - THROW_GROUND_DRAG * dt
  body.spin = body.vx * THROW_SPIN_PER_SPEED * 0.6
  if (Math.abs(body.vx) < THROW_REST_SPEED) {
    body.vx = 0
    body.spin = 0
    body.resting = true
  }
}

/**
 * Release velocity, in pixels per second, from the trail of pointer samples.
 *
 * Measured against the oldest sample still inside the window rather than the last
 * two events: a single late frame before the finger lifts would otherwise read as a
 * hand that had stopped moving, and the throw would die on release — which is
 * exactly the case people notice.
 *
 * @param trail {{x, y, t}[]} oldest first
 */
export function releaseVelocity(trail, windowMs, now) {
  if (!trail || trail.length < 2) return { vx: 0, vy: 0, speed: 0 }
  const last = trail[trail.length - 1]
  let first = trail[0]
  for (let i = trail.length - 1; i >= 0; i--) {
    first = trail[i]
    if (now - trail[i].t >= windowMs) break
  }
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return { vx: 0, vy: 0, speed: 0 }
  const vx = (last.x - first.x) / dt
  const vy = (last.y - first.y) / dt
  return { vx, vy, speed: Math.hypot(vx, vy) }
}
