import * as THREE from 'three'

/**
 * Additive halos instead of a post-processing bloom pass.
 *
 * `postprocessing`'s EffectComposer writes an opaque frame, which paints a visible
 * rectangle over the page wherever the canvas is transparent — and it costs a
 * full-screen pass every frame. Every emitter here is small and local (lamps, two
 * win lines, one sign), so drawing their halos as additive geometry gives the same
 * glow for a handful of triangles, and the canvas keeps its alpha.
 */
let radial = null

export function glowTexture() {
  if (radial) return radial
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  radial = new THREE.CanvasTexture(canvas)
  radial.colorSpace = THREE.SRGBColorSpace
  return radial
}

/** A soft bar, for glow along the win lines. */
let bar = null
export function barGlowTexture() {
  if (bar) return bar
  const w = 8
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  bar = new THREE.CanvasTexture(canvas)
  bar.colorSpace = THREE.SRGBColorSpace
  return bar
}

export function additiveMaterial(map, color = '#ffffff', opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
}

export function disposeGlow() {
  radial?.dispose()
  bar?.dispose()
  radial = null
  bar = null
}
