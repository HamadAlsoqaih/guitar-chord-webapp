import { useEffect } from 'react'

/**
 * The two placement rules from the original app, recomputed on every resize:
 *
 *   1. The machine is centred between the top of the screen and the top of the
 *      nav bar — so its centre sits at navTop / 2, not in the leftover space.
 *   2. The strum card is centred between the bottom of the machine and the nav.
 *
 * Results are published as CSS custom properties so layout stays in CSS and we
 * never write geometry into React state (which would re-render on every frame
 * of an orientation change).
 */
export function useLayout({ areaRef, belowRef, navRef, reelCount, tab }) {
  useEffect(() => {
    if (tab !== 'home') return undefined

    let raf = 0
    const measure = () => {
      raf = 0
      const area = areaRef.current
      const nav = navRef.current
      if (!area || !nav) return

      const areaTop = area.getBoundingClientRect().top
      const navTop = nav.getBoundingClientRect().top
      const belowH = belowRef.current ? belowRef.current.getBoundingClientRect().height : 0
      const areaW = area.clientWidth
      if (areaW <= 0 || navTop <= areaTop) return

      // A wider cabinet for more reels, so the box never letterboxes the machine.
      const aspect = 1.15 + reelCount * 0.33

      // Centring the machine on navTop/2 bounds its height from both directions.
      const fitAbove = navTop - 2 * areaTop
      const fitBelow = navTop - 2 * (belowH + 10)
      let h = Math.min(fitAbove, fitBelow, areaW / aspect)
      h = Math.max(180, h)
      let w = Math.min(areaW, h * aspect)
      h = Math.min(h, w / aspect)

      const top = Math.max(0, navTop / 2 - h / 2 - areaTop)
      const gap = Math.max(8, (navTop - (areaTop + top + h) - belowH) / 2)

      const root = document.documentElement
      root.style.setProperty('--machine-top', `${Math.round(top)}px`)
      root.style.setProperty('--machine-h', `${Math.round(h)}px`)
      root.style.setProperty('--machine-w', `${Math.round(w)}px`)
      root.style.setProperty('--strum-gap', `${Math.round(gap)}px`)
      window.dispatchEvent(new CustomEvent('chordroller:layout'))
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    if (areaRef.current) ro.observe(areaRef.current)
    if (belowRef.current) ro.observe(belowRef.current)
    if (navRef.current) ro.observe(navRef.current)
    ro.observe(document.documentElement)

    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
    }
  }, [areaRef, belowRef, navRef, reelCount, tab])
}
