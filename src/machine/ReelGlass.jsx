import { useEffect, useMemo, useRef } from 'react'
import { useFBO } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GRAPHITE_DARK, NEON } from './materials.js'
import { tier } from './quality.js'

/**
 * Curved glass with real refraction, without paying for a second full scene render.
 *
 * drei's MeshTransmissionMaterial re-renders the *entire scene* into its buffer
 * every frame, and the buffer has to be near canvas resolution or the chords behind
 * it turn to mush — which is the one thing this app cannot afford, since reading
 * chords is the whole point. At 256 they are illegible; at 2048 they are crisp but
 * it is a full extra pass over four million pixels.
 *
 * This renders only what is actually behind the pane — the drums, the win lines and
 * the back panel — selected by layer. That is a handful of meshes covering about a
 * quarter of the canvas, so the buffer can run at full resolution and stay sharp
 * while costing a fraction of a full pass.
 */
export const REFRACT_LAYER = 1

/**
 * Force the refraction buffer to be redrawn for a while.
 *
 * The buffer is only redrawn when something behind the pane has actually moved, and
 * the cheap test for that — the camera and the drums — cannot see a new strip being
 * printed or a light pulsing. Anything that changes what is behind the glass without
 * moving it says so here.
 */
let dirtyUntil = 0
export function invalidateGlass(ms = 400) {
  const end = performance.now() + ms
  if (end > dirtyUntil) dirtyUntil = end
}

/** Sum of the drums' angles, written by Reels every frame. */
export const reelMotion = { sum: 0 }

/** Pointer events pass straight through the glass to the drums behind it. */
const noRaycast = () => null

/** Tag a mesh as sitting behind the glass. */
export const behindGlass = (object) => {
  if (object) object.layers.enable(REFRACT_LAYER)
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tBehind;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uRefract;
  uniform float uChroma;
  uniform vec3 uReflectTint;
  uniform float uReflectStrength;
  uniform float uSweep;

  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(vViewDir);

    // Thin curved pane: the displacement is proportional to how far the surface
    // tilts away from the viewer, which is what bends the image near the edges.
    vec2 offset = N.xy * uRefract;

    // Splitting the channels by a hair gives the coloured fringe real glass has.
    // It costs three texture fetches instead of one, which is why the weakest
    // devices take the single sample: the refraction survives, the fringe does not.
    #ifdef CHROMA
      float r = texture2D(tBehind, uv + offset * (1.0 + uChroma)).r;
      vec3  g = texture2D(tBehind, uv + offset).rgb;
      float b = texture2D(tBehind, uv + offset * (1.0 - uChroma)).b;
      vec3 behind = vec3(r, g.g, b);
    #else
      vec3 behind = texture2D(tBehind, uv + offset).rgb;
    #endif

    // A high exponent keeps the mirror-like falloff to genuinely grazing angles.
    // Lower, and the pane whites out near the window edges and hides the outer reels.
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);

    // A soft highlight travelling slowly across the pane.
    float travel = fract(uTime * 0.055) * 2.2 - 0.6;
    float band = exp(-pow((uv.x + uv.y * 0.3 - travel) * 6.0, 2.0)) * uSweep;

    vec3 reflected = uReflectTint * (0.5 + band * 2.2);
    float mixAmount = clamp(fresnel * uReflectStrength + band * 0.22, 0.0, 0.42);

    gl_FragColor = vec4(mix(behind, reflected, mixAmount), 1.0);
    #include <colorspace_fragment>
  }
`

export function ReelGlass({ geometryArgs, position, scaleRef, dark }) {
  const meshRef = useRef(null)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)

  // Full canvas resolution on a fast device, capped so a 3x-DPR screen cannot run
  // away with it, and scaled down by tier where the fill rate is not there.
  const q = tier()
  const scale = Math.min(viewport.dpr, 2) * q.glass
  const width = Math.min(2048, Math.round(size.width * scale))
  const height = Math.min(1536, Math.round(size.height * scale))
  const fbo = useFBO(width, height, { depthBuffer: true, stencilBuffer: false })

  const uniforms = useMemo(
    () => ({
      tBehind: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      // A thin pane bends very little. Pushed further, the offset samples pixels
      // from outside the drum silhouette and smears them into the frame.
      uRefract: { value: 0.006 },
      uChroma: { value: 0.18 },
      uReflectTint: { value: new THREE.Color('#8fa6d8') },
      uReflectStrength: { value: 0.34 },
      uSweep: { value: q.sweep },
    }),
    [q.sweep]
  )
  const defines = useMemo(() => (q.chroma ? { CHROMA: '' } : {}), [q.chroma])

  useEffect(() => {
    uniforms.uReflectTint.value.set(dark ? '#43587f' : '#b9c9e8')
    uniforms.uReflectStrength.value = dark ? 0.3 : 0.38
    invalidateGlass()
  }, [dark, uniforms])

  const clearColor = useMemo(() => new THREE.Color(GRAPHITE_DARK), [])
  const drawingBuffer = useMemo(() => new THREE.Vector2(), [])
  const previous = useMemo(() => ({ color: new THREE.Color(), mask: 0 }), [])

  // Infinity, so the very first frame always counts as moved and fills the buffer.
  const seen = useRef({ sig: Number.POSITIVE_INFINITY, at: 0 })
  // The scene is still assembling for the first moments — textures arriving, drums
  // taking their places — and none of that moves anything the cheap test watches.
  useEffect(() => invalidateGlass(2500), [])

  /**
   * Priority < 0 so this runs before R3F's own render: the buffer has to hold this
   * frame's drum positions, or the glass shows the previous frame during a spin.
   */
  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const { gl, scene, camera } = state

    uniforms.uTime.value += delta
    // The screen-space lookup is in canvas pixels, not buffer pixels: the buffer
    // holds the same view at a smaller size, so dividing gl_FragCoord by anything
    // but the drawing buffer sends the sample outside the image entirely.
    gl.getDrawingBufferSize(drawingBuffer)
    uniforms.uResolution.value.copy(drawingBuffer)
    if (scaleRef?.current != null) mesh.scale.x = scaleRef.current

    /*
     * Only redraw the buffer when what it holds could have changed.
     *
     * Behind the pane there are three drums, two light bars and a back panel, all
     * of them lit the same way from one frame to the next. If the drums have not
     * turned, the camera has not moved and the cabinet is not resizing, the buffer
     * from last frame is still pixel-for-pixel correct — and skipping it halves the
     * work of an idle frame, which is most frames.
     */
    const sig =
      reelMotion.sum +
      camera.position.x * 7.1 +
      camera.position.y * 13.3 +
      camera.position.z * 19.7 +
      (scaleRef?.current ?? 1) * 101.3
    const moved = Math.abs(sig - seen.current.sig) > 1e-5
    const now = performance.now()
    /*
     * Refresh at least twice a second even when nothing appears to have moved. The
     * test above knows about the drums and the camera and nothing else — a buffer
     * reallocated when the resolution changes, a material that finished loading —
     * so a slow heartbeat is what keeps a missed case from freezing the glass on a
     * stale image. It still skips the great majority of idle frames.
     */
    if (!moved && now >= dirtyUntil && now - seen.current.at < 500) return
    seen.current.sig = sig
    seen.current.at = now

    previous.mask = camera.layers.mask
    gl.getClearColor(previous.color)
    const previousAlpha = gl.getClearAlpha()

    // Only the meshes tagged behindGlass() draw into the buffer.
    camera.layers.set(REFRACT_LAYER)
    mesh.visible = false
    gl.setRenderTarget(fbo)
    gl.setClearColor(clearColor, 1)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    mesh.visible = true
    camera.layers.mask = previous.mask
    gl.setClearColor(previous.color, previousAlpha)

    uniforms.tBehind.value = fbo.texture
  }, -1)

  return (
    /*
     * raycast is disabled: the pane sits in front of the drums, so leaving it
     * pickable would swallow every touch and manual mode could never grab a reel.
     */
    <mesh ref={meshRef} position={position} raycast={noRaycast}>
      <cylinderGeometry args={geometryArgs} />
      <shaderMaterial
        defines={defines}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
        transparent={false}
      />
    </mesh>
  )
}

/** Colour used to clear the refraction buffer, so it is never empty behind the pane. */
export const GLASS_CLEAR = GRAPHITE_DARK
export const GLASS_ACCENT = NEON
