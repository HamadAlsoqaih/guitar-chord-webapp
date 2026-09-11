import { forwardRef } from 'react'
import { useStore } from '../store/useStore.js'
import { GearIcon, HomeIcon } from './icons.jsx'

export const TabBar = forwardRef(function TabBar(_props, ref) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)

  return (
    <nav className="nav" ref={ref}>
      <button data-active={tab === 'home'} onClick={() => setTab('home')}>
        <HomeIcon />
        <span>Practice</span>
      </button>
      <button data-active={tab === 'settings'} onClick={() => setTab('settings')}>
        <GearIcon />
        <span>Settings</span>
      </button>
    </nav>
  )
})
