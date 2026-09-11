import { useCallback, useEffect, useMemo, useRef } from 'react'
import { a, useSpring } from '@react-spring/three'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CABINET_D } from './geometry.js'
import { RED, STEEL } from './materials.js'
import { registerLever } from './leverBridge.js'
import { useLeverDrag } from './useLeverDrag.js'

/**
 * The lever rotates on a real axle that runs left-to-right across the cabinet face.
 *
 * Rotating about X sends the tip of the arm forward and down — at angle φ a point
 * at (0, L, 0) lands at (0, L·cosφ, L·sinφ) — so the ball swings *toward the
 * viewer* as it comes down, growing as it approaches. That arc is what makes it
 * read as a physical lever rather than a sprite sliding down the screen.
 */
const ARM_LENGTH = 0.82
const BALL_R = 0.23
/** Resting lean (slightly back) through to a full pull (down and forward). */
const REST_ANGLE = -0.2
const PULL_ANGLE = 0.88

export function Lever3D({ x, onCommit }) {
  const pivotRef = useRef(null)
  const ballRef = useRef(null)
  const { camera, gl } = useThree()

  const [{ angle }, api] = useSpring(() => ({
    angle: REST_ANGLE,
    config: { tension: 300, friction: 13 },
  }))

  /** Travel 0..1 from the drag hook maps onto the arc. */
  const applyTravel = useCallback(
    (v) => {
      const to = REST_ANGLE + (PULL_ANGLE - REST_ANGLE) * v
      if (v === 0) {
        // Released: let it spring home with overshoot and a short wobble.
        api.start({ angle: REST_ANGLE, config: { tension: 260, friction: 10.5 } })
      } else {
        // Under the finger, but with enough lag that the arm feels weighted.
        api.start({ angle: to, config: { tension: 900, friction: 42 } })
      }
    },
    [api]
  )

  const { begin, tapPull } = useLeverDrag({ onChange: applyTravel, onCommit })

  /** Where the ball is on screen, so a character dropped on it can pull the lever. */
  const getRect = useCallback(() => {
    const ball = ballRef.current
    if (!ball) return null
    const canvas = gl.domElement
    const bounds = canvas.getBoundingClientRect()
    const world = ball.getWorldPosition(new THREE.Vector3())
    const projected = world.clone().project(camera)
    const cx = bounds.left + ((projected.x + 1) / 2) * bounds.width
    const cy = bounds.top + ((1 - projected.y) / 2) * bounds.height

    // Convert the ball's radius into screen pixels at its current depth.
    const edge = world.clone().add(new THREE.Vector3(BALL_R, 0, 0)).project(camera)
    const r = Math.abs(((edge.x - projected.x) / 2) * bounds.width)
    return {
      left: cx - r,
      right: cx + r,
      top: cy - r,
      bottom: cy + r,
      width: r * 2,
      height: r * 2,
    }
  }, [camera, gl])

  useEffect(() => registerLever({ getRect, pull: tapPull }), [getRect, tapPull])

  const ballMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: RED,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 0.95,
      }),
    []
  )

  const steelMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.24, metalness: 1 }),
    []
  )

  const onPointerDown = (e) => {
    e.stopPropagation()
    begin(e.clientY, e.pointerId)
  }

  return (
    <a.group
      ref={pivotRef}
      position={[x, -0.18, CABINET_D / 2 - 0.14]}
      rotation-x={angle}
      onPointerDown={onPointerDown}
    >
      {/* Generous invisible hit volume — a finger should not have to find the rod. */}
      <mesh position={[0, ARM_LENGTH * 0.62, 0]} visible={false}>
        <capsuleGeometry args={[0.34, ARM_LENGTH * 0.9, 4, 8]} />
      </mesh>

      <mesh position={[0, ARM_LENGTH / 2, 0]} material={steelMaterial}>
        <cylinderGeometry args={[0.052, 0.062, ARM_LENGTH, 16]} />
      </mesh>

      {/* Collar where the rod meets the ball. */}
      <mesh position={[0, ARM_LENGTH - 0.1, 0]} material={steelMaterial}>
        <cylinderGeometry args={[0.082, 0.082, 0.075, 16]} />
      </mesh>

      <mesh ref={ballRef} position={[0, ARM_LENGTH + BALL_R * 0.55, 0]} material={ballMaterial}>
        <sphereGeometry args={[BALL_R, 32, 24]} />
      </mesh>
    </a.group>
  )
}
