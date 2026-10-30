// Assembly HUD (DOM only): a compact card with the current step and why, the distance inputs and the collapsible checklist.
// The parts themselves lie on the table in the 3D bench and are dragged there; this file owns the drag lifecycle (threshold,
// Escape, pointercancel, drop) and the keyboard path: a collapsed "Assemble without dragging" section with the part list and
// the zone list (full keyboard / screen-reader operation). The 3D bench plugs into BenchAssemblyHooks: it assigns `resolveZone`,
// calls `beginDrag` when a part is grabbed and reads the drag callbacks.
//
// Rendering is event driven (never per frame): the Assembly's onChange, a language switch (main.ts calls render()) and the
// breakpoint change. The body is rebuilt only when its signature changes; between rebuilds only the live distance note
// is written. The live region is one persistent element outside the rebuilt body, so a message is spoken.
import { DISTANCE_RANGE_CM, DOOR_STEP, ZERO_STEP, type Assembly, type BenchAssemblyHooks, type Distance, type Part, type PlaceResult, type Step, type Zone } from '../apparatus/assembly'
import { escapeHtml, getLang } from '../i18n'
import { at, stepText as stepStrings } from './assembly-i18n'

type Opts = {
  toast: (text: string) => void
  /** Offer "Montaje automático (docente)" (this experiment was assembled before on this device). */
  teacherShortcut: () => boolean
  onTeacher: () => void
  /** Experiment name for the title. */
  title: () => string
}
const DRAG_PX = 6

export function mountAssemblyHud(root: HTMLElement, hooks: BenchAssemblyHooks, opts: Opts) {
  root.innerHTML = '<div class="asm-body" data-asm-body></div><p class="visually-hidden" role="status" data-asm-live></p>'
  const body = root.querySelector<HTMLElement>('[data-asm-body]')!
  const live = root.querySelector<HTMLElement>('[data-asm-live]')!
  let selected: Part | null = null
  let dismissed = false
  let sig = ''
  let unsub: (() => void) | null = null
  let drag: { part: Part; id: number; x: number; y: number; on: boolean } | null = null
  let gesture: { which: Distance; from: number; cancelled: boolean } | null = null // a slider drag in progress
  let listOpen = false // the student's choice for the checklist (collapsed by default: the current step is above it)
  let kbdOpen = false // the keyboard path stays folded until asked for
  const a = () => hooks.assembly

  const stepText = (s: Step) => {
    const s_ = stepStrings(a().experiment, s.id)
    const cm = s.distance ? String(s.distance.targetCm) : ''
    return { title: s_[0].replace('{cm}', cm), why: s_[1] }
  }

  function report(r: PlaceResult, part: Part, zone: Zone) {
    const s = at()
    if (r.ok) return void announce(s.placedOk(s.parts[part], s.zones[zone]))
    const cur = a().current()
    const stepName = cur ? stepText(cur).title : ''
    const extra = r.reason === 'wrongPart' ? s.wrongPartExtra[a().experiment][part] : r.reason === 'setTaken' ? s.removeFirst[part] : undefined
    opts.toast(`${s.reason(r.reason, s.parts[part], s.zones[zone], stepName)}${extra ? ` ${extra}` : ''}`)
  }
  function announce(text: string) {
    live.textContent = ''
    live.textContent = text
  }
  function place(part: Part, zone: Zone): PlaceResult {
    const prev = selected
    selected = null // a success rebuilds the body from inside place(): it must already be without the zone list
    const r = a().place(part, zone)
    report(r, part, zone)
    if (!r.ok) selected = prev
    return r
  }

  /** Tray order: the seeded shuffle of the Assembly, parts already on the device last. */
  function trayParts(): Part[] {
    const asm = a()
    const all = asm.parts()
    return [...all.filter((p) => !asm.mounted(p)), ...all.filter((p) => asm.mounted(p))]
  }

  function html(): string {
    const s = at()
    const asm = a()
    const exp = asm.experiment
    const cur = asm.current()
    const done = asm.done()
    const swaps = done
    const steps = asm.steps
      .map((st, i) => {
        const state = i < asm.index() ? 'done' : i === asm.index() ? 'current' : 'todo'
        const tx = stepText(st)
        const mark = state === 'done' ? `<span class="asm-mark" aria-hidden="true">✓</span><span class="visually-hidden">${s.stepDone}: </span>` : `<span class="asm-mark" aria-hidden="true">${i + 1}</span>`
        return `<li data-state="${state}"${state === 'current' ? ' aria-current="step"' : ''}>${mark}<span class="asm-step-text"><strong>${tx.title}</strong></span></li>`
      })
      .join('')
    const nowStep = cur ? stepText(cur) : null
    const hint = asm.index() === 0 ? `<span class="asm-hint">${s.dragHint}</span>` : ''
    const now = nowStep ? `<p class="asm-now" tabindex="-1" data-now><strong>${nowStep.title}</strong><span class="asm-why">${nowStep.why}</span>${hint}</p>` : ''
    const list = `<details class="asm-list"${listOpen ? ' open' : ''}><summary data-focus-key="list">${s.checklist}</summary><ol class="asm-steps" aria-label="${s.stepsLabel}">${steps}</ol></details>`
    const dTitle = cur?.distance ? s.distTitle(cur.distance.which, exp) : ''
    const dist = cur?.distance
      ? `<div class="asm-dist" role="group" aria-label="${dTitle}">
          <label for="asm-d">${dTitle}</label>
          <div class="asm-dist-row"><input id="asm-d" type="range" data-dist-range data-focus-key="dist-range" min="${DISTANCE_RANGE_CM.min}" max="${DISTANCE_RANGE_CM.max}" step="0.1">
          <input type="number" data-dist-num data-focus-key="dist-num" inputmode="decimal" aria-label="${dTitle} (${s.distUnit})" min="${DISTANCE_RANGE_CM.min}" max="${DISTANCE_RANGE_CM.max}" step="0.1"><span>${s.distUnit}</span></div>
          <p class="hint" data-dist-note></p></div>`
      : cur?.id === ZERO_STEP
        ? `<p class="hint">${s.zeroNeedsPanel}</p>`
        : ''
    const tray = trayParts()
      .map((p) => {
        const state = asm.mounted(p) ? '✓ ' + s.onDevice : s.inTray
        return `<li><button class="asm-part" data-part="${p}" data-focus-key="part:${p}" aria-pressed="${selected === p}" aria-describedby="asm-tray-hint"${asm.mounted(p) ? ' data-on' : ''}>
          <span class="asm-part-name">${s.parts[p]}</span><span class="asm-part-state">${state}</span></button></li>`
      })
      .join('')
    const zones = selected
      ? `<div class="asm-zones" role="group" aria-label="${escapeHtml(s.placeIn(s.parts[selected]))}">
          <p class="asm-zones-title">${s.placeIn(s.parts[selected])}</p>
          ${asm.zones().map((z) => `<button data-zone="${z}" data-focus-key="zone:${z}">${s.zones[z]}</button>`).join('')}
          <button class="asm-cancel" data-cancel>${s.cancel}</button></div>`
      : ''
    const trayBlock = `<div class="asm-tray-block" data-tray><h3>${s.trayTitle}</h3><p class="hint" id="asm-tray-hint">${s.trayHint}</p><ul class="asm-tray">${tray}</ul>${zones}</div>`
    const kbd = `<details class="asm-kbd"${kbdOpen ? ' open' : ''}><summary data-focus-key="kbd">${s.kbdTitle}</summary>${trayBlock}</details>`
    const teacher = !done && opts.teacherShortcut() ? `<button class="about-link asm-teacher" data-teacher>${s.teacherAuto}</button>` : ''
    if (done) {
      return `<div class="asm-complete" tabindex="-1" data-complete><strong>✓ ${s.completeTitle}</strong><span>${s.completeText}${swaps ? ' ' + (exp === 'bragg' ? s.completeSwapBragg : s.completeSwap) : ''}</span>
        <button class="tool" data-dismiss aria-label="${s.dismiss}">×</button></div>
        ${swaps ? `<details class="asm-swap"><summary>${s.swapTitle}</summary>${trayBlock}</details>` : ''}`
    }
    return `<div class="asm-cur"><header class="asm-head"><h2>${escapeHtml(s.hudTitle(opts.title()))}</h2><span class="asm-count">${s.progress(asm.index(), asm.steps.length)}</span></header>
      ${now}${dist}</div><div class="asm-more">${list}${kbd}</div>${teacher}`
  }

  function build() {
    const active = document.activeElement as HTMLElement | null
    const inside = !!active && active !== document.body && root.contains(active)
    const key = inside ? active!.dataset.focusKey : undefined
    const open = body.querySelector<HTMLDetailsElement>('.asm-swap')?.open
    body.innerHTML = html()
    if (open) body.querySelector<HTMLDetailsElement>('.asm-swap')!.open = true
    syncDistance()
    root.hidden = dismissed && a().done()
    if (inside) {
      // Focus must not drop to <body> when what had it was rebuilt: the same control if it is still there, else where the
      // student goes next (the part the step asks for), else the step heading.
      const same = key ? body.querySelector<HTMLElement>(`[data-focus-key="${key}"]`) : null
      const next = a().current()?.part
      const target = same ?? (next ? body.querySelector<HTMLElement>(`[data-part="${next}"]`) : null) ?? body.querySelector<HTMLElement>('[data-now], [data-complete]')
      target?.focus({ preventScroll: true })
    }
  }
  const setText = (el: HTMLElement, text: string) => {
    if (el.textContent !== text) el.textContent = text
  }
  function syncDistance() {
    const cur = a().current()
    if (!cur?.distance) return
    const d = a().distance(cur.distance.which)
    const s = at()
    const range = body.querySelector<HTMLInputElement>('[data-dist-range]')
    const num = body.querySelector<HTMLInputElement>('[data-dist-num]')
    const note = body.querySelector<HTMLElement>('[data-dist-note]')
    if (!range || !num || !note) return
    if (document.activeElement !== range && range.value !== String(d)) range.value = String(d)
    if (document.activeElement !== num && num.value !== d.toFixed(1)) num.value = d.toFixed(1)
    const within = Math.abs(d - cur.distance.targetCm) <= cur.distance.tolCm + 1e-9
    setText(note, `${within ? '✓ ' + s.distIn : '✗ ' + s.distOut} · ${s.distRange(cur.distance.targetCm, cur.distance.tolCm)}`)
  }
  function signature(): string {
    const asm = a()
    let m = ''
    for (const p of asm.parts()) m += asm.mounted(p) ? '1' : '0'
    return `${asm.experiment}|${asm.index()}|${selected}|${m}|${asm.done()}|${getLang()}|${listOpen}|${kbdOpen}`
  }
  function render() {
    const next = signature()
    if (next !== sig) {
      sig = next
      if (!a().done()) dismissed = false
      build()
    } else syncDistance()
  }
  function attach(asm: Assembly) {
    unsub?.()
    hooks.assembly = asm
    selected = null
    dismissed = false
    sig = ''
    unsub = asm.onChange(render)
    render()
    hooks.onAssembly?.(asm)
  }

  // ── Events: tap/Enter to select + zone list; distance inputs; teacher shortcut ──
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.closest('summary')) return
    if (b.dataset.part) {
      selected = selected === b.dataset.part ? null : (b.dataset.part as Part)
      sig = ''
      render()
      if (selected) body.querySelector<HTMLElement>('[data-zone]')?.focus()
    } else if (b.dataset.zone && selected) place(selected, b.dataset.zone as Zone)
    else if (b.dataset.cancel !== undefined) {
      const p = selected
      selected = null
      sig = ''
      render()
      if (p) body.querySelector<HTMLElement>(`[data-part="${p}"]`)?.focus()
    } else if (b.dataset.teacher !== undefined) opts.onTeacher()
    else if (b.dataset.dismiss !== undefined) ((dismissed = true), (root.hidden = true))
  })
  root.addEventListener('toggle', (e) => {
    const d = e.target as HTMLDetailsElement
    if (d.classList.contains('asm-list') && d.open !== listOpen) ((listOpen = d.open), (sig = signature()))
    else if (d.classList.contains('asm-kbd') && d.open !== kbdOpen) ((kbdOpen = d.open), (sig = signature()))
  }, true)
  // Distances: `input` is live (the note updates, nothing completes); `change` (release, Enter, blur) commits the step.
  const distOf = (el: HTMLInputElement): Distance | null => {
    if (el.dataset.distRange === undefined && el.dataset.distNum === undefined) return null
    return a().current()?.distance?.which ?? null
  }
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    const which = distOf(el)
    if (!which || el.value === '') return
    a().setDistance(which, Number(el.value.replace(',', '.')))
  })
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement
    const which = distOf(el)
    if (!which || el.value === '') return
    if (gesture?.cancelled) return
    a().setDistance(which, Number(el.value.replace(',', '.')))
    a().commitDistance(which)
  })
  root.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLInputElement
    const which = el.dataset?.distRange !== undefined ? distOf(el) : null
    if (which) gesture = { which, from: a().distance(which), cancelled: false }
  })
  const releaseGesture = () => {
    // `change` fires right after the pointer is released: clear the flag only afterwards
    if (gesture) setTimeout(() => (gesture = null), 0)
  }

  // ── Pointer drag of a part grabbed in 3D (mouse + touch): the bench starts it, the HUD owns threshold, resolver and drop ──
  const resolve = (x: number, y: number): Zone | null => hooks.resolveZone?.(x, y) ?? null
  hooks.beginDrag = (part, e) => {
    drag = { part, id: e.pointerId, x: e.clientX, y: e.clientY, on: false }
  }
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_PX) return
      drag.on = true
      hooks.onDragStart?.(drag.part, a().zonesFor(drag.part))
    }
    hooks.onDragMove?.(drag.part, e.clientX, e.clientY, resolve(e.clientX, e.clientY))
  })
  const end = (e: PointerEvent, cancelled: boolean) => {
    releaseGesture()
    if (!drag || e.pointerId !== drag.id) return
    const d = drag
    drag = null
    if (!d.on) return // a plain tap on a part: nothing to do
    const zone = cancelled ? null : resolve(e.clientX, e.clientY)
    let result: PlaceResult | null = null
    // A part from the table dropped back on the table has nothing to do; one from the device dropped there is taken off.
    if (zone === 'tray' && !a().mounted(d.part)) {
      /* back on the table */
    } else if (zone) result = place(d.part, zone)
    else if (!cancelled) opts.toast(at().dropHint)
    hooks.onDragEnd?.(d.part, zone, result)
  }
  addEventListener('pointerup', (e) => end(e, false))
  addEventListener('pointercancel', (e) => end(e, true))
  // Escape cancels a drag in progress (a part grabbed in 3D) and a slider drag, restoring the value from before it.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (drag?.on) {
      e.stopPropagation()
      e.preventDefault()
      const d = drag
      drag = null
      hooks.onDragEnd?.(d.part, null, null)
    } else if (gesture && !gesture.cancelled) {
      e.stopPropagation()
      gesture.cancelled = true
      a().setDistance(gesture.which, gesture.from)
      syncDistance()
      const range = body.querySelector<HTMLInputElement>('[data-dist-range]')
      if (range) range.value = String(gesture.from)
    }
  }, true)

  return { build, render, attach, select: (p: Part | null) => ((selected = p), (sig = ''), render()), isDoorStep: () => a().current()?.id === DOOR_STEP }
}
