import { useEffect, useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { poolOf, useStore } from '../store/useStore.js'
import { CABINET_D, CABINET_H, MARQUEE_Y, SIGN_H, SIGN_Y, cabinetWidth } from './geometry.js'
import { BLUE, GRAPHITE, GRAPHITE_DARK, NEON, anodisedGrain } from './materials.js'
import { additiveMaterial, glowTexture } from './glow.js'
import { buildMarqueeTexture, buildNeonTexture } from './reelTexture.js'

const BULB_COUNT = 34
const BULB_R = 0.036

/**
 * Marquee bulbs around the cabinet edge, as a single InstancedMesh — 34 lamps for
 * one draw call. Colour is written per instance each frame from a phase function,
 * which is far cheaper than 34 meshes with 34 materials.
 *
 * Modes: a slow chase when idle, a fast one while spinning, a flash pattern when a
 * roll lands, and a pulse on every metronome beat.
 */
export function Bulbs({ widthRef, spinningRef, winRef }) {
  const meshRef = useRef(null)
  const haloRef = useRef(null)
  const beat = useStore((s) => s.beat)
  const playing = useStore((s) => s.playing)
  const beatRef = useRef({ at: -1, index: -1 })
  const lastWidth = useRef(-1)
  const scratch = useMemo(() => ({ obj: new THREE.Object3D(), color: new THREE.Color() }), [])
  const haloMaterial = useMemo(() => additiveMaterial(glowTexture(), '#ffffff', 0.85), [])

  useEffect(() => {
    if (playing && beat >= 0) beatRef.current = { at: performance.now(), index: beat }
  }, [beat, playing])

  /** Perimeter positions on a rounded rectangle, as fractions of the cabinet width. */
  const layout = useMemo(() => {
    const out = []
    const halfH = CABINET_H / 2 - 0.09
    for (let i = 0; i < BULB_COUNT; i++) {
      const t = i / BULB_COUNT
      // Walk the perimeter: across the top, down the right, back along the bottom, up the left.
      const p = t * 4
      let ux
      let y
      if (p < 1) {
        ux = -0.5 + p
        y = halfH
      } else if (p < 2) {
        ux = 0.5
        y = halfH - (p - 1) * halfH * 2
      } else if (p < 3) {
        ux = 0.5 - (p - 2)
        y = -halfH
      } else {
        ux = -0.5
        y = -halfH + (p - 3) * halfH * 2
      }
      out.push({ ux, y })
    }
    return out
  }, [])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const width = widthRef.current ?? cabinetWidth(3)

    // Re-place the lamps only when the cabinet is actually resizing.
    const halo = haloRef.current
    if (Math.abs(width - lastWidth.current) > 0.002) {
      lastWidth.current = width
      const { obj } = scratch
      for (let i = 0; i < BULB_COUNT; i++) {
        const { ux, y } = layout[i]
        obj.position.set(ux * (width - 0.34), y, CABINET_D / 2 + 0.02)
        obj.updateMatrix()
        mesh.setMatrixAt(i, obj.matrix)
        if (halo) {
          obj.position.z += 0.012
          obj.updateMatrix()
          halo.setMatrixAt(i, obj.matrix)
        }
      }
      mesh.instanceMatrix.needsUpdate = true
      if (halo) halo.instanceMatrix.needsUpdate = true
    }

    const t = state.clock.elapsedTime
    const spinning = spinningRef.current
    const win = winRef.current
    const speed = spinning ? 7.5 : 1.6
    const { color } = scratch

    // A beat pulse decays over ~180ms so it reads as a flash, not a slow fade.
    const sinceBeat = performance.now() - beatRef.current.at
    const beatPulse = sinceBeat < 180 ? (1 - sinceBeat / 180) * (beatRef.current.index === 0 ? 1 : 0.55) : 0

    const sinceWin = performance.now() - win
    const winFlash = sinceWin < 900 ? 1 - sinceWin / 900 : 0

    for (let i = 0; i < BULB_COUNT; i++) {
      const phase = t * speed - i * 0.34
      let level = 0.18 + 0.82 * Math.pow((Math.sin(phase) + 1) / 2, 3)
      if (winFlash > 0) {
        // Alternating lamps, strobing — reads as a win pattern rather than a chase.
        const strobe = Math.sin(performance.now() * 0.03 + (i % 2) * Math.PI) > 0 ? 1 : 0.1
        level = Math.max(level, strobe * winFlash * 2.2)
      }
      level += beatPulse * 0.9

      // Idle runs blue; spinning and winning run red, matching the cabinet glow.
      const hot = spinning || winFlash > 0
      const base = hot ? NEON : BLUE
      color.set(base)
      color.multiplyScalar(Math.min(2.6, 0.3 + level * 1.9))
      mesh.setColorAt(i, color)
      if (halo) {
        // The halo tracks the lamp but stays dimmer, so unlit lamps do not glow.
        color.multiplyScalar(0.5)
        halo.setColorAt(i, color)
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (halo?.instanceColor) halo.instanceColor.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, BULB_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[BULB_R, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* Additive halos, standing in for a bloom pass. One extra draw call total. */}
      <instancedMesh
        ref={haloRef}
        args={[undefined, undefined, BULB_COUNT]}
        frustumCulled={false}
        material={haloMaterial}
      >
        <planeGeometry args={[BULB_R * 9, BULB_R * 9]} />
      </instancedMesh>
    </>
  )
}

/**
 * The topper: a graphite board bolted to the cabinet's top edge, carrying the neon.
 *
 * The sign used to hang in mid-air above the machine with nothing holding it up.
 * Giving it a real housing that starts exactly where the cabinet ends makes it part
 * of the machine instead of a caption floating over it.
 */
export function NeonSign({ widthRef }) {
  const groupRef = useRef(null)
  const boardRef = useRef(null)
  const materialRef = useRef(null)
  const lightRef = useRef(null)
  const texture = useMemo(() => buildNeonTexture('Chord Roller'), [])
  const washMaterial = useMemo(() => additiveMaterial(glowTexture(), NEON, 0.3), [])
  const grain = useMemo(() => anodisedGrain(), [])
  const start = useRef(performance.now())

  const boardMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GRAPHITE,
        roughnessMap: grain,
        roughness: 0.44,
        metalness: 0.6,
      }),
    [grain]
  )

  useEffect(() => () => texture.dispose(), [texture])

  useFrame(() => {
    const elapsed = (performance.now() - start.current) / 1000
    // Warm-up flicker for the first second and a half, then a steady glow with a
    // trace of mains hum on it.
    let level
    if (elapsed < 1.5) {
      const stutter = Math.sin(elapsed * 42) * Math.sin(elapsed * 17)
      level = elapsed < 0.28 ? 0 : Math.max(0, Math.min(1, 0.45 + stutter))
    } else {
      level = 0.94 + Math.sin(elapsed * 6.1) * 0.03 + Math.sin(elapsed * 23) * 0.015
    }
    if (materialRef.current) materialRef.current.opacity = level
    if (lightRef.current) lightRef.current.intensity = level * 2.6

    // The board is narrower than the cabinet but grows with it.
    const width = widthRef.current ?? cabinetWidth(3)
    const scale = width / cabinetWidth(3)
    if (boardRef.current) boardRef.current.scale.x = scale
    if (groupRef.current) groupRef.current.scale.x = Math.min(1.2, scale)
  })

  const boardW = cabinetWidth(3) * 0.82

  /*
   * The tubes stand proud of the housing rather than sitting flush against it.
   *
   * Flush means coplanar, and coplanar means the depth test decides pixel by pixel
   * which of the two surfaces is in front — so the sign comes out patched with
   * rectangles of bare housing and a ghost of itself, and it changes as the camera
   * moves. Real neon stands off its backing board anyway.
   */
  const housingDepth = CABINET_D * 0.62
  const housingZ = CABINET_D * 0.1
  const tubeStandoff = housingZ + housingDepth / 2 + 0.04

  return (
    <group position={[0, SIGN_Y, 0]}>
      {/* The housing, sitting on the cabinet's top edge. */}
      <RoundedBox
        ref={boardRef}
        args={[boardW, SIGN_H, housingDepth]}
        radius={0.09}
        smoothness={4}
        position={[0, 0, housingZ]}
        material={boardMaterial}
      />

      <group ref={groupRef} position={[0, 0.02, tubeStandoff]}>
        {/* A soft wash so the neon spills onto the housing around it. */}
        <mesh position={[0, 0, -0.012]} material={washMaterial}>
          <planeGeometry args={[3.4, 1.15]} />
        </mesh>
        <mesh>
          <planeGeometry args={[2.75, 0.69]} />
          <meshBasicMaterial
            ref={materialRef}
            map={texture}
            transparent
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* The spill that puts red light back onto the graphite below the sign. */}
      <pointLight ref={lightRef} color={NEON} distance={4} decay={2} position={[0, -0.42, 0.7]} />
    </group>
  )
}

/** Engraved, backlit plate under the reels: "N REELS · M CHORDS". */
export function MarqueePlate({ widthRef }) {
  const groupRef = useRef(null)
  const reelCount = useStore((s) => s.reelCount)
  // Subscribe to the count, not the array: this only needs to change when it changes.
  const chordCount = useStore((s) => poolOf(s).length)
  const label = `${reelCount} REELS · ${chordCount} CHORDS`

  const texture = useMemo(() => buildMarqueeTexture(label), [label])
  useEffect(() => () => texture.dispose(), [texture])

  useFrame(() => {
    if (!groupRef.current) return
    const width = widthRef.current ?? cabinetWidth(3)
    groupRef.current.scale.x = Math.min(1.3, (width - 1.1) / (cabinetWidth(3) - 1.1))
  })

  return (
    <group ref={groupRef} position={[0, MARQUEE_Y, CABINET_D / 2 + 0.015]}>
      <RoundedBox args={[2.5, 0.34, 0.06]} radius={0.03} smoothness={3}>
        <meshStandardMaterial color={GRAPHITE_DARK} roughness={0.42} metalness={0.9} />
      </RoundedBox>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[2.42, 0.3]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}
