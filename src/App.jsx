import { useEffect, useRef } from 'react'
import { unlockAudio } from './audio/engine.js'
import { useMetronome } from './audio/useMetronome.js'
import { CocoLayer } from './coco/CocoLayer.jsx'
import { useLayout } from './layout/useLayout.js'
import { TiltPrompt } from './ui/TiltPrompt.jsx'
import { useStore } from './store/useStore.js'
import { ChordSheet } from './ui/ChordSheet.jsx'
import { CocoSheet } from './ui/CocoSheet.jsx'
import { Header } from './ui/Header.jsx'
import { PatternPicker, PatternSheet } from './ui/PatternSheet.jsx'
import { Practice } from './ui/Practice.jsx'
import { Settings } from './ui/Settings.jsx'
import { StrumCard } from './ui/StrumCard.jsx'
import { TabBar } from './ui/TabBar.jsx'
import './../styles/app.css'

function Popups() {
  const popup = useStore((s) => s.popup)
  if (popup === 'known') return <ChordSheet listKey="known" />
  if (popup === 'learn') return <ChordSheet listKey="learn" />
  if (popup === 'patterns') return <PatternSheet />
  if (popup === 'picker') return <PatternPicker />
  if (popup === 'koko') return <CocoSheet />
  return null
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const tab = useStore((s) => s.tab)
  const reelCount = useStore((s) => s.reelCount)

  const areaRef = useRef(null)
  const belowRef = useRef(null)
  const navRef = useRef(null)

  useMetronome()
  useLayout({ areaRef, belowRef, navRef, reelCount, tab })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // iOS keeps audio suspended until a real gesture touches it. Do it once, early,
  // so the metronome is not silently dead the first time it is switched on.
  useEffect(() => {
    const unlock = () => unlockAudio()
    const opts = { passive: true }
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('touchstart', unlock, opts)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <div className="app">
      <div className="page">
        <Header />
        {tab === 'home' ? (
          <>
            <Practice ref={areaRef} />
            <StrumCard ref={belowRef} />
          </>
        ) : (
          <Settings />
        )}
      </div>
      <TabBar ref={navRef} />
      <CocoLayer />
      <TiltPrompt />
      <Popups />
    </div>
  )
}
