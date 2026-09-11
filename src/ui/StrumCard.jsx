import { forwardRef } from 'react'
import { CELL_LABELS, SYM } from '../store/defaults.js'
import { useStore } from '../store/useStore.js'

const REST_PATTERN = { cells: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'] }

export const StrumCard = forwardRef(function StrumCard({ hidden }, ref) {
  const patterns = useStore((s) => s.patterns)
  const patternIdx = useStore((s) => s.patternIdx)
  const bpm = useStore((s) => s.bpm)
  const playing = useStore((s) => s.playing)
  const beat = useStore((s) => s.beat)
  const setPopup = useStore((s) => s.setPopup)
  const randomPattern = useStore((s) => s.randomPattern)
  const setPlaying = useStore((s) => s.setPlaying)

  const pattern = patterns[patternIdx] || patterns[0] || REST_PATTERN
  // The highlight lands on the numbered slots only — never the "&" between them.
  const activeCell = playing && beat >= 0 ? beat * 2 : -1

  return (
    <div className="below" ref={ref} hidden={hidden}>
      <div className="card">
        <div className="strum-head">
          <button className="strum-title pressable" onClick={() => setPopup('picker')}>
            <span>STRUM</span>
            <span className="caret">▾</span>
          </button>

          <button
            className="bpm-btn pressable"
            data-playing={playing}
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Stop metronome' : 'Start metronome'}
          >
            <span className="bpm-dot">{playing ? '■' : '▶'}</span>
            <span className="bpm-num">{bpm}</span>
            <span className="bpm-unit">BPM</span>
          </button>

          <button className="chip pressable" onClick={randomPattern}>
            <span>⤨</span>
            <span>Random</span>
          </button>
        </div>

        <div className="grid8">
          {pattern.cells.map((cell, i) => (
            <div className="cell" key={i}>
              <div className="cell-box" data-active={i === activeCell} data-rest={cell === 'R'}>
                {SYM[cell]}
              </div>
              <div className="cell-label" data-active={i === activeCell}>
                {CELL_LABELS[i]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
