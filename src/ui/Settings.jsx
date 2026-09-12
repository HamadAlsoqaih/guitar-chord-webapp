import { useEffect, useState } from 'react'
import { BPM_MAX, BPM_MIN, BPM_STEP, REELS_MAX, REELS_MIN } from '../store/defaults.js'
import { clamp, useStore } from '../store/useStore.js'
import { Footer } from './Footer.jsx'

const countOn = (list) => list.filter((x) => x.on).length

const MOTION_OPTIONS = [
  { key: 'off', label: 'Off' },
  { key: 'subtle', label: 'A little' },
  { key: 'strong', label: 'A lot' },
]

function Row({ title, sub, dot, onClick, children }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="row" onClick={onClick}>
      <div className="row-main">
        <div className="row-title">
          {dot && <span className="dot" style={{ background: dot }} />}
          {title}
        </div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {children}
      {onClick && <span className="chev">›</span>}
    </Tag>
  )
}

export function Settings() {
  const bpm = useStore((s) => s.bpm)
  const reelCount = useStore((s) => s.reelCount)
  const known = useStore((s) => s.known)
  const learn = useStore((s) => s.learn)
  const patterns = useStore((s) => s.patterns)
  const sound = useStore((s) => s.sound)
  const throwPhysics = useStore((s) => s.throwPhysics)
  const charMode = useStore((s) => s.charMode)
  const sayTaps = useStore((s) => s.sayTaps)
  const sayDrags = useStore((s) => s.sayDrags)
  const sayFalls = useStore((s) => s.sayFalls)
  const setBpm = useStore((s) => s.setBpm)
  const setReelCount = useStore((s) => s.setReelCount)
  const setSound = useStore((s) => s.setSound)
  const setThrowPhysics = useStore((s) => s.setThrowPhysics)
  const motion = useStore((s) => s.motion)
  const setMotion = useStore((s) => s.setMotion)
  const setPopup = useStore((s) => s.setPopup)

  // The tempo box is free-typed, so it keeps its own draft until blur/Enter.
  const [bpmField, setBpmField] = useState(String(bpm))
  useEffect(() => setBpmField(String(bpm)), [bpm])

  const commitBpm = () => {
    const parsed = parseInt(bpmField, 10)
    setBpm(Number.isFinite(parsed) ? clamp(parsed, BPM_MIN, BPM_MAX) : bpm)
  }

  const charLabel = charMode === 'both' ? 'Both characters' : charMode === 'pixel' ? 'Chibi Coco' : 'Coco'
  const lineCount = sayTaps.length + sayDrags.length + sayFalls.length

  return (
    <div className="settings">
      <div className="group">
        <Row title="Tempo" sub="Steps of 5 · or type it">
          <div className="stepper">
            <button className="step-btn pressable" onClick={() => setBpm(bpm - BPM_STEP)} aria-label="Slower">
              −
            </button>
            <input
              className="step-value"
              value={bpmField}
              inputMode="numeric"
              onChange={(e) => setBpmField(e.target.value)}
              onBlur={commitBpm}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label="Tempo in BPM"
            />
            <button className="step-btn pressable" onClick={() => setBpm(bpm + BPM_STEP)} aria-label="Faster">
              +
            </button>
          </div>
        </Row>
        <Row title="Chords in the machine" sub={`${REELS_MIN} – ${REELS_MAX} reels`}>
          <div className="stepper">
            <button className="step-btn pressable" onClick={() => setReelCount(reelCount - 1)} aria-label="Fewer reels">
              −
            </button>
            <div className="step-value" style={{ display: 'grid', placeItems: 'center' }}>
              {reelCount}
            </div>
            <button className="step-btn pressable" onClick={() => setReelCount(reelCount + 1)} aria-label="More reels">
              +
            </button>
          </div>
        </Row>
      </div>

      <div className="group">
        <Row
          title="Chords you know"
          sub={`${countOn(known)} of ${known.length} in the machine`}
          dot="var(--blue)"
          onClick={() => setPopup('known')}
        />
        <Row
          title="Chords to learn"
          sub={`${countOn(learn)} of ${learn.length} in the machine`}
          dot="var(--red)"
          onClick={() => setPopup('learn')}
        />
        <Row
          title="Strumming patterns"
          sub={`${countOn(patterns)} of ${patterns.length} in rotation`}
          dot="var(--dim)"
          onClick={() => setPopup('patterns')}
        />
      </div>

      <div className="group">
        <Row title="Machine motion" sub="How much the machine drifts and leans when you are not touching it">
          <div className="seg" style={{ flex: '0 0 auto', minWidth: 260 }}>
            {MOTION_OPTIONS.map((o) => (
              <button key={o.key} data-active={motion === o.key} onClick={() => setMotion(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="group">
        <Row title="Throw the characters" sub="Let go mid-drag and they fly, bounce off the walls and land">
          <button
            className="switch"
            data-on={throwPhysics}
            onClick={() => setThrowPhysics(!throwPhysics)}
            role="switch"
            aria-checked={throwPhysics}
            aria-label="Throw the characters"
          />
        </Row>
      </div>

      <div className="group">
        <Row title="Metronome click" sub="Sound on every beat">
          <button
            className="switch"
            data-on={sound}
            onClick={() => setSound(!sound)}
            role="switch"
            aria-checked={sound}
            aria-label="Metronome click"
          />
        </Row>
      </div>

      <div className="group">
        <Row title="كوكو · Coco" sub={`${charLabel} · ${lineCount} lines`} onClick={() => setPopup('koko')} />
      </div>

      <Footer />
    </div>
  )
}
