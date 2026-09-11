import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import {
  BUBBLE_HOLD_MS,
  BUBBLE_TYPE_MS,
  DRAG_THRESHOLD_PX,
  EDGE_GAP_PX,
  FALL_BASE_MS,
  FALL_EASE_POWER,
  FALL_MAX_MS,
  FALL_PER_PX_MS,
  FALL_TUMBLE_MS,
  GROUND_GAP_PX,
  HOP_DELAY_MS,
  HOP_LIFT_PX,
  HOP_MS,
  LEVER_DROP_PAD,
  PIXEL_FRAME_MS,
  PIXEL_REACT_MS,
  TUMBLE_SPINS,
} from '../store/defaults.js'
import { getLeverRect, pullLever } from '../machine/leverBridge.js'
import { useStore } from '../store/useStore.js'
import { filledBubble, paintBubble } from './bubbleArt.js'
import { tier } from '../machine/quality.js'
import { findCrop, matte } from './videoMatte.js'

const asset = (file) => `${import.meta.env.BASE_URL}assets/${file}`
const VIDEO_SRC = asset('koko-idle.mp4')
const VIDEO_STILL_SRC = asset('koko.png')
const BUBBLE_SRC = asset('bubble.png')
const PIXEL_FRAMES = [asset('koko-f1.png'), asset('koko-f2.png')]

/** Base pixel size of each character at 100%. */
const BASE = { video: 150, pixel: 120 }

/**
 * Types a line into the balloon.
 *
 * The text is written straight to the DOM rather than held in React state. Typing
 * a 38-character line through setState re-renders the character 38 times, and the
 * letters arrive in visible jerks whenever the main thread is busy — which, next to
 * a WebGL scene, is most of the time. Writing textContent costs nothing and the
 * line fills smoothly.
 */
function useBubble(boxRef, textRef) {
  const timers = useRef({ raf: 0, hold: 0 })

  const stop = useCallback(() => {
    cancelAnimationFrame(timers.current.raf)
    clearTimeout(timers.current.hold)
  }, [])

  const say = useCallback(
    (full) => {
      stop()
      const box = boxRef.current
      const node = textRef.current
      if (!box || !node) return

      if (!full) {
        box.dataset.visible = 'false'
        return
      }

      node.textContent = ''
      box.dataset.visible = 'true'

      // Character count comes from elapsed time, not from counting ticks. A timer
      // that fires late — and next to a WebGL scene it will — would otherwise
      // stretch the line out for as long as the main thread was busy. This way the
      // line always finishes in the same wall-clock time and simply shows fewer
      // intermediate steps on a slow frame.
      const started = performance.now()
      const total = full.length * BUBBLE_TYPE_MS
      let shown = -1

      const step = (now) => {
        const chars = Math.min(full.length, Math.floor((now - started) / BUBBLE_TYPE_MS))
        if (chars !== shown) {
          shown = chars
          node.textContent = full.slice(0, chars)
        }
        if (now - started < total) {
          timers.current.raf = requestAnimationFrame(step)
        } else {
          node.textContent = full
          timers.current.hold = setTimeout(() => {
            box.dataset.visible = 'false'
          }, BUBBLE_HOLD_MS)
        }
      }
      timers.current.raf = requestAnimationFrame(step)
    },
    [boxRef, stop, textRef]
  )

  useEffect(() => stop, [stop])

  return say
}

/**
 * The balloon art: filled once per page load — both characters share the one copy —
 * and then drawn into each character's own canvas at the size it is shown.
 */
function BubbleArt({ box, flipped }) {
  const ref = useRef(null)
  useEffect(() => {
    let live = true
    filledBubble(BUBBLE_SRC).then((art) => {
      if (live) paintBubble(ref.current, art, box)
    })
    return () => {
      live = false
    }
  }, [box])
  return <canvas className="bubble-img" ref={ref} data-flipped={flipped} />
}

/**
 * The balloon.
 *
 * It is a sibling of the character, not a child, and it carries its own position.
 * Nesting it inside a character that is itself moved by a transform put it outside
 * the bounds of the character's compositing layer, and Chromium then stopped
 * rastering it the moment the typing loop finished repainting the layer every
 * frame — the balloon simply vanished while every computed style still said it was
 * visible. As its own element it is laid out and rastered on its own terms.
 *
 * The wrapper carries only the position; the show-and-hide transition lives on the
 * inner element, so the two transforms never fight over the same property.
 */
const Bubble = forwardRef(function Bubble({ size, flipped, textRef }, ref) {
  const box = Math.round(size * 1.22)
  return (
    <div
      className="bubble"
      ref={ref}
      /*
       * data-visible is deliberately NOT set here. say() writes it imperatively,
       * and declaring it in JSX too means any re-render — a drag starting, the
       * flip side changing — silently resets it and the balloon vanishes
       * mid-sentence. The CSS defaults to hidden, so an absent attribute is safe.
       */
      style={{ width: box, height: box }}
    >
      <div className="bubble-in" style={{ transformOrigin: flipped ? '75% 88%' : '25% 88%' }}>
        <BubbleArt box={box} flipped={flipped} />
        <div
          className="bubble-text rtl"
          ref={textRef}
          style={{ fontSize: Math.max(11, Math.round(box * 0.068)) }}
        />
      </div>
    </div>
  )
})

/** Where the balloon sits for a character at `x, y`: above him, tail on his head. */
export function bubbleOffset(size, flipped) {
  const box = Math.round(size * 1.22)
  return {
    dx: Math.round(size / 2 - box * (flipped ? 0.75 : 0.25)),
    dy: Math.round(size * 0.22 - box),
  }
}

/**
 * One draggable character. Position and rotation are written straight to the
 * element's transform — putting them in React state would re-render the tree on
 * every animation frame of a drag or a fall.
 */
function Character({ which, size, onTap }) {
  const rootRef = useRef(null)
  const boxRef = useRef({ w: 0, h: 0 })
  const posRef = useRef(null)
  const rotRef = useRef(0)
  const rafRef = useRef(0)
  const bubbleRef = useRef(null)
  const textRef = useRef(null)
  const say = useBubble(bubbleRef, textRef)
  const [dragging, setDragging] = useState(false)
  const [flipped, setFlipped] = useState(false)
  // Read by apply() on every animation frame, so it must not go through a render.
  const offsetRef = useRef(bubbleOffset(size, false))

  const pickLine = useStore((s) => s.pickLine)
  const savePos = useStore((s) => s.setCharPos)
  // Read the remembered spot once. Subscribing to it would make `place` re-run
  // every time it saves, which is an endless loop.
  const savedRef = useRef(useStore.getState()[which === 'koko' ? 'kokoPos' : 'pixPos'])

  const apply = useCallback(() => {
    const el = rootRef.current
    const p = posRef.current
    if (!el || !p) return
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${rotRef.current}deg)`
    // The balloon rides along, but stays upright: it is a thought, not a hat.
    const bubble = bubbleRef.current
    if (bubble) {
      const { dx, dy } = offsetRef.current
      bubble.style.transform = `translate3d(${p.x + dx}px, ${p.y + dy}px, 0)`
    }
  }, [])

  // Flipping sides or resizing moves the balloon's anchor; re-place it at once so
  // it never lags a frame behind the character it belongs to.
  useEffect(() => {
    offsetRef.current = bubbleOffset(size, flipped)
    apply()
  }, [apply, flipped, size])

  /** The floor: just above the nav bar. */
  const groundY = useCallback(() => {
    const nav = document.querySelector('.nav')
    const h = boxRef.current.h || rootRef.current?.offsetHeight || 0
    if (!h) return -1
    const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight - 66
    return navTop - h - GROUND_GAP_PX
  }, [])

  const maxX = useCallback(
    () => window.innerWidth - (boxRef.current.w || rootRef.current?.offsetWidth || 0) - EDGE_GAP_PX,
    []
  )

  const place = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    boxRef.current = { w: el.offsetWidth, h: el.offsetHeight }
    const g = groundY()
    const mx = maxX()
    // Nothing sensible to compute yet — usually the sprite has not loaded, so the
    // element still has no height. Leave him hidden rather than standing him in a
    // corner and moving him a moment later.
    if (g < 40 || mx < 8) return
    const wanted = posRef.current?.x ?? savedRef.current?.x ?? mx - 16
    const x = Math.max(EDGE_GAP_PX, Math.min(mx, wanted))
    const prev = posRef.current
    posRef.current = { x, y: g }
    apply()
    // He is only shown once he has somewhere to stand; see `.char[data-placed]`.
    el.dataset.placed = 'true'
    setFlipped(x > window.innerWidth / 2 - 40)
    // Only persist a real move; writing an identical position on every observed
    // resize would spin the store forever.
    if (!prev || Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - g) > 0.5) {
      savedRef.current = { x, y: g }
      savePos(which, { x, y: g })
    }
  }, [apply, groundY, maxX, savePos, which])

  /*
   * Re-ground on resize, on rotation, whenever the layout shifts — and whenever he
   * changes size himself.
   *
   * That last one is the important one: watching only the document misses the two
   * moments his own box changes. The sprite arrives after the first paint, and the
   * size setting can change it at any time — and since he is positioned by his top
   * left corner, a taller character keeps its head where it was and puts its feet
   * through the floor. At a large enough size he ends up below the screen
   * altogether, which reads as him vanishing.
   */
  useEffect(() => {
    place()
    const onLayout = () => place()
    window.addEventListener('resize', onLayout)
    window.addEventListener('orientationchange', onLayout)
    window.addEventListener('chordroller:layout', onLayout)
    const ro = new ResizeObserver(onLayout)
    ro.observe(document.documentElement)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => {
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('orientationchange', onLayout)
      window.removeEventListener('chordroller:layout', onLayout)
      ro.disconnect()
    }
  }, [place, size])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const settle = useCallback(
    (x, g, spins) => {
      const rest = spins % 360
      posRef.current = { x, y: g }
      rotRef.current = rest
      apply()
      savePos(which, { x, y: g })
      if (spins) say(pickLine('sayFalls'))

      // Landed head-down? Hop back upright rather than staying on his face.
      const upsideDown = rest > 90 && rest < 270
      if (!upsideDown) {
        setTimeout(() => {
          rotRef.current = 0
          apply()
        }, 220)
        return
      }
      setTimeout(() => {
        const t0 = performance.now()
        const hop = (now) => {
          const p = Math.min(1, (now - t0) / HOP_MS)
          posRef.current = { x, y: g - Math.sin(Math.PI * p) * HOP_LIFT_PX }
          rotRef.current = rest + (360 - rest) * p
          apply()
          if (p < 1) rafRef.current = requestAnimationFrame(hop)
          else {
            posRef.current = { x, y: g }
            rotRef.current = 0
            apply()
            savePos(which, { x, y: g })
          }
        }
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(hop)
      }, HOP_DELAY_MS)
    },
    [apply, pickLine, savePos, say, which]
  )

  const drop = useCallback(
    (x, tumble) => {
      const g = groundY()
      const start = posRef.current?.y ?? g
      const dist = g - start
      if (dist <= 2 && !tumble) {
        posRef.current = { x, y: g }
        rotRef.current = 0
        apply()
        savePos(which, { x, y: g })
        return
      }
      const spins = tumble ? TUMBLE_SPINS[Math.random() < 0.5 ? 0 : 1] : 0
      const dur = tumble ? FALL_TUMBLE_MS : Math.min(FALL_MAX_MS, FALL_BASE_MS + dist * FALL_PER_PX_MS)
      const t0 = performance.now()
      cancelAnimationFrame(rafRef.current)
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur)
        const eased = 1 - Math.pow(1 - p, FALL_EASE_POWER)
        posRef.current = { x, y: start + dist * eased }
        rotRef.current = spins * p
        apply()
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
        else settle(x, g, spins)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [apply, groundY, savePos, settle, which]
  )

  const onPointerDown = (e) => {
    const el = rootRef.current
    if (!el) return
    // Lock to this pointer so a second finger cannot hijack the drag. Capture can
    // throw for a pointer the browser no longer holds, and letting that escape kills
    // the drag before its listeners are bound.
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* carry on without capture */
    }
    const rect = el.getBoundingClientRect()
    const offX = e.clientX - rect.left
    const offY = e.clientY - rect.top
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > DRAG_THRESHOLD_PX) {
        moved = true
        setDragging(true)
        say(pickLine('sayDrags'))
      }
      if (!moved) return
      cancelAnimationFrame(rafRef.current)
      const nx = Math.max(EDGE_GAP_PX, Math.min(maxX(), ev.clientX - offX))
      posRef.current = {
        x: nx,
        y: Math.max(EDGE_GAP_PX, Math.min(groundY(), ev.clientY - offY)),
      }
      apply()
      setFlipped(nx > window.innerWidth / 2 - 40)
    }

    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return
      try {
        el.releasePointerCapture?.(e.pointerId)
      } catch {
        /* nothing to release */
      }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)

      if (!moved) {
        say(pickLine('sayTaps'))
        onTap?.()
        return
      }
      setDragging(false)
      const x = Math.max(EDGE_GAP_PX, Math.min(maxX(), ev.clientX - offX))

      // Dropped on the lever? Pull it, and let him tumble for his trouble.
      const lever = getLeverRect()
      const onLever =
        !!lever &&
        ev.clientX > lever.left - LEVER_DROP_PAD &&
        ev.clientX < lever.right + LEVER_DROP_PAD &&
        ev.clientY > lever.top - LEVER_DROP_PAD &&
        ev.clientY < lever.bottom + LEVER_DROP_PAD + 10
      if (onLever) pullLever()
      drop(x, onLever)
    }

    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <>
      <div
        className="char"
        ref={rootRef}
        onPointerDown={onPointerDown}
        style={{ width: size, cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {which === 'koko' ? <CocoVideo size={size} /> : <PixelSprite size={size} />}
      </div>
      <Bubble ref={bubbleRef} textRef={textRef} size={size} flipped={flipped} />
    </>
  )
}

/** The filmed Coco, lifted off his black background frame by frame. */
function CocoVideo({ size }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cropRef = useRef(null)
  const framedRef = useRef(false)
  const playingRef = useRef(false)
  /** Whatever was last drawn — the clip, or the still it falls back to. */
  const sourceRef = useRef(null)
  /** Redraw that source at the canvas's current size. */
  const repaintRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return undefined
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let raf = 0

    const reset = () => {
      framedRef.current = false
      try {
        video.currentTime = 0
      } catch {
        /* seeking before metadata lands is fine */
      }
    }
    const onEnded = () => {
      playingRef.current = false
      reset()
    }
    video.addEventListener('ended', onEnded)
    video.addEventListener('loadeddata', reset)
    video.addEventListener('seeked', () => {
      framedRef.current = false
    })

    /** Paint one source (the video, or the still fallback) into the canvas, matted. */
    const paint = (source, srcW, srcH) => {
      if (!cropRef.current) cropRef.current = findCrop(source)
      const c = cropRef.current || { sx: 0, sy: 0, sw: srcW, sh: srcH }
      const scale = Math.min(canvas.width / c.sw, canvas.height / c.sh)
      const w = c.sw * scale
      const h = c.sh * scale
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.filter = 'saturate(1.35) contrast(1.12)'
      ctx.drawImage(source, c.sx, c.sy, c.sw, c.sh, (canvas.width - w) / 2, canvas.height - h, w, h)
      ctx.filter = 'none'
      matte(ctx, canvas.width, canvas.height)
      framedRef.current = true
      sourceRef.current = source
    }

    repaintRef.current = () => {
      const source = sourceRef.current
      if (!source) return
      paint(
        source,
        source.videoWidth || source.naturalWidth,
        source.videoHeight || source.naturalHeight
      )
    }

    /*
     * Matting is per-pixel JavaScript on the main thread, so on a weak device it is
     * competing with the machine for the same frame. Cutting it to a hand-drawn
     * cadence costs nothing anyone can see — the clip is a gentle idle loop — and
     * gives those milliseconds back to the thing people are actually looking at.
     */
    const minGap = 1000 / (tier().name === 'high' ? 60 : tier().name === 'medium' ? 30 : 24)
    let lastPaint = 0

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      // Idle: hold the matted first frame instead of re-processing it every tick.
      if (!playingRef.current && framedRef.current) return
      if (!video.videoWidth || video.readyState < 2) return
      if (now - lastPaint < minGap) return
      lastPaint = now
      paint(video, video.videoWidth, video.videoHeight)
    }
    raf = requestAnimationFrame(draw)

    /**
     * If the clip cannot play — an unsupported build, a blocked download — show the
     * still portrait through the same matte rather than leaving an empty canvas.
     */
    let stillTried = false
    const useStill = () => {
      if (stillTried) return
      stillTried = true
      cancelAnimationFrame(raf)
      const still = new Image()
      still.crossOrigin = 'anonymous'
      still.onload = () => {
        cropRef.current = null
        paint(still, still.naturalWidth, still.naturalHeight)
      }
      still.src = VIDEO_STILL_SRC
    }

    video.addEventListener('error', useStill)
    if (!video.canPlayType('video/mp4; codecs="avc1.42E01E"')) useStill()

    const onPlay = () => {
      playingRef.current = true
      framedRef.current = false
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
      video.play()?.catch(() => {
        playingRef.current = false
      })
    }
    canvas.addEventListener('chordroller:react', onPlay)

    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', useStill)
      canvas.removeEventListener('chordroller:react', onPlay)
    }
  }, [])

  /*
   * Changing the size wipes him off the screen unless he is drawn again.
   *
   * Writing width or height on a canvas resets its bitmap — that is the spec, not a
   * quirk — so the moment the size setting moves, the canvas is blank. While he is
   * standing still there is no animation running to fill it back in: the draw loop
   * deliberately holds the first matted frame rather than re-matting it sixty times
   * a second, so nothing repaints and he simply disappears.
   */
  useEffect(() => {
    framedRef.current = false
    repaintRef.current?.()
  }, [size])

  const h = Math.round(size * 1.18)
  return (
    <>
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} width={size} height={h} style={{ width: size, height: h }} data-coco-canvas />
    </>
  )
}

/** The two-frame pixel Coco. */
function PixelSprite({ size }) {
  const [frame, setFrame] = useState(0)
  const timers = useRef({ flip: 0, end: 0 })
  const imgRef = useRef(null)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return undefined
    const react = () => {
      clearInterval(timers.current.flip)
      clearTimeout(timers.current.end)
      setFrame(1)
      timers.current.flip = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), PIXEL_FRAME_MS)
      timers.current.end = setTimeout(() => {
        clearInterval(timers.current.flip)
        setFrame(0)
      }, PIXEL_REACT_MS)
    }
    el.addEventListener('chordroller:react', react)
    return () => {
      el.removeEventListener('chordroller:react', react)
      clearInterval(timers.current.flip)
      clearTimeout(timers.current.end)
    }
  }, [])

  return (
    <img
      ref={imgRef}
      src={PIXEL_FRAMES[frame]}
      alt=""
      draggable={false}
      width={size}
      style={{ width: size, height: 'auto', imageRendering: 'pixelated' }}
      data-pixel-img
    />
  )
}

export function CocoLayer() {
  const charMode = useStore((s) => s.charMode)
  const charSize = useStore((s) => s.charSize)
  const scale = charSize / 100

  const react = (selector) => () => {
    document.querySelector(selector)?.dispatchEvent(new CustomEvent('chordroller:react'))
  }

  return (
    <div className="char-layer">
      {charMode !== 'pixel' && (
        <Character which="koko" size={Math.round(BASE.video * scale)} onTap={react('[data-coco-canvas]')} />
      )}
      {charMode !== 'video' && (
        <Character which="pix" size={Math.round(BASE.pixel * scale)} onTap={react('[data-pixel-img]')} />
      )}
    </div>
  )
}
