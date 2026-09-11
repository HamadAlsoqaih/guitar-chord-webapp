import { IPAD_LANDSCAPE, IPAD_PORTRAIT, dragLever, iPadContext, launch, waitFor3d } from './browser.mjs'

/** Does the machine ever leave the canvas — at rest, and while the pull pushes in? */
const browser = await launch()

async function run(label, viewport, reels) {
  const ctx = await iPadContext(browser, viewport)
  const page = await ctx.newPage()
  await page.addInitScript((n) => {
    localStorage.setItem('chord-roller-v1', JSON.stringify({ reelCount: n }))
  }, reels)
  await page.goto('http://localhost:5173/guitar-chord-webapp/', { waitUntil: 'networkidle' })
  await waitFor3d(page)
  await new Promise((r) => setTimeout(r, 5000))

  const read = () =>
    page.evaluate(() => {
      const f = window.__chordRollerFrame?.()
      if (!f) return null
      return {
        top: f.canvas.top - f.machine.top,
        bottom: f.machine.bottom - f.canvas.bottom,
        left: f.canvas.left - f.machine.left,
        right: f.machine.right - f.canvas.right,
      }
    })

  let worst = { side: '', over: -Infinity }
  const note = (m) => {
    for (const [side, over] of Object.entries(m)) {
      if (over > worst.over) worst = { side, over }
    }
  }
  note(await read())
  await dragLever(page, { dy: 100, steps: 14 })
  for (let i = 0; i < 9; i++) {
    await new Promise((r) => setTimeout(r, 300))
    note(await read())
  }
  const verdict = worst.over < 0 ? 'inside' : 'CLIPS'
  console.log(
    `${label.padEnd(22)} ${verdict}  worst ${worst.side} ${worst.over.toFixed(1)}px`
  )
  await ctx.close()
  return worst.over < 0
}

let ok = true
ok = (await run('landscape, 3 reels', IPAD_LANDSCAPE, 3)) && ok
ok = (await run('landscape, 6 reels', IPAD_LANDSCAPE, 6)) && ok
ok = (await run('portrait, 3 reels', IPAD_PORTRAIT, 3)) && ok
ok = (await run('portrait, 6 reels', IPAD_PORTRAIT, 6)) && ok
await browser.close()
process.exit(ok ? 0 : 1)
