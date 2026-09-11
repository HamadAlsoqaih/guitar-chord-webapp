import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  CABINET_D,
  CABINET_H,
  GLASS_Z,
  REEL_Y,
  SIDE_W,
  WINDOW_H,
  cabinetWidth,
  reelRadius,
  reelZ,
} from './geometry.js'
import { additiveMaterial, barGlowTexture } from './glow.js'
import { ReelGlass, behindGlass } from './ReelGlass.jsx'
import { GRAPHITE, GRAPHITE_DARK, NEON, STEEL, anodisedGrain } from './materials.js'

/**
 * The cabinet is a frame with a real opening, not a slab: the drums sit behind it
 * and show only through the window.
 *
 * The pieces are sized and placed from one animated width rather than scaled as a
 * single group, because a uniform scale would stretch the side frames along with
 * the cabinet — at six reels the window would end up narrower than the reel bank
 * and clip the outer drums. Keeping the sides a fixed width and moving them apart
 * makes the opening grow exactly as fast as the reels do.
 *
 * The side pieces run the full height of the cabinet so they overlap the top and
 * bottom at the corners. Butting rounded boxes end to end instead leaves a visible
 * seam at every join; overlapping hides the rounding inside the solid and leaves it
 * only where it should show — the outer silhouette and the window's inner edge.
 */
const NOMINAL_W = cabinetWidth(3)
const WIN_TOP = REEL_Y + WINDOW_H / 2
const WIN_BOTTOM = REEL_Y - WINDOW_H / 2
const HALF_H = CABINET_H / 2
const TOP_H = HALF_H - WIN_TOP
const BOTTOM_H = WIN_BOTTOM + HALF_H
/** Frame front face; the back slab fills the rest of the depth. */
const FRAME_D = 0.56
const FRAME_Z = CABINET_D / 2 - FRAME_D / 2
const NOMINAL_WIN = NOMINAL_W - SIDE_W * 2

const GLASS_R = 3.4
const GLASS_HALF_ANGLE = Math.asin(NOMINAL_WIN / 2 / GLASS_R)

export function Cabinet({ reelCount, widthRef, cells, dark }) {
  const grain = useMemo(() => anodisedGrain(), [])
  const refs = {
    back: useRef(null),
    top: useRef(null),
    bottom: useRef(null),
    left: useRef(null),
    right: useRef(null),
    glass: useRef(null),
    lines: useRef(null),
  }

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GRAPHITE,
        roughnessMap: grain,
        roughness: 0.42,
        metalness: 0.62,
      }),
    [grain]
  )

  const cavityMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GRAPHITE_DARK, roughness: 0.92, metalness: 0.1 }),
    []
  )

  const target = cabinetWidth(reelCount)
  const glassScale = useRef(1)

  useFrame((_, delta) => {
    const current = widthRef.current ?? target
    const width = current + (target - current) * Math.min(1, delta * 9)
    widthRef.current = width

    const spanScale = width / NOMINAL_W
    const winScale = (width - SIDE_W * 2) / NOMINAL_WIN
    if (refs.back.current) refs.back.current.scale.x = spanScale
    if (refs.top.current) refs.top.current.scale.x = spanScale
    if (refs.bottom.current) refs.bottom.current.scale.x = spanScale
    if (refs.left.current) refs.left.current.position.x = -(width / 2 - SIDE_W / 2)
    if (refs.right.current) refs.right.current.position.x = width / 2 - SIDE_W / 2
    glassScale.current = winScale
    if (refs.lines.current) refs.lines.current.scale.x = winScale
  })

  return (
    <group>
      {/* Back panel: closes the cavity so the window reads as a recess, not a hole. */}
      <RoundedBox
        ref={refs.back}
        args={[NOMINAL_W, CABINET_H, CABINET_D - FRAME_D]}
        radius={0.1}
        smoothness={3}
        position={[0, 0, FRAME_Z - FRAME_D / 2 - (CABINET_D - FRAME_D) / 2]}
        material={cavityMaterial}
        receiveShadow
        onUpdate={behindGlass}
      />

      {/* Frame: the four pieces that leave the window open. */}
      <RoundedBox
        ref={refs.top}
        args={[NOMINAL_W, TOP_H, FRAME_D]}
        radius={0.07}
        smoothness={3}
        position={[0, WIN_TOP + TOP_H / 2, FRAME_Z]}
        material={bodyMaterial}
        castShadow
      />
      <RoundedBox
        ref={refs.bottom}
        args={[NOMINAL_W, BOTTOM_H, FRAME_D]}
        radius={0.07}
        smoothness={3}
        position={[0, WIN_BOTTOM - BOTTOM_H / 2, FRAME_Z]}
        material={bodyMaterial}
        castShadow
      />
      <RoundedBox
        ref={refs.left}
        args={[SIDE_W, CABINET_H, FRAME_D]}
        radius={0.07}
        smoothness={3}
        position={[-(NOMINAL_W / 2 - SIDE_W / 2), 0, FRAME_Z]}
        material={bodyMaterial}
        castShadow
      />
      <RoundedBox
        ref={refs.right}
        args={[SIDE_W, CABINET_H, FRAME_D]}
        radius={0.07}
        smoothness={3}
        position={[NOMINAL_W / 2 - SIDE_W / 2, 0, FRAME_Z]}
        material={bodyMaterial}
        castShadow
      />

      <group ref={refs.lines}>
        <WinLines cells={cells} />
      </group>

      {/* A cylinder wall, so the pane is genuinely curved rather than a bent plane. */}
      <ReelGlass
        scaleRef={glassScale}
        dark={dark}
        position={[0, REEL_Y, GLASS_Z - GLASS_R]}
        geometryArgs={[
          GLASS_R,
          GLASS_R,
          WINDOW_H + 0.04,
          44,
          1,
          true,
          -GLASS_HALF_ANGLE,
          GLASS_HALF_ANGLE * 2,
        ]}
      />
    </group>
  )
}

/**
 * The two red lines bracketing the result row.
 *
 * They sit just in front of the drum surface rather than on the glass: from any
 * camera position they then line up exactly with the chord on the payline, which
 * a pane 0.2 units further forward would not.
 */
/** Decoration must not intercept touches meant for the drums behind it. */
const noRaycast = () => null

function WinLines({ cells }) {
  const halfArc = Math.PI / cells
  const radius = reelRadius(cells)
  const y = radius * Math.sin(halfArc)
  const z = reelZ(cells) + radius * Math.cos(halfArc) + 0.03
  const glow = useMemo(() => barGlowTexture(), [])
  const glowMaterial = useMemo(() => additiveMaterial(glow, NEON, 0.6), [glow])

  return (
    <group name="winlines">
      {[1, -1].map((sign) => (
        <group key={sign} position={[0, REEL_Y + y * sign, z]}>
          <mesh onUpdate={behindGlass} raycast={noRaycast}>
            <boxGeometry args={[NOMINAL_WIN, 0.02, 0.01]} />
            <meshBasicMaterial color={NEON} toneMapped={false} />
          </mesh>
          {/* Additive halo above and below the line, in place of a bloom pass. */}
          <mesh position={[0, 0, 0.012]} material={glowMaterial} onUpdate={behindGlass} raycast={noRaycast}>
            <planeGeometry args={[NOMINAL_WIN, 0.2]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Dark steel bracket carrying the lever's axle out from the cabinet's left flank. */
export function LeverMount({ x, edgeX }) {
  const y = -0.2
  const z = CABINET_D / 2 - 0.16
  const armLength = Math.abs(x - edgeX) + 0.16
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.26, metalness: 1 }),
    []
  )

  return (
    <group>
      {/* Arm out to the axle, so the lever is mounted to the machine, not floating. */}
      <mesh position={[(x + edgeX) / 2, y, z]} rotation={[0, 0, Math.PI / 2]} material={material}>
        <cylinderGeometry args={[0.055, 0.055, armLength, 14]} />
      </mesh>
      {/* The axle boss itself. */}
      <mesh position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} material={material}>
        <cylinderGeometry args={[0.11, 0.11, 0.2, 20]} />
      </mesh>
    </group>
  )
}
