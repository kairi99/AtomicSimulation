// The 554 800 panel: LED displays, HV lamp, key groups, the ADJUST dial and the door interlock.
// Renders Apparatus state; every key goes to Apparatus.press.
import { AdjustAccel, adjustMultiplier, type Apparatus, type Key } from '../apparatus/apparatus'
import { t } from '../i18n'
import { windowLabel } from './exposure-table'

export const GROUPS: [keyof ReturnType<typeof t>, Key[]][] = [
  ['groupParams', ['U', 'I', 'DT', 'DBETA', 'LIMITS']],
  ['groupMode', ['SENSOR', 'TARGET', 'COUPLED', 'ZERO']],
  ['groupOps', ['RESET', 'REPLAY', 'SCAN', 'HV', 'SPEAKER']],
]
// Holding − or + repeats after HOLD_DELAY_MS every HOLD_REPEAT_MS, speeding up the longer it is held
// (×1 for the first second, then ×5, ×20 after 3 s): big changes are practical on touch screens.
const HOLD_DELAY_MS = 400
const HOLD_REPEAT_MS = 100
const DETENT_DEG = 15 // dial rotation per ADJUST step: 24 detents per turn
const WHEEL_PX = 40 // wheel/trackpad scroll per ADJUST step

/** Whether the LED next to key `k` is lit. The HTML panel and the 3D device face both show it. */
export function keySelected(a: Apparatus, k: Key): boolean {
  return (
    k === a.bottomKey || (k === 'LIMITS' && a.bottomKey.startsWith('LIMIT')) ||
    (k === 'SPEAKER' && a.speaker) || (k === 'REPLAY' && a.replayIndex !== null) ||
    (k === 'HV' && a.hvOn) || (k === 'SCAN' && a.programOn) || k === a.mode
  )
}

/** Builds the panel into `root`. `onDetent` fires on every ADJUST step (sound, haptics). */
export function mountPanel(root: HTMLElement, a: Apparatus, onDetent: () => void) {
  // Turning speed = detents in the last ADJUST_WINDOW_MS of a CONTINUOUS turn; discrete presses never accelerate.
  const accel = new AdjustAccel()
  let dialDeg = 0
  const detent = (dir: number, steps: number) => {
    a.adjust(dir * steps)
    dialDeg += dir * DETENT_DEG
    root.querySelector<HTMLElement>('[data-dial]')?.style.setProperty('--rot', `${dialDeg}deg`)
    onDetent()
  }
  const turn = (dir: number, coarse: boolean, continuous = false) => {
    detent(dir, (coarse ? 10 : 1) * accel.multiplier(performance.now(), continuous))
  }

  // − / + keys: press and hold.
  let hold: ReturnType<typeof setTimeout> | undefined
  const release = () => clearTimeout(hold)
  // Dial: circular drag, angle measured around its centre (clockwise = up).
  let grab: { cx: number; cy: number; last: number; acc: number } | null = null
  const angle = (e: PointerEvent, g: { cx: number; cy: number }) => (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    const dial = el.closest<HTMLElement>('[data-dial]')
    if (dial) {
      const r = dial.getBoundingClientRect()
      const g = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, last: 0, acc: 0 }
      g.last = angle(e, g)
      grab = g
      dial.setPointerCapture(e.pointerId)
      return
    }
    const b = el.closest<HTMLElement>('[data-adjust]')
    if (!b) return
    const dir = Number(b.dataset.adjust)
    const t0 = performance.now()
    turn(dir, false)
    const repeat = () => {
      detent(dir, adjustMultiplier((5 * (performance.now() - t0 - HOLD_DELAY_MS)) / 1000))
      hold = setTimeout(repeat, HOLD_REPEAT_MS)
    }
    release()
    hold = setTimeout(repeat, HOLD_DELAY_MS)
  })
  root.addEventListener('pointermove', (e) => {
    if (!grab) return
    const now = angle(e, grab)
    grab.acc += ((now - grab.last + 540) % 360) - 180 // shortest way round
    grab.last = now
    for (; grab.acc >= DETENT_DEG; grab.acc -= DETENT_DEG) turn(1, false, true)
    for (; grab.acc <= -DETENT_DEG; grab.acc += DETENT_DEG) turn(-1, false, true)
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) root.addEventListener(ev, release, true)
  // Not the element blur: pressing a key moves focus off the previous key, which would kill the repeat at once.
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', release)
  for (const ev of ['pointerup', 'pointercancel'] as const) root.addEventListener(ev, () => (grab = null), true)
  let wheel = 0
  root.addEventListener(
    'wheel',
    (e) => {
      if (!(e.target as HTMLElement).closest('[data-dial]')) return
      e.preventDefault()
      wheel -= e.deltaMode === 0 ? e.deltaY : e.deltaY * WHEEL_PX
      for (; wheel >= WHEEL_PX; wheel -= WHEEL_PX) turn(1, false, true)
      for (; wheel <= -WHEEL_PX; wheel += WHEEL_PX) turn(-1, false, true)
    },
    { passive: false },
  )
  // Arrow keys turn ADJUST while the focus is in the panel (not on the page's other controls).
  root.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
    if (dir === undefined) return
    e.preventDefault()
    turn(dir, e.shiftKey, e.repeat) // a held key repeats; separate presses are discrete
  })

  const build = () => {
    const s = t()
    root.innerHTML = `
      <div class="displays" role="group" aria-label="${s.displays}">
        <span class="lamp" data-lamp role="img"></span>
        <div class="led" role="group" aria-label="${s.topDisplay}"><output data-top></output><span class="unit" data-top-unit></span></div>
        <div class="led" role="group" aria-label="${s.bottomDisplay}"><output data-bottom></output><span class="unit" data-bottom-unit></span><span class="sym" data-sym></span></div>
      </div>
      <p class="alert-msg" role="status" data-alert></p>
      <p class="hint" data-slot></p>
      <p class="hint" role="status" data-saturated></p>
      <div class="controls">
        ${GROUPS.map(([g, keys]) => `
          <div class="group" role="group" aria-label="${s[g]}" data-group="${g}">
            <h2>${s[g]}</h2>
            <div class="keys">${keys.map((k) => `<button class="key" data-key="${k}" aria-label="${s.keys[k][1]}">${s.keys[k][0]}</button>`).join('')}</div>
          </div>`).join('')}
        <div class="group adjust" role="group" aria-label="${s.adjust}">
          <h2>${s.adjust}</h2>
          <div class="adjust-row">
            <button class="key step" data-adjust="-1" aria-label="${s.adjustDown}">−</button>
            <div class="dial" data-dial tabindex="0" role="spinbutton" aria-label="${s.adjust}" aria-describedby="adjust-hint"
              style="--rot: ${dialDeg}deg"><span class="dial-mark"></span></div>
            <button class="key step" data-adjust="1" aria-label="${s.adjustUp}">+</button>
          </div>
          <p class="hint" id="adjust-hint">${s.adjustHint}</p>
        </div>
      </div>
      <div class="device-row">
        <p class="hint" data-replay></p>
        <span class="doors">${s.doors} <button class="key" data-doors></button></span>
      </div>`
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    const d = b.dataset
    if (d.key) a.press(d.key as Key)
    else if (d.adjust && (e as MouseEvent).detail === 0) turn(Number(d.adjust), false) // keyboard; pointers use pointerdown
    else if (d.doors !== undefined) a.setDoors(!a.doorsClosed)
  })

  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!
  // Write only on change: the panel renders every frame, and each DOM write restyles it.
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text
  }
  const setAttr = (el: HTMLElement, name: string, value: string | null) => {
    if (el.getAttribute(name) !== value) value === null ? el.removeAttribute(name) : el.setAttribute(name, value)
  }
  const render = () => {
    const s = t()
    const d = a.display()
    setText(q('[data-top]'), d.top)
    setText(q('[data-top-unit]'), d.topUnit)
    setText(q('[data-bottom]'), d.bottom)
    setText(q('[data-bottom-unit]'), d.bottomUnit)
    setText(q('[data-sym]'), d.symbol === 'lower' ? '▼' : d.symbol === 'upper' ? '▲' : d.symbol === 'exposure' ? '⧗' : '')
    setAttr(q('[data-sym]'), 'title', d.symbol ? s[({ lower: 'symLower', upper: 'symUpper', exposure: 'symExposure' } as const)[d.symbol]] : null)
    q('[data-top]').parentElement!.classList.toggle('blink', d.blinkTop)
    setText(q('[data-alert]'), d.alert ? s[({ mode: 'alertMode', limits: 'alertLimits', doors: 'alertDoors', detector: 'alertDetector', detectorReset: 'alertDetectorReset' } as const)[d.alert]] : '')
    setText(q('[data-slot]'), windowLabel(a))
    setText(q('[data-saturated]'), a.saturated ? s.saturated : '')
    q('[data-group="groupMode"]').classList.toggle('alert', d.alert === 'mode') // the keys that are missing
    q('[data-bottom]').parentElement!.classList.toggle('blink', d.flashBottom)
    const dial = q('[data-dial]')
    setAttr(dial, 'aria-valuetext', `${d.bottom} ${d.bottomUnit}`)
    setAttr(dial, 'aria-valuenow', Number.isFinite(parseFloat(d.bottom)) ? String(parseFloat(d.bottom)) : null)
    const lamp = q('[data-lamp]')
    lamp.classList.toggle('on', d.hvLamp)
    setAttr(lamp, 'aria-label', d.hvLamp ? s.hvOn : s.hvOff)
    for (const b of root.querySelectorAll<HTMLElement>('[data-key]')) {
      setAttr(b, 'aria-pressed', String(keySelected(a, b.dataset.key as Key)))
    }
    setText(q('[data-replay]'), a.replayIndex === null ? '' : `${s.replayPoints} ${a.replayIndex + 1} / ${a.replay.length}`)
    const doors = q('[data-doors]')
    setText(doors, a.doorsClosed ? s.doorsClosed : s.doorsOpen)
    setAttr(doors, 'disabled', a.hvOn || a.busy ? '' : null)
    setAttr(doors, 'title', a.hvOn || a.busy ? s.doorsLocked : null)
  }

  /** A guided task's keys are emphasised; the others stay as they are (dimming would read as disabled). */
  let focusKeys: Key[] | null = null
  const focus = (keys: Key[] | null) => {
    focusKeys = keys
    for (const b of root.querySelectorAll<HTMLElement>('[data-key]')) {
      b.toggleAttribute('data-task', keys?.includes(b.dataset.key as Key) ?? false)
    }
  }
  const rebuild = () => {
    build()
    focus(focusKeys)
  }

  build()
  return { build: rebuild, render, focus, dialDeg: () => dialDeg }
}
