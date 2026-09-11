/** Shared world-space dimensions for the machine, in scene units. */

export const REEL_FACE = 0.9
export const REEL_GAP = 0.14
export const REEL_PITCH = REEL_FACE + REEL_GAP

/** Bezel around the reel bank, and the cabinet's own proportions. */
export const BEZEL_X = 0.62
/** Width of the frame down each side of the reel window. */
export const SIDE_W = 0.58
export const CABINET_H = 2.5
export const CABINET_D = 1.15
export const WINDOW_H = 1.05

/** Vertical placement of the parts, relative to the cabinet centre. */
export const REEL_Y = 0.12
export const MARQUEE_Y = -0.92
export const SIGN_Y = 1.58
/** Depth at which the drums' front surface sits, just behind the glass. */
export const DRUM_FRONT_Z = 0.3
export const GLASS_Z = 0.5

/**
 * Drum radius is derived from the window rather than fixed.
 *
 * The pool is repeated around the drum to reach roughly 18 cells, but the exact
 * count has to be a whole number of repeats — so the angle per chord shifts a little
 * with the pool size. With a fixed radius the window would show 3.15 or 2.8 chords
 * instead of 3, leaving a sliver of a fourth at the edge. Sizing the drum so that
 * three cells subtend exactly the window height keeps it at three, always. Nobody
 * can see how big the drum is; they can see a stray sliver.
 */
export const reelRadius = (cells) => WINDOW_H / (2 * Math.sin((1.5 * Math.PI * 2) / cells))
export const reelZ = (cells) => DRUM_FRONT_Z - reelRadius(cells)

/** Half the angular height of the reel window — used to place the win lines. */
export const cellAngle = (cells) => (Math.PI * 2) / cells

/** How far the lever reaches past the cabinet's left edge. */
export const LEVER_OVERHANG = 0.95

export const reelSpan = (n) => n * REEL_FACE + (n - 1) * REEL_GAP
export const cabinetWidth = (n) => reelSpan(n) + BEZEL_X * 2
/** X position of reel `i` of `n`, so the bank stays centred. */
export const reelX = (i, n) => (i - (n - 1) / 2) * REEL_PITCH

/**
 * Rotation that puts `cell` on the payline.
 *
 * Derivation: a point at cylinder parameter θ sits at (y, z) = (R sinθ, R cosθ)
 * once the drum is laid on its side, and a mesh rotation φ about X moves it to
 * R sin(θ − φ), R cos(θ − φ). The payline is y = 0, z = R — so θ = φ. Cell k's
 * centre is at θ = 2π(k + ½)/cells.
 */
export const rotationForCell = (cell, cells) => ((cell + 0.5) * Math.PI * 2) / cells
