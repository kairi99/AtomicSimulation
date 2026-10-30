// MCA view of the 559 938 energy detector: the counts per channel as they arrive, drawn with uPlot. Lab mode shows
// channels until the student calibrates (two known lines → E = slope·ch + offset); Explore shows keV from the start.
// Draws state, computes no physics: the map comes from kevPerChannel and analysis.twoPointCalibration.
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Apparatus } from '../apparatus/apparatus'
import { MCA_CHANNELS, MCA_GAINS } from '../apparatus/mca'
import { getLang, t } from '../i18n'
import { showHints } from '../pedagogy/mode'
import { downloadMcaCsv } from '../pedagogy/csv'
import { evaluateLineFit, gaussFitFixed, twoPointCalibration, type LineFit } from '../physics/analysis'
import { kevPerChannel, pinFwhmKeV } from '../physics/detector'
import { XRF } from '../physics/tables'
import { palette, paletteVersion, scaledFont } from './canvas'
import { mt } from './mca-i18n'
import { SUP, decades, niceCeil } from './spectrum'

const LOG_MIN = 0.5 // counts: a single count still shows, an empty channel does not

/** The fit menu, in this order (the JSON of reference lines is key-sorted). */
const FIT_LINES = ['Fe Kα', 'Fe Kβ', 'Cu Kα', 'Cu Kβ', 'Zn Kα', 'Zn Kβ', 'Pb Lα', 'Pb Lβ']
const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2)

const allowed = (n: number, gain: number): boolean => {
  try {
    kevPerChannel(n, gain)
    return true
  } catch {
    return false
  }
}

export function mountMca(root: HTMLElement, a: Apparatus) {
  const { mca } = a
  let log = false
  let plot: uPlot | null = null
  let cursor: number | null = null // channel
  let yMax = 10 // linear range only steps up, like the spectrum view
  let drawn = '' // the structure the plot was built for; rebuilt when it changes (data alone only updates)
  let drawnVersion = -1
  let drawnCursor: number | null = null
  let xs = new Float64Array(0)
  let version = 0 // bumped after every uPlot draw: the 3D monitor copies the canvas then
  let emptyText = ''
  let builtLang = ''
  const cal = [{ ch: '', e: '' }, { ch: '', e: '' }] // the calibration inputs survive a rebuild
  let calError = ''
  let wasRunning = false // for the status announcements
  const picked = new Set<string>() // fit chips that are on
  // The last fit with what it was made from; dropped when the counts, channels, gain or calibration change under it.
  let fit: { lf: LineFit; labels: string[]; realS: number; liveS: number; key: string; lo: number; hi: number; curve: { x: Float64Array; y: Float64Array } } | null = null
  let zoomFit = false // the x range follows the fit window until «Todo el espectro»
  let fitError = ''
  let fitShown = ''

  root.classList.add('spectrum', 'mca')
  root.innerHTML = `<div class="view-head" data-head></div>
    <div class="plot" data-plot tabindex="0" role="slider"><span class="readout" data-cursor aria-hidden="true"></span><div class="mca-nudge" data-nudge></div><p class="empty" data-empty><span></span></p></div>
    <details class="mca-setup" data-setup></details>
    <details class="mca-fit" data-fit></details>`
  const head = root.querySelector<HTMLElement>('[data-head]')!
  const box = root.querySelector<HTMLElement>('[data-plot]')!
  const empty = root.querySelector<HTMLElement>('[data-empty]')!
  const readout = root.querySelector<HTMLElement>('[data-cursor]')!
  const setup = root.querySelector<HTMLDetailsElement>('[data-setup]')!
  const fitBox = root.querySelector<HTMLDetailsElement>('[data-fit]')!

  const kpc = () => kevPerChannel(mca.settings.nChannels, mca.settings.gain)
  /** The channel → keV map on show: the student's calibration, else the true one in Explore, else none (channels). */
  const map = (): { k: number; off: number } | null => (mca.calibration ? { k: mca.calibration.kevPerChannel, off: mca.calibration.offsetKeV } : showHints() ? { k: kpc(), off: 0 } : null)
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text
  }

  const build = () => {
    const s = t()
    const m = mt()
    builtLang = getLang()
    head.innerHTML = `<h2>${m.title}</h2><span class="hint" data-time></span><span class="visually-hidden" role="status" data-status></span>
      <div class="view-tools">
        <button class="tool" data-start aria-describedby="mca-done"></button><button class="tool" data-clear>${m.clear}</button><button class="tool" data-csv>${m.csv}</button><button class="tool" data-full hidden>${m.fullSpectrum}</button>
        <div class="seg" role="group" aria-label="${s.scale}">
          <button data-log="0" aria-pressed="${!log}">${s.linear}</button><button data-log="1" aria-pressed="${log}">${s.log}</button>
        </div>
      </div><p class="hint" id="mca-done" data-done hidden>${m.clearFirst}</p>`
    q('[data-nudge]').innerHTML = `<button class="tool" data-step="-1" aria-label="${m.cursorMinus}">‹</button><button class="tool" data-step="1" aria-label="${m.cursorPlus}">›</button>`
    box.setAttribute('aria-label', `${m.plotAlt}. ${m.cursorHint}`)
    const opt = (v: number, on: boolean, label = String(v)) => `<option value="${v}"${on ? ' selected' : ''}>${label}</option>`
    const { nChannels, gain, presetS } = mca.settings
    setup.innerHTML = `<summary>${m.settings}</summary>
      <div class="mca-row">
        <label>${m.channels}<select data-n>${MCA_CHANNELS.map((n) => opt(n, n === nChannels).replace('<option', allowed(n, gain) ? '<option' : '<option disabled')).join('')}</select></label>
        <label>${m.gain}<select data-gain>${MCA_GAINS.map((g) => opt(g, g === gain, String(g).replace('-', '−')).replace('<option', allowed(nChannels, g) ? '<option' : '<option disabled')).join('')}</select></label>
        <label>${m.preset}<input type="number" inputmode="numeric" min="1" max="9999" step="1" data-preset value="${presetS}"></label>
      </div>
      <p class="hint">${m.settingsNote}</p>
      <div class="mca-cal" data-cal>
        <h3>${m.calTitle}</h3><p class="hint">${m.calHint}</p>
        ${[0, 1].map((i) => `<fieldset><legend>${m.calRow(i + 1)}</legend><div class="mca-point">
          <label>${m.calChannel}<input type="number" inputmode="numeric" step="1" min="0" data-ch="${i}" value="${cal[i].ch}"></label>
          <label>${m.calEnergy}<input type="number" inputmode="decimal" step="0.01" min="0" data-e="${i}" value="${cal[i].e}"></label>
          <button class="tool" data-use="${i}">${m.useCursor}</button></div></fieldset>`).join('')}
        <div class="mca-row"><button class="tool" data-calibrate>${m.calibrate}</button><button class="tool" data-calreset>${m.calReset}</button></div>
        <p class="hint" role="status" data-calstatus></p>
      </div>`
    fitBox.innerHTML = `<summary>${m.fitTitle}</summary>
      <p class="hint" data-fitneed>${m.fitNeedCal}</p>
      <div data-fitctl>
        <p class="hint">${m.fitHint}</p>
        <p class="mca-label" id="mca-fitlines">${m.fitLines}</p>
        <div class="mca-row"><span class="mca-chips" role="group" aria-labelledby="mca-fitlines">${FIT_LINES.map((l) => `<button class="tool" data-line="${l}" aria-pressed="${picked.has(l)}"></button>`).join('')}</span></div>
        <div class="mca-row"><button class="tool" data-dofit>${m.fit}</button></div>
      </div>
      <p class="hint" role="status" data-fitstatus></p>
      <div data-fitout></div>`
    fitShown = ''
    plot?.destroy()
    plot = null
    drawn = ''
    draw()
  }

  const fitKey = () => `${showHints()}|${mca.calibration?.kevPerChannel}|${mca.calibration?.offsetKeV}|${mca.settings.nChannels}|${mca.settings.gain}`
  const refKeV = (l: string): number | undefined => XRF.reference_lines_keV[l]

  const doFit = () => {
    const mp = map()
    const lines = FIT_LINES.filter((l) => picked.has(l) && refKeV(l) !== undefined)
    if (!mp || !lines.length) return
    const centres = lines.map((l) => refKeV(l)!)
    const counts = mca.counts.slice()
    const E = Float64Array.from(counts, (_, i) => mp.k * i + mp.off)
    const sig = centres.map((c) => pinFwhmKeV(c) / FWHM_PER_SIGMA)
    fitError = ''
    try {
      const lf = gaussFitFixed(E, counts, centres, sig)
      const lo = Math.min(...centres.map((c, i) => c - 3 * sig[i]))
      const hi = Math.max(...centres.map((c, i) => c + 3 * sig[i]))
      // The model curve, once: x at the middle of each channel's step, y = background + the peaks (floored in draw).
      const Ew = Array.from(E).filter((x) => x >= lo && x <= hi)
      const g = evaluateLineFit(lf, Ew)
      const [b0, b1, eRef] = lf.background
      const curve = { x: Float64Array.from(Ew, (x) => x + mp.k / 2), y: Float64Array.from(Ew, (x, i) => b0 + b1 * (x - eRef) + g.reduce((s, row) => s + row[i], 0)) }
      fit = { lf, labels: lines, realS: mca.realS, liveS: mca.liveS, key: fitKey(), lo, hi, curve }
      zoomFit = true
    } catch (err) {
      if (!(err instanceof RangeError)) throw err
      fit = null
      zoomFit = false
      fitError = mt().fitErrWindow
    }
    fitBox.open = true
    draw() // the series and the x range depend on the fit
  }

  /** The fit table as HTML (a fit of the counts at one moment: while the run goes on, it says so). */
  const fitHtml = (): string => {
    if (!fit) return ''
    const m = mt()
    const f = fit.lf
    const int = (v: number) => v.toFixed(0).replace('-', '−')
    return `<p class="hint">${m.fitAt(fit.realS, fit.liveS)}${mca.running ? ` ${m.fitRunning}` : ''}</p><table class="mca-fit-table">
      <thead><tr><th scope="col">${m.fitLine}</th><th scope="col">${m.fitArea}</th></tr></thead>
      <tbody>${fit.labels.map((l, i) => `<tr><th scope="row">${l}</th><td>${int(f.area[i])} ± ${int(f.areaErr[i])}</td></tr>`).join('')}</tbody></table>
      <p class="hint">χ²/ν = ${f.chi2Dof.toFixed(2)} · ${m.fitLegend}</p>`
  }

  const total = () => mca.counts.reduce((s, c) => s + c, 0)

  /** Why the plot is empty, in words; '' once counts exist. */
  const emptyMessage = (): string => {
    if (total() > 0) return ''
    const m = mt()
    if (a.setup.holder !== 'sample') return m.emptyNoSample
    if (!a.emitting) return m.emptyNoBeam
    return mca.running ? m.emptyWaiting : m.emptyReady
  }

  function draw() {
    plot?.destroy()
    plot = null
    const P = palette
    const m = mt()
    const mp = map()
    const n = mca.counts.length
    xs = Float64Array.from({ length: n }, (_, i) => (mp ? mp.k * i + mp.off : i))
    const { top, ys } = yData()
    const zoomed = zoomFit && !!fit && !!mp
    let xr: [number, number] = [xs[0], xs[n - 1] + (mp ? mp.k : 1)]
    if (zoomed) {
      const mg = Math.max(0.5, 0.15 * (fit!.hi - fit!.lo))
      xr = [fit!.lo - mg, fit!.hi + mg]
      if (cursor !== null) cursor = Math.min(Math.max(cursor, Math.ceil((xr[0] - mp!.off) / mp!.k)), Math.floor((xr[1] - mp!.off) / mp!.k))
    }
    const font = scaledFont(P.caption, 1)
    const axis = { stroke: P['label-2'], font, labelFont: scaledFont(P.footnote, 1), ticks: { stroke: P.separator, width: 1, size: 4 } }
    plot = new uPlot(
      {
        width: box.clientWidth || 320,
        height: box.clientHeight || 200,
        legend: { show: false },
        cursor: { show: false },
        select: { show: false, left: 0, top: 0, width: 0, height: 0 },
        scales: {
          x: { time: false, range: xr },
          y: { auto: false, distr: log ? 3 : 1, log: 10, range: log ? [LOG_MIN, top] : [0, top] },
        },
        axes: [
          { ...axis, grid: { show: false }, label: mp ? m.axisEnergy : m.axisChannel, labelSize: 22 },
          {
            ...axis, grid: { stroke: P.separator, width: 1 }, ticks: { show: false }, label: m.axisCounts, labelSize: 22, size: 52,
            splits: log ? (_u, _i, min, max) => decades(min, max) : undefined,
            values: log
              ? (_, splits) => splits.map((v) => `10${[...String(Math.round(Math.log10(v)))].map((d) => SUP[d]).join('')}`)
              : (_, splits) => splits.map((v) => String(v)),
          },
        ],
        series: [
          {},
          fit
            ? { stroke: P['phys-continuum'], width: 1, fill: P.fill, points: { show: false }, paths: uPlot.paths.stepped!({ align: 1 }) } // the counts as bars
            : { stroke: P.label, width: 1.5, points: { show: false }, paths: uPlot.paths.stepped!({ align: 1 }) },
        ],
        hooks: {
          draw: [
            (u) => {
              if (cursor !== null) {
                const { ctx, bbox } = u
                const k = uPlot.pxRatio
                const x = Math.round(u.valToPos(xs[cursor], 'x', true))
                ctx.save()
                ctx.strokeStyle = P.accent
                ctx.lineWidth = k
                ctx.setLineDash([]) // dashed means a K edge in this design system
                ctx.beginPath()
                ctx.moveTo(x + k / 2, bbox.top)
                ctx.lineTo(x + k / 2, bbox.top + bbox.height)
                ctx.stroke()
                ctx.restore()
              }
              if (fit && mp) {
                const { ctx, bbox } = u
                const k = uPlot.pxRatio
                const { x, y } = fit.curve
                ctx.save()
                ctx.beginPath()
                ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height)
                ctx.clip()
                ctx.strokeStyle = P.label // thin neutral line: accent is the cursor, dashed is a K edge
                ctx.lineWidth = 1.5 * k
                ctx.lineJoin = 'round'
                ctx.beginPath()
                for (let i = 0; i < x.length; i++) {
                  const px = u.valToPos(x[i], 'x', true)
                  const py = u.valToPos(Math.max(y[i], log ? LOG_MIN : 0), 'y', true)
                  i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
                }
                ctx.stroke()
                ctx.restore()
              }
              version++
            },
          ],
        },
      },
      [xs, ys] as uPlot.AlignedData,
      box,
    )
    drawn = struct()
    drawnVersion = mca.version
    drawnCursor = cursor
    showCursor()
  }

  /** The y data and the top of the y scale; the linear top only steps up (1-2-5), the log top is a decade. */
  function yData() {
    const peak = Math.max(...mca.counts)
    if (peak === 0) yMax = 10
    else if (peak > yMax) yMax = niceCeil(peak * 1.05)
    const top = log ? Math.max(10, 10 ** Math.ceil(Math.log10(Math.max(peak, 1)))) : yMax
    return { top, ys: log ? Array.from(mca.counts, (c) => Math.max(c, LOG_MIN)) : mca.counts }
  }

  /** New counts or a moved cursor: same plot, new data. */
  function update() {
    if (!plot) return
    const { top, ys } = yData()
    plot.setData([xs, ys] as uPlot.AlignedData, false)
    plot.setScale('y', { min: log ? LOG_MIN : 0, max: top })
    plot.redraw() // setData(…, false) and an unchanged y top draw nothing: the new counts would wait for a rescale
    drawnVersion = mca.version
    drawnCursor = cursor
    showCursor()
  }

  const struct = () => `${log}|${showHints()}|${paletteVersion}|${mca.calibration?.kevPerChannel}|${mca.calibration?.offsetKeV}|${mca.counts.length}|${mca.settings.gain}|${!!fit}|${zoomFit}`

  function showCursor() {
    const mp = map()
    const text = cursor === null ? '' : mt().cursor(cursor, mca.counts[cursor], mp ? mp.k * cursor + mp.off : null)
    setText(readout, text)
    box.setAttribute('aria-valuemin', '0')
    box.setAttribute('aria-valuemax', String(mca.counts.length - 1))
    if (cursor === null) for (const k of ['aria-valuenow', 'aria-valuetext']) box.removeAttribute(k)
    else (box.setAttribute('aria-valuenow', String(cursor)), box.setAttribute('aria-valuetext', text))
  }

  /** Put the cursor on the channel under a pointer event. */
  const pick = (clientX: number) => {
    if (!plot) return
    const r = plot.over.getBoundingClientRect()
    const i = plot.posToIdx(clientX - r.left)
    cursor = Math.min(Math.max(i, 0), mca.counts.length - 1)
    update()
  }
  /** Move the cursor by `delta` channels (clamped); with none yet, put it under the plot centre. */
  const move = (delta: number) => {
    if (!plot) return
    const last = mca.counts.length - 1
    cursor = cursor === null ? plot.posToIdx(plot.over.clientWidth / 2) : cursor + delta
    cursor = Math.min(Math.max(cursor, 0), last)
    update()
  }
  // ‹ ›: a click steps 1 channel (Shift 10), a long press 10, as the − / + beside the ADJUST knob.
  let held = false
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  const nudge = q('[data-nudge]')
  nudge.addEventListener('pointerdown', (e) => {
    const dir = Number((e.target as HTMLElement).closest<HTMLElement>('[data-step]')?.dataset.step)
    held = false
    clearTimeout(holdTimer)
    if (dir) holdTimer = setTimeout(() => ((held = true), move(10 * dir)), 500)
  })
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) nudge.addEventListener(ev, () => clearTimeout(holdTimer))
  nudge.addEventListener('click', (e) => {
    const dir = Number((e.target as HTMLElement).closest<HTMLElement>('[data-step]')?.dataset.step)
    if (held) held = false
    else if (dir) move(dir * (e.shiftKey ? 10 : 1))
  })
  let dragging = false
  box.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('[data-nudge]')) return
    dragging = true
    box.setPointerCapture(e.pointerId)
    pick(e.clientX)
  })
  box.addEventListener('pointermove', (e) => dragging && pick(e.clientX))
  box.addEventListener('pointerup', () => (dragging = false))
  box.addEventListener('pointercancel', () => (dragging = false))
  box.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('[data-nudge]')) return
    const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: 10, PageDown: -10 }[e.key as 'ArrowLeft']
    const last = mca.counts.length - 1
    if (step) move(step * (e.shiftKey && Math.abs(step) === 1 ? 10 : 1))
    else if (e.key === 'Home' || e.key === 'End') (cursor = e.key === 'Home' ? 0 : last, update())
    else return
    e.preventDefault()
  })

  head.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.dataset.start !== undefined) mca.running ? mca.stop() : mca.start()
    else if (b.dataset.clear !== undefined) mca.clear()
    else if (b.dataset.csv !== undefined) downloadMcaCsv(a)
    else if (b.dataset.full !== undefined) zoomFit = false
    else if (b.dataset.log !== undefined && (b.dataset.log === '1') !== log) {
      log = b.dataset.log === '1'
      build()
      head.querySelector<HTMLElement>(`[data-log="${b.dataset.log}"]`)?.focus()
    }
  })

  fitBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.dataset.line !== undefined) {
      picked.has(b.dataset.line) ? picked.delete(b.dataset.line) : picked.add(b.dataset.line)
      b.setAttribute('aria-pressed', String(picked.has(b.dataset.line)))
    } else if (b.dataset.dofit !== undefined) doFit()
  })

  const calInputs = (i: number) => [q<HTMLInputElement>(`[data-ch="${i}"]`), q<HTMLInputElement>(`[data-e="${i}"]`)]
  const syncCal = () => {
    for (const i of [0, 1]) [cal[i].ch, cal[i].e] = calInputs(i).map((x) => x.value)
  }
  setup.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement
    syncCal()
    try {
      if (el.matches('[data-n]')) mca.set({ nChannels: Number(el.value) })
      else if (el.matches('[data-gain]')) mca.set({ gain: Number(el.value) })
      else if (el.matches('[data-preset]')) mca.set({ presetS: Math.round(Number(el.value)) })
    } catch {
      /* a refused value: the rebuild below shows what is set */
    }
    cursor = cursor !== null && cursor >= mca.counts.length ? null : cursor
    const key = ['data-n', 'data-gain', 'data-preset'].find((k) => el.hasAttribute(k))
    if (key) {
      build()
      setup.querySelector<HTMLElement>(`[${key}]`)?.focus()
    }
  })
  setup.addEventListener('input', syncCal)
  setup.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.dataset.use !== undefined && cursor !== null) calInputs(Number(b.dataset.use))[0].value = cal[Number(b.dataset.use)].ch = String(cursor)
    else if (b.dataset.calibrate !== undefined) {
      const [c1, e1, c2, e2] = [0, 1].flatMap((i) => calInputs(i).map((x) => Number(x.value)))
      calError = ''
      try {
        const r = twoPointCalibration(c1, e1, c2, e2)
        if (!(r.kevPerChannel > 0)) calError = mt().calErrSlope
        else mca.calibration = r
      } catch {
        calError = mt().calErrEqual
      }
      mca.version++
    } else if (b.dataset.calreset !== undefined) {
      mca.calibration = null
      calError = ''
      mca.version++
    }
  })

  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    if (plot && width > 0 && height > 0) plot.setSize({ width, height })
    else if (!plot && width > 0) draw()
  }).observe(box)

  const render = () => {
    const m = mt()
    if (builtLang !== getLang()) build()
    if (struct() !== drawn) draw()
    else if (mca.version !== drawnVersion || cursor !== drawnCursor) update()
    const done = mca.realS >= mca.settings.presetS
    const start = q<HTMLButtonElement>('[data-start]')
    setText(start, mca.running ? m.stop : m.start)
    if (start.disabled !== (!mca.running && done)) start.disabled = !mca.running && done
    q('[data-done]').hidden = !start.disabled
    if (mca.running !== wasRunning) {
      setText(q('[data-status]'), mca.running ? m.started : done ? m.finished : m.stopped)
      wasRunning = mca.running
    }
    setText(q('[data-time]'), m.time(mca.realS, mca.liveS, mca.settings.presetS))
    emptyText = emptyMessage()
    setText(empty.firstElementChild as HTMLElement, emptyText)
    empty.hidden = emptyText === ''
    q('[data-cal]').hidden = showHints() // Explore shows the true map; Lab asks for the student's own
    setText(q('summary'), showHints() ? m.settingsShort : m.settings)
    q<HTMLButtonElement>('[data-calibrate]').disabled = cal.some((r) => r.ch === '' || r.e === '')
    for (const b of setup.querySelectorAll<HTMLButtonElement>('[data-use]')) b.disabled = cursor === null
    const mp = map()
    if (fit && (fit.key !== fitKey() || total() === 0)) (fit = null, zoomFit = false) // the counts or the map changed under it
    if (!fit && total() === 0) fitError = ''
    for (const b of fitBox.querySelectorAll<HTMLButtonElement>('[data-line]')) {
      const l = b.dataset.line!
      const e = refKeV(l)
      setText(b, e === undefined ? l : `${l} ${e.toFixed(2)}`)
      b.disabled = e === undefined
    }
    q('[data-full]').hidden = !(zoomFit && !!fit)
    q('[data-fitneed]').hidden = !!mp
    q('[data-fitctl]').hidden = !mp
    q<HTMLButtonElement>('[data-dofit]').disabled = !mp || !total() || ![...picked].some((l) => refKeV(l) !== undefined)
    setText(q('[data-fitstatus]'), !mp ? '' : fitError || (fit ? m.fitDone(fit.labels.length, fit.lf.chi2Dof.toFixed(2)) : ''))
    q<HTMLButtonElement>('[data-csv]').disabled = total() === 0
    const html = fitHtml()
    if (html !== fitShown) (q('[data-fitout]').innerHTML = html, (fitShown = html))
    const status = q('[data-calstatus]')
    setText(status, calError || (mca.calibration ? m.calibrated(mca.calibration.kevPerChannel, mca.calibration.offsetKeV) : ''))
    status.toggleAttribute('data-error', calError !== '')
  }

  build()
  return { build, render, title: () => mt().title, canvas: () => plot!.ctx.canvas, version: () => version, empty: () => emptyText !== '', emptyText: () => emptyText }
}
