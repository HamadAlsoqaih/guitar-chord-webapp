import * as THREE from 'three'

/**
 * Machined-graphite palette. The cabinet is deliberately almost colourless so the
 * red lever ball and the neon script are the only colour in the scene.
 */
export const GRAPHITE = '#464c57'
export const GRAPHITE_DARK = '#23262d'
export const STEEL = '#4a505c'
export const RED = '#d8241f'
export const NEON = '#ff2d4f'
export const BLUE = '#3f7dff'

let grainTexture = null

/**
 * Fine anodised grain. Driving roughness rather than colour keeps the surface
 * reading as metal: the grain shows up in the highlight, not as visible speckle.
 */
export function anodisedGrain() {
  if (grainTexture) return grainTexture
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Stretched horizontally so it reads as a brushed direction, not noise.
      const n = Math.random() * 0.5 + Math.random() * 0.5
      const v = 150 + n * 42 + Math.sin(y * 0.7) * 4
      const i = (y * size + x) * 4
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  grainTexture = new THREE.CanvasTexture(canvas)
  grainTexture.wrapS = THREE.RepeatWrapping
  grainTexture.wrapT = THREE.RepeatWrapping
  grainTexture.repeat.set(6, 2)
  return grainTexture
}

export function disposeSharedMaterials() {
  grainTexture?.dispose()
  grainTexture = null
}
