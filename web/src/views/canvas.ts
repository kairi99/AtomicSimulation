// Shared plumbing for the canvas views: design tokens read from CSS, DPR-aware sizing, reduced motion.
// Canvas code never hard-codes a colour: it reads the palette, which follows the theme.

import type { Apparatus } from '../apparatus/apparatus'

const COLOURS = [
  'label', 'label-2', 'label-3', 'separator', 'fill', 'surface', 'surface-2', 'accent', 'led-on',
  'danger', 'phys-kalpha', 'phys-kalpha-text', 'phys-kbeta', 'phys-continuum', 'phys-beam', 'phys-crystal', 'phys-constructive',
  'led-bg', 'bench-housing', 'bench-trim', 'bench-ink', 'bench-metal', 'bench-glass', 'bench-table',
  'bench-edge', 'bench-panel', 'bench-white', 'bench-black', 'bench-steel', 'bench-alu', 'bench-brass', 'bench-bronze',
  'bench-copper', 'bench-iron', 'bench-zirc', 'bench-silver', 'bench-amber', 'bench-crystal',
] as const // prettier-ignore
export type Palette = Record<(typeof COLOURS)[number], string> & { caption: string; footnote: string; font: string; mono: string }

export let palette = {} as Palette
/** Bumped whenever the palette is re-read: views compare it to know they must redraw. */
export let paletteVersion = 0

export function readPalette(): void {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(`--${name}`).trim()
  palette = Object.fromEntries(COLOURS.map((c) => [c, v(c)])) as Palette
  palette.caption = v('text-caption')
  palette.footnote = v('text-footnote')
  palette.font = v('font')
  palette.mono = v('font-mono')
  paletteVersion++
}

let motionQuery: MediaQueryList | undefined
/** Lazy, so modules importing this one stay loadable in tests (no matchMedia in Node). */
export const reducedMotion = (): boolean =>
  (motionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')).matches

/** Device pixels per CSS pixel, capped at 2: sharper is not visible on a phone, only slower. */
export function dpr(): number {
  return Math.min(devicePixelRatio || 1, 2)
}

/** Keep the canvas backing store at its CSS size × dpr(). Resizing clears the canvas after this frame's
 * draw, so `onResize` must redraw right away or the view blinks empty for a frame. */
export function watchSize(canvas: HTMLCanvasElement, onResize: () => void): void {
  new ResizeObserver(([e]) => {
    canvas.width = Math.round(e.contentRect.width * dpr())
    canvas.height = Math.round(e.contentRect.height * dpr())
    onResize()
  }).observe(canvas)
}

/** A CSS font token ("500 11px/13px …") at `scale` × its size, for a canvas drawn in device pixels. */
export function scaledFont(token: string, scale: number): string {
  return token.replace(/([\d.]+)px\/[\d.]+px/, (_, px) => `${Number(px) * scale}px`)
}

const SPRING_K = 300 // bragg-ui motion.md: the arms ease within an ADJUST step
const SPRING_C = 30

/** Displayed arm angles in 0.1°, shared by the 2D and 3D goniometers so both show the same thing: eased
 * toward the apparatus after an ADJUST jump, equal to it while the motor drives or with reduced motion. */
export function armEaser(a: Apparatus) {
  const e = {
    t: a.target,
    s: a.sensor,
    vt: 0,
    vs: 0,
    step(dtS: number): void {
      if (a.moving || reducedMotion()) {
        e.t = a.target
        e.s = a.sensor
        e.vt = e.vs = 0
        return
      }
      const h = Math.min(dtS, 1 / 30) // semi-implicit Euler stays stable at this step
      e.vt += (SPRING_K * (a.target - e.t) - SPRING_C * e.vt) * h
      e.vs += (SPRING_K * (a.sensor - e.s) - SPRING_C * e.vs) * h
      e.t += e.vt * h
      e.s += e.vs * h
      if (Math.abs(a.target - e.t) < 0.01 && Math.abs(e.vt) < 0.01) [e.t, e.vt] = [a.target, 0]
      if (Math.abs(a.sensor - e.s) < 0.01 && Math.abs(e.vs) < 0.01) [e.s, e.vs] = [a.sensor, 0]
    },
  }
  return e
}
