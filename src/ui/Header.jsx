import { useStore } from '../store/useStore.js'

export function Header() {
  const tab = useStore((s) => s.tab)
  const unlocked = useStore((s) => s.unlocked)
  const theme = useStore((s) => s.theme)
  const toggleLock = useStore((s) => s.toggleLock)
  const toggleTheme = useStore((s) => s.toggleTheme)

  const home = tab === 'home'
  const subtitle = home
    ? unlocked
      ? 'Scroll a reel or pull the lever'
      : 'Pull the lever to roll'
    : 'Tempo, reels and your chord lists'

  return (
    <header className="header">
      <div>
        <h1>{home ? 'Chord Roller' : 'Settings'}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        {home && (
          <button
            className="icon-btn"
            data-active={unlocked}
            onClick={toggleLock}
            aria-pressed={unlocked}
            aria-label={unlocked ? 'Manual reel mode on' : 'Manual reel mode off'}
          >
            {unlocked ? '⇕' : '⇳'}
          </button>
        )}
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle light and dark theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
