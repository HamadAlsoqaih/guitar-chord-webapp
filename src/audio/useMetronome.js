import { useEffect, useRef } from 'react'
import { Metronome } from './engine.js'
import { useStore } from '../store/useStore.js'

/** Keeps one Metronome instance in sync with the store. */
export function useMetronome() {
  const playing = useStore((s) => s.playing)
  const bpm = useStore((s) => s.bpm)
  const sound = useStore((s) => s.sound)
  const setBeat = useStore((s) => s.setBeat)
  const ref = useRef(null)

  if (!ref.current) ref.current = new Metronome({ onBeat: setBeat })

  useEffect(() => {
    ref.current.setBpm(bpm)
  }, [bpm])

  useEffect(() => {
    ref.current.setSound(sound)
  }, [sound])

  useEffect(() => {
    const metro = ref.current
    if (playing) metro.start()
    else metro.stop()
  }, [playing])

  // Changing tempo mid-bar should take effect immediately, not at the next bar.
  useEffect(() => {
    const metro = ref.current
    if (!playing) return
    metro.stop()
    metro.start()
  }, [bpm, playing])

  useEffect(() => () => ref.current.stop(), [])
}
