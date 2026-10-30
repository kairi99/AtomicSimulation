// The control panel's face of the 3D bench as a canvas texture: a light-grey plate with the dark LED window (two rows of red
// 7-segment digits with dot-matrix units and the mode letter), the ADJUST label, and the keys with their LEDs. Laid out in cm
// from the panel's top-left corner; the ADJUST knob itself is a real 3D knob placed by bench.ts at KNOB_CM.
// Pure drawing: no three.js, no DOM beyond the 2D context it is given.
import type { Key } from '../apparatus/apparatus'
import type { Display } from '../apparatus/apparatus'
import type { Palette } from './canvas'

export const KNOB_CM = { x: 4.7, y: 12.7, r: 2.2 }

/** Where each key sits (key centre, LED centre, label anchor), cm from the panel's top-left. */
const KEYS: Record<Key, { x: number; y: number; led: [number, number]; label: [number, number, CanvasTextAlign] }> = {
  U: { x: 13.4, y: 9.3, led: [11.55, 9.3], label: [11.95, 9.3, 'left'] },
  I: { x: 13.4, y: 11.06, led: [11.55, 11.06], label: [11.95, 11.06, 'left'] },
  DT: { x: 13.4, y: 12.82, led: [11.55, 12.82], label: [11.95, 12.82, 'left'] },
  DBETA: { x: 13.4, y: 14.58, led: [11.55, 14.58], label: [11.95, 14.58, 'left'] },
  LIMITS: { x: 13.4, y: 16.34, led: [11.55, 16.34], label: [11.95, 16.34, 'left'] },
  SENSOR: { x: 3.2, y: 20.4, led: [3.2, 18.7], label: [3.2, 19.45, 'center'] },
  TARGET: { x: 4.95, y: 20.4, led: [4.95, 18.7], label: [4.95, 19.45, 'center'] },
  COUPLED: { x: 6.7, y: 20.4, led: [6.7, 18.7], label: [6.7, 19.45, 'center'] },
  ZERO: { x: 10.3, y: 20.4, led: [10.3, 18.7], label: [10.3, 19.55, 'center'] },
  RESET: { x: 3.45, y: 26.4, led: [3.45, 24.4], label: [3.45, 25.2, 'center'] },
  REPLAY: { x: 5.2, y: 26.4, led: [5.2, 24.4], label: [5.2, 25.2, 'center'] },
  SCAN: { x: 6.95, y: 26.4, led: [6.95, 24.4], label: [6.95, 25.2, 'center'] },
  SPEAKER: { x: 8.7, y: 26.4, led: [8.7, 24.4], label: [8.7, 25.2, 'center'] },
  HV: { x: 10.45, y: 26.4, led: [10.45, 24.4], label: [10.45, 25.2, 'center'] },
}

// Segments a b c d e f g of a 7-segment digit, by character.
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg',
  '9': 'abcdfg', '-': 'g', E: 'adefg', S: 'acdfg', A: 'abcefg', F: 'aefg', O: 'abcdef', R: 'eg', N: 'ceg', K: 'bcefg', L: 'def',
  P: 'abefg', H: 'bcefg', U: 'bcdef', C: 'adef', D: 'bcdeg', T: 'defg',
} // prettier-ignore

// 5 × 7 dot-matrix glyphs of the unit and mode characters.
const DOTS: Record<string, string[]> = {
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  '°': ['.##..', '#..#.', '.##..', '.....', '.....', '.....', '.....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  '▼': ['.....', '#####', '.###.', '..#..', '.....', '.....', '.....'],
  '▲': ['..#..', '.###.', '#####', '.....', '.....', '.....', '.....'],
  '⧗': ['#####', '.###.', '..#..', '..#..', '.#.#.', '.###.', '#####'],
} // prettier-ignore

export type PanelState = {
  display: Display
  lamp: boolean // the HV lamp (blinks)
  top: boolean // the top row is lit (blinks on an alert)
  bottom: boolean
  modeLetter: string // T, S or C
  selected: (k: Key) => boolean
  labels: (k: Key) => string
  adjust: string
  reduced: boolean
}

export function drawPanelFace(c: CanvasRenderingContext2D, P: Palette, st: PanelState, k: number): void {
  const [W, H] = [c.canvas.width, c.canvas.height]
  c.clearRect(0, 0, W, H)
  c.fillStyle = P['bench-panel']
  c.fillRect(0, 0, W, H)
  c.shadowBlur = 0
  // the LED window, with a faint reflection
  const win = { x: 1.2, y: 0.9, w: 13.1, h: 7.3 }
  c.fillStyle = P['led-bg']
  c.beginPath()
  c.roundRect(win.x * k, win.y * k, win.w * k, win.h * k, 0.2 * k)
  c.fill()
  const sheen = c.createLinearGradient(win.x * k, win.y * k, (win.x + win.w) * k, (win.y + win.h) * k)
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)')
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)')
  c.fillStyle = sheen
  c.fill()
  const d = st.display
  if (st.reduced && d.flashBottom) {
    c.strokeStyle = P.danger // a steady cue instead of blinking
    c.lineWidth = 0.08 * k
    c.stroke()
  }
  digits(c, P, d.top, 9.6, 1.65, st.top, k)
  digits(c, P, d.bottom, 9.6, 4.9, st.bottom, k)
  dots(c, P, d.topUnit, 10.1, 2.25, st.top, k)
  dots(c, P, d.bottomUnit, 10.1, 5.5, st.bottom, k)
  dots(c, P, st.modeLetter, 11.5, 5.5, st.bottom, k)
  const sym = d.symbol === 'lower' ? '▼' : d.symbol === 'upper' ? '▲' : d.symbol === 'exposure' ? '⧗' : ''
  dots(c, P, sym, 12.9, 5.5, st.bottom, k)

  // ADJUST label (the knob is 3D), then the keys
  c.fillStyle = P['bench-trim']
  c.textBaseline = 'middle'
  c.textAlign = 'center'
  c.font = `500 ${0.4 * k}px ${P.font}`
  c.fillText(st.adjust, KNOB_CM.x * k, (KNOB_CM.y - KNOB_CM.r - 0.7) * k)
  for (const key of Object.keys(KEYS) as Key[]) {
    const p = KEYS[key]
    keyCap(c, p.x * k, p.y * k, 0.52 * k)
    const on = key === 'HV' ? st.lamp || st.selected(key) : st.selected(key)
    led(c, P, p.led[0] * k, p.led[1] * k, (key === 'HV' ? 0.2 : 0.11) * k, on, key === 'HV')
    c.fillStyle = P['bench-trim']
    c.textAlign = p.label[2]
    if (key === 'SPEAKER') {
      speaker(c, p.label[0] * k, p.label[1] * k, 0.36 * k)
      continue
    }
    const lines = st.labels(key).split(/\s+/)
    const long = lines.some((l) => l.length > 5)
    const fs = (long && p.label[2] === 'left' ? 0.3 : lines.length > 1 ? 0.32 : 0.38) * k
    c.font = `500 ${fs}px ${P.font}`
    const y0 = p.label[1] * k - ((lines.length - 1) * fs * 0.6)
    lines.forEach((l, i) => c.fillText(l, p.label[0] * k, y0 + i * fs * 1.2))
  }
}

function keyCap(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  g.addColorStop(0, '#4a4a4f')
  g.addColorStop(0.6, '#1c1c1f')
  g.addColorStop(1, '#0c0c0d')
  c.fillStyle = g
  c.beginPath()
  c.arc(x, y, r, 0, 2 * Math.PI)
  c.fill()
}

function led(c: CanvasRenderingContext2D, P: Palette, x: number, y: number, r: number, on: boolean, ring: boolean): void {
  if (ring) {
    c.strokeStyle = P['bench-trim']
    c.lineWidth = r * 0.28
    c.beginPath()
    c.arc(x, y, r * 1.25, 0, 2 * Math.PI)
    c.stroke()
  }
  c.beginPath()
  c.arc(x, y, r, 0, 2 * Math.PI)
  c.fillStyle = on ? P['led-on'] : P['led-bg']
  if (on) {
    c.shadowColor = P['led-on']
    c.shadowBlur = r * 2.2
  } else c.globalAlpha = 0.85
  c.fill()
  c.shadowBlur = 0
  c.globalAlpha = 1
}

function speaker(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath()
  c.moveTo(x - s * 0.9, y - s * 0.3)
  c.lineTo(x - s * 0.4, y - s * 0.3)
  c.lineTo(x + s * 0.2, y - s * 0.8)
  c.lineTo(x + s * 0.2, y + s * 0.8)
  c.lineTo(x - s * 0.4, y + s * 0.3)
  c.lineTo(x - s * 0.9, y + s * 0.3)
  c.closePath()
  c.fill()
  c.strokeStyle = c.fillStyle
  c.lineWidth = s * 0.14
  c.beginPath()
  c.arc(x + s * 0.2, y, s * 0.55, -0.9, 0.9)
  c.stroke()
}

/** 7-segment text, right-aligned at `xr`; a '.' attaches to the digit before it. Unlit segments stay faintly visible. */
function digits(c: CanvasRenderingContext2D, P: Palette, text: string, xr: number, y: number, lit: boolean, k: number): void {
  const cells: { ch: string; dp: boolean }[] = []
  for (const ch of text.toUpperCase()) {
    if (ch === '.' && cells.length) cells[cells.length - 1].dp = true
    else if (ch !== ' ') cells.push({ ch, dp: false })
  }
  const [cw, w, h, t] = [1.85, 1.35, 2.75, 0.3]
  cells.forEach((cell, i) => {
    const x = xr - (cells.length - i) * cw
    const set = SEG[cell.ch] ?? ''
    const half = y + h / 2
    const seg: Record<string, [number, number, number, number]> = {
      a: [x + t / 2, y, w - t, t], d: [x + t / 2, y + h - t, w - t, t], g: [x + t / 2, half - t / 2, w - t, t],
      f: [x, y + t / 2, t, h / 2 - t], b: [x + w - t, y + t / 2, t, h / 2 - t],
      e: [x, half + 0.02, t, h / 2 - t], c: [x + w - t, half + 0.02, t, h / 2 - t],
    }
    for (const [name, [sx, sy, sw, sh]] of Object.entries(seg)) {
      const on = lit && set.includes(name)
      c.fillStyle = P['led-on']
      c.globalAlpha = on ? 1 : 0.07
      c.shadowColor = P['led-on']
      c.shadowBlur = on ? 0.25 * k : 0
      c.beginPath()
      c.roundRect(sx * k, sy * k, sw * k, sh * k, 0.08 * k)
      c.fill()
    }
    c.shadowBlur = 0
    c.globalAlpha = 1
    if (!(cell.ch in SEG) && lit && cell.ch !== '.') {
      c.fillStyle = P['led-on']
      c.font = `${2.2 * k}px ${P.mono}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(cell.ch, (x + w / 2) * k, (y + h / 2) * k)
    }
    c.fillStyle = P['led-on']
    c.globalAlpha = cell.dp && lit ? 1 : 0.07
    c.beginPath()
    c.arc((x + w + 0.2) * k, (y + h - 0.12) * k, 0.12 * k, 0, 2 * Math.PI)
    c.fill()
    c.globalAlpha = 1
  })
}

/** Dot-matrix text (5 × 7 dots per character), top-left at (x, y) cm. */
function dots(c: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, lit: boolean, k: number): void {
  const pitch = 0.2
  let cx = x
  c.fillStyle = P['led-on']
  for (const ch of text) {
    const g = DOTS[ch]
    if (!g) continue
    for (let r = 0; r < 7; r++) {
      for (let q = 0; q < 5; q++) {
        const on = lit && g[r][q] === '#'
        c.globalAlpha = on ? 1 : 0.07
        c.shadowColor = P['led-on']
        c.shadowBlur = on ? 0.15 * k : 0
        c.beginPath()
        c.arc((cx + q * pitch) * k, (y + r * pitch) * k, 0.075 * k, 0, 2 * Math.PI)
        c.fill()
      }
    }
    cx += 6 * pitch
  }
  c.shadowBlur = 0
  c.globalAlpha = 1
}
