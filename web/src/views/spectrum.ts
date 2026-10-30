// Live spectrum: the stored scan points (angle, mean rate over Δt) as they arrive, drawn with uPlot.
// Linear or log y. The axes are fixed for a scan: x spans the limits, the linear y range only steps up
// when a point exceeds it, and log y is fixed. Data never makes the axes jump point by point.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { crystalOf, type Apparatus, type Setup } from '../apparatus/apparatus'
import { t } from '../i18n'
import { downloadCsv, downloadExposureCsv } from '../pedagogy/csv'
import { foilsOf, hasActiveTask } from '../pedagogy/task'
import { showHints } from '../pedagogy/mode'
import { MIN_PROMINENCE_SIGMA, lineProminenceSigma, strongestLineRatePerS } from '../physics/analysis'
import { D_NACL_PM, HC_KEV_PM, K_EDGE_KEV, MO_KA_PM, MO_KB_PM } from '../physics/constants'
import { allowedOrders, lambdaFromTheta, NACL, thetaFromLambda } from '../physics/crystal'
import { lambdaMinPm } from '../physics/source'
import { palette, paletteVersion, scaledFont } from './canvas'

export const LOG_RANGE = { min: 0.1, max: 1e5 } // 1/s: reaches the 0.2/s background
const GAINS = [10, 100] as const // linear display zoom (a simulation aid): the y range is [0, yMax / zoom]; pressing the active one goes back to ×1
const EMPTY_RANGE = { min: 0, max: 30 } // °, before the first scan
export const SUP: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
// Explore mode: Bragg angles θₙ of the Mo K lines for every allowed order the crystal reaches (n ≤ 2d/λ; extinct orders,
// such as Si 2, 6, 10 …, have no line). NaCl in the usual 0–30° window shows n = 1–4 (Kα reflects up to n = 7); a large-d
// crystal such as muscovite has many more (the label thinning below keeps them legible).
// `row` keeps Kα labels on the first row and Kβ on the second.
export const lineMarkers = (dPm: number, orders: readonly number[] = allowedOrders(NACL)) =>
  orders.flatMap((n) =>
    [
      { label: `${n}·Kα`, theta: thetaFromLambda(MO_KA_PM, n, dPm), colour: 'phys-kalpha-text' as const, row: 0 },
      { label: `${n}·Kβ`, theta: thetaFromLambda(MO_KB_PM, n, dPm), colour: 'phys-kbeta' as const, row: 1 },
    ].filter((m) => !Number.isNaN(m.theta)),
  )

/** K-edge angles (°) of the foils in a setup, first order: the practice and the step in T(λ) that students read are n = 1. */
export function edgeMarkers(setup: Setup, dPm = D_NACL_PM): { el: string; theta: number }[] {
  const els = [...new Set([setup.collimatorFilter, setup.sensorFilter])].filter((el): el is string => el != null && el in K_EDGE_KEV)
  return els.map((el) => ({ el, theta: thetaFromLambda(HC_KEV_PM / K_EDGE_KEV[el as keyof typeof K_EDGE_KEV], 1, dPm) })).filter((m) => !Number.isNaN(m.theta))
}

/** Allowed orders of the crystal a stored scan was made with (NaCl when its holder was no crystal). */
export const scanOrders = (setup: Setup): number[] => allowedOrders(setup.holder === 'crystal' ? crystalOf(setup) : NACL)

/** Plane spacing (pm) of the crystal a stored scan was made with; NaCl when its holder was no crystal. */
export const scanD = (setup: Setup): number => (setup.holder === 'crystal' ? crystalOf(setup).d_pm : D_NACL_PM)

/** The powers of ten within [min, max] (the log axis' grid). */
export const decades = (min: number, max: number): number[] => {
  const out: number[] = []
  for (let n = Math.ceil(Math.log10(min) - 1e-9); n <= Math.log10(max) + 1e-9; n++) out.push(10 ** n)
  return out
}

/** Smallest 1-2-5 × 10ⁿ at or above x (at least 10). */
export function niceCeil(x: number): number {
  for (let p = 10; ; p *= 10) for (const m of [1, 2, 5]) if (m * p >= x) return m * p
}

type Scan = NonNullable<Apparatus['lastScan']>
export type Lever = 'dt' | 'i' | 'u' | 'filter'
/** A weak-signal notice: what it says (`kind`), the zoom its button applies (0 = no button) and the figures it quotes. */
export type WeakNotice =
  | { kind: 'buried'; zoom: 0; levers: Lever[] }
  | { kind: 'small'; zoom: 10 | 100; levers: [] }
  | { kind: 'sparse'; zoom: 0; n: number; pct: number; levers: Lever[] }
  | { kind: 'squashed'; zoom: 10 | 100; levers: [] }

const DT_MAX_S = 9999 // device limits of Δt, I (0.01 mA units) and U (0.1 kV units)
const I_MAX = 100
const U_MAX = 350
const SMALL_FRAC = 0.05 // a line below this share of the plot height, or a median rate below it, is "small"
const MIN_COUNTS = 100 // fewer counts per point than this: the relative noise 1/√N exceeds 10 %

/** "a, b or c" with the language's "or". */
export const joinOr = (items: string[], or: string): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${or} ${items.at(-1)}`

/** Simulation aid with hints shown (Explore), from the expected rate R̄ alone (never the noisy points): the strongest Mo K line in the
 * scanned window of a COUPLED scan on a crystal, buried under MIN_PROMINENCE_SIGMA (more statistics, not a zoom, helps) or clear but under
 * 5 % of the plot height (a zoom helps). Null when no line lies in the window or the holder has no crystal (no Bragg signal). */
export function modelNotice(scan: Scan, loDeg: number, hiDeg: number, yMax: number, task = hasActiveTask()): WeakNotice | null {
  if (scan.setup.holder !== 'crystal') return null
  const crystal = crystalOf(scan.setup)
  const [u, i, filters] = [scan.u / 10, scan.i / 100, foilsOf(scan.setup)]
  const peak = strongestLineRatePerS(loDeg, hiDeg, u, i, filters, crystal)
  if (!(peak > 0)) return null
  if (lineProminenceSigma(loDeg, hiDeg, u, i, scan.dt, filters, crystal) < MIN_PROMINENCE_SIGMA) {
    const levers: Lever[] = []
    if (scan.dt < DT_MAX_S) levers.push('dt')
    if (scan.i < I_MAX) levers.push('i')
    if (scan.u < U_MAX) levers.push('u')
    if (filters.length > 0 && !task) levers.push('filter')
    return { kind: 'buried', zoom: 0, levers }
  }
  if (peak >= SMALL_FRAC * yMax) return null
  const off = (g: number) => Math.abs((peak * g) / yMax - 0.5) // the zoom that puts the line closest to half the plot
  return { kind: 'small', zoom: off(10) <= off(100) ? 10 : 100, levers: [] }
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Simulation aid with hints hidden (Lab, or a task hiding them): only what a real experimenter has, the stored points. Few counts per
 * point (median N < 100: say 1/√N, no zoom), else most of the scan squashed under 5 % of the plot height (zoom ×10 or ×100, the larger
 * that keeps 90 % of the points on scale). It never uses the model or where the lines are. */
export function dataNotice(rates: readonly number[], dtS: number, yMax: number, iMax = false, dtMax = false): WeakNotice | null {
  if (rates.length === 0) return null
  const n = median(rates.map((r) => r * dtS))
  if (n < MIN_COUNTS) {
    return { kind: 'sparse', zoom: 0, n: Math.round(n), pct: Math.min(100, Math.round(100 / Math.sqrt(Math.max(n, 1)))), levers: [...(dtMax ? [] : ['dt' as const]), ...(iMax ? [] : ['i' as const])] }
  }
  if (median([...rates]) >= SMALL_FRAC * yMax) return null
  const fits = (g: number) => rates.filter((r) => r <= yMax / g).length >= 0.9 * rates.length
  return { kind: 'squashed', zoom: fits(100) ? 100 : 10, levers: [] }
}

export function mountSpectrum(root: HTMLElement, a: Apparatus) {
  let log = false
  let plot: uPlot | null = null
  let builtPalette = -1
  let scan = a.lastScan
  let shown = 0
  let yMax = 10
  let gain = 1 // 1 or a GAINS value: linear view only; back to ×1 with every new scan
  let weak: { scan: Scan; notice: WeakNotice | null } | null = null
  let menuOpen = false
  let labels: { text: string; x: number; y: number; colour: string }[] = [] // Kα/Kβ and K-edge labels, painted over the clip caps
  let builtHints = showHints()
  let version = 0 // bumped after every uPlot draw (it draws in a microtask): the 3D monitor copies the canvas then
  const xs: number[] = []
  const ys: number[] = []
  const data = (): uPlot.AlignedData => [xs, log ? ys.map((y) => (y > 0 ? y : null)) : ys] // log: no zeros

  root.innerHTML = `<span class="visually-hidden" role="status" data-status></span><div class="view-head" data-head></div>
    <div class="plot" data-plot><output class="readout" data-readout></output><p class="empty" data-empty><span></span></p></div>`
  const head = root.querySelector<HTMLElement>('[data-head]')!
  const status = root.querySelector<HTMLElement>('[data-status]')! // the one live region: a rebuilt header would re-announce
  const box = root.querySelector<HTMLElement>('[data-plot]')!
  const empty = root.querySelector<HTMLElement>('[data-empty]')!

  let emptyText = ''
  /** The empty-plot message follows the state (exposure series have no spectrum); written only on change. */
  const emptyMessage = () => {
    const s = t()
    const m = a.exposureLog.length
    return a.phase === 'exposure' ? s.spectrumExposing : m > 0 ? s.spectrumExposures(m) : s.spectrumEmpty
  }
  const emptyShort = () => {
    const m = a.exposureLog.length
    return a.phase === 'exposure' ? t().spectrumExposing : m > 0 ? t().spectrumExposuresShort(m) : t().spectrumEmpty
  }
  const setEmpty = () => {
    const txt = emptyMessage()
    if (txt !== emptyText) empty.firstElementChild!.textContent = emptyText = txt
  }

  const xRange = () => {
    if (!scan) return EMPTY_RANGE
    const [lo, hi] = [scan.first / 10, scan.last / 10]
    return lo === hi ? { min: lo - 1, max: hi + 1 } : { min: lo, max: hi }
  }
  const setY = () => plot?.setScale('y', log ? LOG_RANGE : { min: 0, max: yMax / gain })

  const build = () => {
    const s = t()
    head.innerHTML = `
      <h2>${s.spectrum}</h2>
      <div class="view-tools">
        <div class="seg" role="group" aria-label="${s.scale}">
          <button data-log="0" aria-pressed="${!log}">${s.linear}</button>
          <button data-log="1" aria-pressed="${log}">${s.log}</button>
        </div>
        <div class="seg" role="group" aria-label="${s.zoomLabel}"${log ? ' hidden' : ''}>
          ${GAINS.map((g) => `<button data-gain="${g}" aria-pressed="${g === gain}">×${g}</button>`).join('')}
        </div>
        <div class="menu-wrap">
          <button class="tool more" data-more aria-label="${s.exportMenu}" title="${s.exportMenu}" aria-haspopup="menu" aria-expanded="false">⋯</button>
          <div class="menu" role="menu" data-menu hidden>
            <button role="menuitem" data-csv title="${s.csvLabel}. ${s.csvHint}" disabled>${s.csvDownload}</button>
            <button role="menuitem" data-csv-exp hidden></button>
            <hr data-sep hidden>
            <button role="menuitem" class="danger" data-csv-clear title="${s.clearExposuresLabel}" aria-label="${s.clearExposuresLabel}" hidden>${s.clearExposures}</button>
          </div>
        </div>
      </div>
      <p class="hint weak" data-weak hidden><span></span><button class="tool" data-amplify hidden></button></p>`
    menuOpen = false
    emptyText = ''
    setEmpty()
    const readout = box.querySelector<HTMLElement>('[data-readout]')!
    const explore = showHints()
    empty.hidden = xs.length > 0
    const P = palette
    const font = scaledFont(P.caption, 1)
    const labelFont = scaledFont(P.footnote, 1)
    const axis = { stroke: P['label-2'], font, labelFont, ticks: { stroke: P.separator, width: 1, size: 4 } }
    plot?.destroy()
    plot = new uPlot(
      {
        width: box.clientWidth,
        height: box.clientHeight,
        legend: { show: false },
        scales: { x: { time: false, auto: false }, y: { auto: false, distr: log ? 3 : 1, log: 10 } },
        axes: [
          { ...axis, grid: { show: false }, label: scan?.mode === 'SENSOR' ? s.axisSensor : s.axisTarget, labelSize: 22 },
          {
            ...axis,
            grid: { stroke: P.separator, width: 1 },
            ticks: { show: false },
            label: s.axisRate,
            labelSize: 22,
            size: 48,
            // log: grid and labels at the decades only, as 10ⁿ; linear: a decimal point whatever the locale, as the readout
            splits: log ? (_u, _i, min, max) => decades(min, max) : undefined,
            values: log
              ? (_, splits) => splits.map((v) => `10${[...String(Math.round(Math.log10(v)))].map((d) => SUP[d]).join('')}`)
              : (_, splits) => splits.map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))),
          },
        ],
        series: [{}, { stroke: P.label, width: 1.5, points: { size: 4, stroke: P.label, fill: P.label } }],
        cursor: {
          drag: { x: true, y: false },
          points: { size: 7, fill: P.accent, stroke: P.accent },
          // double click/tap: back to the whole scan
          bind: { dblclick: (u) => () => (u.setScale('x', xRange()), null) },
        },
        hooks: {
          draw: [
            (u) => {
              const { ctx, bbox } = u
              const k = uPlot.pxRatio
              ctx.save()
              // Points above the top edge (display zoom) are clipped: a small cap at the edge shows each one, so a clip is never silent.
              if (!log) {
                const top = yMax / gain
                ctx.fillStyle = P.label
                for (let i = 0; i < xs.length; i++) {
                  if (!(ys[i] > top)) continue
                  const x = u.valToPos(xs[i], 'x', true)
                  if (!(x >= bbox.left && x <= bbox.left + bbox.width)) continue
                  ctx.beginPath()
                  ctx.moveTo(x - 3 * k, bbox.top + 5 * k)
                  ctx.lineTo(x + 3 * k, bbox.top + 5 * k)
                  ctx.lineTo(x, bbox.top)
                  ctx.closePath()
                  ctx.fill()
                }
              }
              // The overlay labels last, with a halo in the surface colour: a clip cap or a data point never hides a name.
              ctx.font = scaledFont(P.caption, k)
              ctx.textBaseline = 'top'
              ctx.textAlign = 'center'
              ctx.lineJoin = 'round'
              ctx.lineWidth = 3 * k
              ctx.strokeStyle = P.surface
              for (const l of labels) {
                ctx.fillStyle = l.colour
                ctx.strokeText(l.text, l.x, l.y)
                ctx.fillText(l.text, l.x, l.y)
              }
              ctx.restore()
            },
            () => void version++,
          ],
          // Explore overlays, under the data: the band the tube cannot reach (λ < λmin at the present U)
          // the expected line angles and the K edges of the foils in the scan's setup. The x axis is β (θ) for
          // TARGET/COUPLED scans, 2θ for SENSOR scans.
          drawClear: [
            (u) => {
              labels = []
              if (!explore || !scan || scan.mode === 'TARGET') return // none on the empty axis
              const f = scan.mode === 'SENSOR' ? 2 : 1
              const { ctx, bbox } = u
              const k = uPlot.pxRatio
              const [left, right] = [bbox.left, bbox.left + bbox.width]
              ctx.save()
              ctx.font = scaledFont(P.caption, k)
              ctx.textBaseline = 'top'
              const m = ctx.measureText('Kα')
              const row = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
              // |angle| < f·θ(λmin): the tube emits nothing that short at the scan's U.
              const dPm = scanD(scan.setup)
              const th = thetaFromLambda(lambdaMinPm(scan.u / 10), 1, dPm)
              const edge = f * (Number.isNaN(th) ? 90 : th)
              const [x0, x1] = [Math.max(u.valToPos(-edge, 'x', true), left), Math.min(u.valToPos(edge, 'x', true), right)]
              if (x1 > x0) {
                ctx.fillStyle = P.fill
                ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height)
                ctx.fillStyle = P['label-2']
                ctx.textAlign = 'left'
                const band = t().lambdaMinBand
                if (empty.hidden && ctx.measureText(band).width < x1 - x0) ctx.fillText(band, x0 + 4 * k, bbox.top + bbox.height - row - 4 * k)
              }
              // a label closer than the widest one ("10·Kα") to the previous label of its row is left out; the hairline stays
              const minGap = ctx.measureText('10·Kα').width + 4 * k
              const lastLabel = [-Infinity, -Infinity]
              for (const l of lineMarkers(dPm, scanOrders(scan.setup))) {
                const x = Math.round(u.valToPos(f * l.theta, 'x', true))
                if (!(x >= left && x <= right)) continue
                const y = bbox.top + l.row * row // Kα and Kβ labels on alternate rows
                const kb = l.colour === 'phys-kbeta'
                if (x - lastLabel[l.row] >= minGap) {
                  labels.push({ text: l.label, x, y, colour: P[l.colour] })
                  lastLabel[l.row] = x
                }
                // Kβ dashed, so the two lines differ by more than colour
                ctx.strokeStyle = P[kb ? 'phys-kbeta' : 'phys-kalpha']
                ctx.lineWidth = k
                ctx.setLineDash(kb ? [2 * k, 2 * k] : [])
                ctx.beginPath()
                ctx.moveTo(x + k / 2, y + row)
                ctx.lineTo(x + k / 2, bbox.top + bbox.height)
                ctx.stroke()
              }
              // foil K edges (stored scan's setup) in label-2 grey, from the third row down, one row per foil
              // (Zr and Mo sit 0.7° apart); long dash, so not colour alone
              ctx.fillStyle = ctx.strokeStyle = P['label-2']
              ctx.lineWidth = k
              ctx.setLineDash([6 * k, 3 * k])
              for (const [i, e] of edgeMarkers(scan.setup, dPm).entries()) {
                const x = Math.round(u.valToPos(f * e.theta, 'x', true))
                if (!(x >= left && x <= right)) continue
                const y = bbox.top + (2 + i) * row
                const label = t().kEdge(e.el)
                const half = ctx.measureText(label).width / 2 // kept inside the plot at its ends
                labels.push({ text: label, x: Math.min(Math.max(x, left + half), right - half), y, colour: P['label-2'] })
                ctx.beginPath()
                ctx.moveTo(x + k / 2, y + row)
                ctx.lineTo(x + k / 2, bbox.top + bbox.height)
                ctx.stroke()
              }
              ctx.restore()
            },
          ],
          setCursor: [
            (u) => {
              const i = u.cursor.idx
              if (i == null || i >= xs.length) return void (readout.textContent = '')
              const [x, y] = [xs[i], ys[i]]
              const lam = explore && scan?.mode === 'COUPLED' ? ` · ${t().pathDiff} = ${lambdaFromTheta(x, 1, scanD(scan!.setup)).toFixed(1)} pm (= nλ)` : ''
              readout.textContent = `${x.toFixed(1)}° · ${y.toFixed(1)} 1/s${lam}`
            },
          ],
        },
      },
      data(),
      box,
    )
    plot.setScale('x', xRange())
    setY()
    builtPalette = paletteVersion
    builtHints = explore
  }

  const setGain = (g: number) => {
    gain = g
    for (const b of head.querySelectorAll<HTMLElement>('[data-gain]')) b.setAttribute('aria-pressed', String(+b.dataset.gain! === g))
    setY()
  }
  const menu = () => head.querySelector<HTMLElement>('[data-menu]')!
  const more = () => head.querySelector<HTMLButtonElement>('[data-more]')!
  const items = () => [...menu().querySelectorAll<HTMLButtonElement>('button:not([hidden]):not(:disabled)')]
  /** Export and data popover: open on the ⋯ button; Escape, an outside click or an action close it, focus back on the button. */
  const setMenu = (open: boolean, refocus = false) => {
    menuOpen = open
    menu().hidden = !open
    more().setAttribute('aria-expanded', String(open))
    if (open) items()[0]?.focus()
    else if (refocus) more().focus()
  }

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-more]')) return setMenu(!menuOpen)
    const act = target.closest<HTMLElement>('[data-menu] button')
    if (act) {
      setMenu(false, true)
      if (act.matches('[data-csv-exp]')) return downloadExposureCsv(a)
      if (act.matches('[data-csv-clear]')) {
        if (window.confirm(t().clearExposuresConfirm(a.exposureLog.length))) a.clearExposureLog()
        return
      }
      return downloadCsv(a)
    }
    if (target.closest('[data-amplify]') && weak?.notice?.zoom) {
      const g = weak.notice.zoom
      setGain(g)
      return head.querySelector<HTMLElement>(`[data-gain="${g}"]`)?.focus() // the notice leaves with the zoom: keep focus on the pressed button
    }
    const g = target.closest<HTMLButtonElement>('[data-gain]')
    if (g) return setGain(+g.dataset.gain! === gain ? 1 : +g.dataset.gain!)
    const b = target.closest<HTMLElement>('[data-log]')
    if (!b || (b.dataset.log === '1') === log) return
    log = !log
    build()
    head.querySelector<HTMLElement>(`[data-log="${b.dataset.log}"]`)?.focus() // the header was rebuilt
  })
  document.addEventListener('click', (e) => {
    if (menuOpen && !(e.target as HTMLElement).closest?.('.menu-wrap')) setMenu(false)
  })
  root.addEventListener('keydown', (e) => {
    if (!menuOpen) return
    if (e.key === 'Escape') {
      e.stopPropagation() // not the card behind
      return setMenu(false, true)
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
  })
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    plot?.setSize({ width, height })
  }).observe(box)

  /** The weak-signal notice (see modelNotice, dataNotice), computed once per finished scan: after a finished COUPLED scan on a linear
   * plot at ×1, with the holder on a crystal. Not while the scan runs, not for TARGET/SENSOR scans or exposures. */
  const syncWeak = (n: number) => {
    const el = head.querySelector<HTMLElement>('[data-weak]')!
    let text = ''
    let zoom = 0
    if (scan && scan.mode === 'COUPLED' && scan.setup.holder === 'crystal' && !scan.changed && n > 0 && n === shown && !a.busy && !log && gain === 1) {
      if (weak?.scan !== scan) {
        const [lo, hi] = [xs[0], xs[n - 1]]
        weak = { scan, notice: showHints() ? modelNotice(scan, lo, hi, yMax) : dataNotice(ys, scan.dt, yMax, scan.i >= I_MAX, scan.dt >= DT_MAX_S) }
      }
      const w = weak.notice
      if (w) {
        const s = t()
        zoom = w.zoom
        const lev = (ks: Lever[]) => joinOr(ks.map((k) => s.weakLevers[k]), s.weakOr)
        text =
          w.kind === 'buried' ? s.weakBuried(lev(w.levers))
          : w.kind === 'small' ? s.weakSmall
          : w.kind === 'squashed' ? s.weakSquashed
          : s.weakSparse(w.n, w.pct, s.weakSparseLevers(w.levers.includes('dt'), w.levers.includes('i')))
      }
    }
    const [msg, btn] = [el.firstElementChild!, el.lastElementChild as HTMLButtonElement]
    if (msg.textContent !== text) msg.textContent = text
    if (status.textContent !== text) status.textContent = text // read out once, not with every header rebuild
    if (el.hidden !== (text === '')) el.hidden = text === ''
    if (btn.hidden !== (zoom === 0)) btn.hidden = zoom === 0
    if (zoom && btn.textContent !== t().amplify) btn.textContent = t().amplify
  }

  const render = () => {
    if (paletteVersion !== builtPalette || showHints() !== builtHints) build()
    if (a.lastScan !== scan) {
      // A new scan (or none): start over with its range.
      scan = a.lastScan
      xs.length = ys.length = shown = 0
      yMax = 10
      gain = 1
      weak = null
      build()
    }
    const n = scan ? a.replay.length : 0
    const csv = head.querySelector<HTMLButtonElement>('[data-csv]')!
    if (csv.disabled !== (n === 0)) csv.disabled = n === 0
    // Simulation aid: the exposure series (EPN P1) has its own export, shown once an exposure is logged.
    const exp = head.querySelector<HTMLButtonElement>('[data-csv-exp]')!
    const m = a.exposureLog.length
    const noScan = n === 0 && m > 0 // exposures only: one export item, not two
    if (csv.hidden !== noScan) csv.hidden = noScan
    setEmpty()
    if (exp.dataset.n !== String(m)) {
      exp.dataset.n = String(m)
      exp.hidden = m === 0
      exp.textContent = t().csvExposures(m)
      exp.title = `${t().csvExposuresLabel(m)}. ${t().csvHint}`
      head.querySelector<HTMLButtonElement>('[data-csv-clear]')!.hidden = m === 0
      head.querySelector<HTMLElement>('[data-sep]')!.hidden = m === 0
      exp.setAttribute('aria-label', exp.title)
    }
    if (n !== shown) {
      if (n < shown) xs.length = ys.length = shown = 0
      for (; shown < n; shown++) {
        const p = a.replay[shown]
        xs.push(p.angle / 10)
        ys.push(p.rate)
        if (p.rate > yMax) yMax = niceCeil(p.rate * 1.05)
      }
      empty.hidden = n > 0 // before the redraw: the band caption shows only without it
      // Default resetScales: re-applies the fixed x range (x has auto: false), which recomputes the visible index
      // window and commits a redraw. With `false`, a plot built while empty keeps its empty window and never draws.
      plot!.setData(data())
      setY()
    }
    syncWeak(n) // after the points: it reads the finished scan's data and yMax
  }

  build()
  return { build, render, canvas: () => plot!.ctx.canvas, version: () => version, empty: () => xs.length === 0, emptyText: emptyShort }
}
