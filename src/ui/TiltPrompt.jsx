import { useEffect, useState } from 'react'
import {
  enableGyro,
  isGyroActive,
  needsGyroPermission,
  onGyroChange,
} from '../machine/tilt.js'
import { useStore } from '../store/useStore.js'

/**
 * iOS will not hand over the gyroscope without an explicit tap, so the tilt can't
 * simply be switched on from Settings. This offers it once, only when the user has
 * actually asked for motion, and disappears for good once granted or dismissed.
 */
export function TiltPrompt() {
  const motion = useStore((s) => s.motion)
  const tab = useStore((s) => s.tab)
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(isGyroActive)

  useEffect(() => onGyroChange(setActive), [])

  const relevant = motion !== 'off' && tab === 'home' && needsGyroPermission()
  if (!relevant || active || dismissed) return null

  return (
    <button
      className="tilt-btn pressable"
      onClick={async () => {
        const ok = await enableGyro()
        if (!ok) setDismissed(true)
      }}
    >
      Tilt with the iPad
    </button>
  )
}
