import { chromium } from 'playwright'

/** The bundled Chromium revision differs from the one Playwright expects. */
export const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export const IPAD_LANDSCAPE = { width: 1024, height: 768 }
export const IPAD_PORTRAIT = { width: 768, height: 1024 }

export async function launch() {
  return chromium.launch({
    executablePath: EXECUTABLE,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  })
}

/** An iPad-like context: touch input, no mouse, device pixel ratio 2. */
export async function iPadContext(browser, viewport = IPAD_LANDSCAPE) {
  return browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  })
}

/**
 * A real finger drag: pointer events with pointerType "touch", which is what the
 * app listens for. Driving this with the mouse would exercise a path iPad users
 * never take.
 */
export async function touchDrag(page, selector, { dx = 0, dy = 0, steps = 12, hold = 0 } = {}) {
  await page.evaluate(
    async ({ selector, dx, dy, steps, hold }) => {
      const el = document.querySelector(selector)
      if (!el) throw new Error(`no element for ${selector}`)
      const r = el.getBoundingClientRect()
      const x0 = r.left + r.width / 2
      const y0 = r.top + r.height / 2
      const base = {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
      }
      const fire = (type, x, y, buttons = 1) =>
        el.dispatchEvent(new PointerEvent(type, { ...base, buttons, clientX: x, clientY: y }))
      const wait = (ms) => new Promise((r2) => setTimeout(r2, ms))

      fire('pointerdown', x0, y0)
      for (let i = 1; i <= steps; i++) {
        const x = x0 + (dx * i) / steps
        const y = y0 + (dy * i) / steps
        window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }))
        el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }))
        await wait(12)
      }
      if (hold) await wait(hold)
      const xe = x0 + dx
      const ye = y0 + dy
      window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: xe, clientY: ye }))
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: xe, clientY: ye }))
    },
    { selector, dx, dy, steps, hold }
  )
}

/** A tap with no movement — the app treats this differently from a drag. */
export async function touchTap(page, selector) {
  await touchDrag(page, selector, { dx: 0, dy: 0, steps: 1 })
}

/** Collects console errors/warnings and page exceptions for the run to assert on. */
export function watchConsole(page, sink) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') sink.push(`${type}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => sink.push(`pageerror: ${err.message}`))
}

/** Wait until the WebGL machine has taken over from the DOM fallback. */
export async function waitFor3d(page, timeout = 20000) {
  await page.waitForFunction(() => window.__chordRoller?.state()?.ready3d === true, { timeout })
  // One more frame so the first render has placed everything.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

export const machineState = (page) => page.evaluate(() => window.__chordRoller.state())

/**
 * Drag the 3D lever with a synthetic touch aimed at the ball's real screen position.
 * R3F raycasts from client coordinates, so the events must land on the canvas at the
 * spot the ball actually occupies.
 */
export async function dragLever(page, { dy = 100, steps = 14, tap = false } = {}) {
  await page.evaluate(
    async ({ dy, steps, tap }) => {
      const rect = window.__chordRollerLever.rect()
      if (!rect) throw new Error('lever not registered')
      const canvas = document.querySelector('.machine-slot canvas')
      const x = (rect.left + rect.right) / 2
      const y0 = (rect.top + rect.bottom) / 2
      const base = {
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
      }
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y0 }))
      if (!tap) {
        for (let i = 1; i <= steps; i++) {
          const y = y0 + (dy * i) / steps
          window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: y }))
          await wait(14)
        }
      }
      const yEnd = tap ? y0 : y0 + dy
      window.dispatchEvent(
        new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x, clientY: yEnd })
      )
    },
    { dy, steps, tap }
  )
}

/** Drag a 3D reel drum vertically — manual mode steps one chord per 38px. */
export async function dragReel(page, index, { dy = -120, steps = 12 } = {}) {
  await page.evaluate(
    async ({ index, dy, steps }) => {
      if (!window.__chordRollerReels) throw new Error('machine not mounted — is the Practice tab active?')
      const spot = window.__chordRollerReels.rects()[index]
      if (!spot) throw new Error(`reel ${index} not on screen`)
      const canvas = document.querySelector('.machine-slot canvas')
      const base = {
        pointerId: 20 + index,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
      }
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: spot.x, clientY: spot.y }))
      for (let i = 1; i <= steps; i++) {
        const y = spot.y + (dy * i) / steps
        window.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: spot.x, clientY: y }))
        await wait(16)
      }
      window.dispatchEvent(
        new PointerEvent('pointerup', { ...base, buttons: 0, clientX: spot.x, clientY: spot.y + dy })
      )
    },
    { index, dy, steps }
  )
}

/**
 * Capture what the compositor actually put on screen.
 *
 * page.screenshot() forces a fresh raster, and next to a WebGL canvas that keeps
 * the compositor busy some layers come back blank — DOM overlays above the machine
 * vanish from the capture while the page itself is drawing them perfectly. The
 * screencast stream is the frames the browser composited, so what it shows is what
 * a person would see.
 */
export async function compositedShot(context, page, path, { settle = 600 } = {}) {
  const cdp = await context.newCDPSession(page)
  let latest = null
  cdp.on('Page.screencastFrame', async (f) => {
    latest = f.data
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId })
    } catch {
      /* the cast is already stopped */
    }
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  const started = Date.now()
  while (!latest || Date.now() - started < settle) {
    await new Promise((r) => setTimeout(r, 100))
    if (Date.now() - started > settle + 4000) break
  }
  await cdp.send('Page.stopScreencast').catch(() => {})
  if (!latest) return false
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, Buffer.from(latest, 'base64'))
  return true
}
