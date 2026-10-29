// The Learn sheet: the Explore/Lab switch, the guided-task list and the task card
// (predict → act → observe → explain). The act step ends by itself when the task's success(a) holds.
import type { Apparatus, Key } from '../apparatus/apparatus'
import { getLang, t } from '../i18n'
import { crystalsLoaded, loadAbsorbers, loadCrystals } from '../physics/tables'
import { en } from './i18n/en'
import { es } from './i18n/es'
import { clearExports } from './csv'
import type { Experiment } from '../apparatus/assembly'
import { getExperiment } from './experiment'
import { getMode, setHints, setMode, type AppMode } from './mode'
import { applyInitial, setActiveTask, type GuidedTask } from './task'
import { task as attenuationMaterial } from './tasks/attenuation-material'
import { task as attenuationThickness } from './tasks/attenuation-thickness'
import { task as background } from './tasks/background'
import { task as forgeDoublet } from './tasks/forge-doublet'
import { task as forgeKalpha10 } from './tasks/forge-kalpha-10deg'
import { task as forgeKcl111 } from './tasks/forge-kcl-111'
import { task as forgeSi222 } from './tasks/forge-si-222'
import { task as kalphaThirdOrder } from './tasks/kalpha-third-order'
import { task as lambdaThreeOrders } from './tasks/lambda-three-orders'
import { task as lifKalphaAngle } from './tasks/lif-kalpha-angle'
import { task as lineThreshold } from './tasks/line-threshold'
import { task as moseleyKEdges } from './tasks/moseley-k-edges'
import { task as xrfBrass } from './tasks/xrf-brass'
import { task as xrfCalibration } from './tasks/xrf-calibration'
import { task as xrfCoin } from './tasks/xrf-coin'

export const TASKS: GuidedTask[] = [kalphaThirdOrder, lifKalphaAngle, lineThreshold, lambdaThreeOrders, moseleyKEdges, background, attenuationThickness, attenuationMaterial, xrfCalibration, xrfBrass, xrfCoin, forgeKalpha10, forgeSi222, forgeKcl111, forgeDoublet]
/** The Bragg-at-NaCl/LiF tasks (the rest of the Bragg experiment's list needs another set-up). */
const BRAGG_CORE = ['kalpha-third-order', 'lif-kalpha-angle', 'line-threshold', 'lambda-three-orders']
const MODES: AppMode[] = ['explore', 'lab']

/** Which experiment a task belongs to: attenuation (leaflet P6.3.2.1) or Bragg (the rest: Bragg, LiF, Moseley, XRF, Forge). */
export const taskExperiment = (k: GuidedTask): Experiment => k.experiment ?? (k.id.startsWith('attenuation-') || k.id === 'background' ? 'attenuation' : 'bragg')

/** Guided-task strings in the current language. */
export const pt = () => (getLang() === 'es' ? es : en)
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

type Hooks = {
  onMode: () => void
  onFocus: (keys: Key[] | null) => void
  onAct: () => void
  /** False while the bench is still being assembled: the task list is disabled with a hint. Default: always ready. */
  ready?: () => boolean
  notReadyHint?: () => string
}

export function mountLearn(root: HTMLElement, a: Apparatus, { onMode, onFocus, onAct, ready = () => true, notReadyHint = () => '' }: Hooks) {
  let task: GuidedTask | null = null
  let step = 0 // 0 predict · 1 act · 2 observe · 3 explain
  let prediction: string | null = null // the number as typed, or the chosen option's index
  let loading = false // the task's crystal table is on its way
  let notice = '' // a load failure, shown on the list
  let actFrom = 0 // exposure-log (or MCA-log) length when the act step opened: such tasks count only newer records
  const logLen = (k: GuidedTask | null) => (k?.countsMcaRuns ? a.mcaLog.length : a.exposureLog.length)
  const teacher = new URLSearchParams(location.search).has('teacher')

  /** A task as a list item. */
  const taskItem = (k: GuidedTask) => {
    const p = pt()
    const x = p.task[k.id as keyof typeof p.task]
    return `<li><button data-task="${k.id}"${ready() ? '' : ' disabled'}>
            <span class="chip">${x.concept}</span>
            <strong>${x.title}</strong>
            <span class="meta">${p.levels[k.level]} · ${p.modeNote[k.mode]}</span>
          </button></li>`
  }
  /** The list of the experiment at hand; under Bragg the NaCl/LiF Bragg tasks come first and the practices that need
   * another set-up (Moseley, XRF, Forge) follow in a labelled group. They work as always. */
  const taskGroups = () => {
    const mine = TASKS.filter((k) => taskExperiment(k) === getExperiment())
    const core = getExperiment() === 'bragg' ? mine.filter((k) => BRAGG_CORE.includes(k.id)) : mine
    const other = getExperiment() === 'bragg' ? mine.filter((k) => !BRAGG_CORE.includes(k.id)) : []
    return `<ul class="task-list">${core.map(taskItem).join('')}</ul>${other.length ? `<h3 class="task-group">${pt().otherPractices}</h3><ul class="task-list">${other.map(taskItem).join('')}</ul>` : ''}`
  }

  const listHtml = () => {
    const s = t()
    const p = pt()
    return `
      <div class="view-head"><h2>${p.learn}</h2></div>
      <div class="seg" role="group" aria-label="${s.modeLabel}">
        ${MODES.map((m) => `<button data-mode="${m}" aria-pressed="${getMode() === m}">${s.modes[m]}</button>`).join('')}
      </div>
      <p class="note">${s.modeHint[getMode()]}</p>
      ${notice ? `<p class="hint" role="alert">${notice}</p>` : ''}
      <h3>${p.tasks}</h3>
      ${ready() ? '' : `<p class="hint" role="status">${notReadyHint()}</p>`}
      ${taskGroups()}`
  }

  /** The task's checklist as a list, "abierto ✓", "Zr –", …; done items in the text colour (element symbols stay as they are). */
  const progressItems = (k: GuidedTask) =>
    k.progress!(a, actFrom).map(({ key, done }) => ({
      text: `${(pt().progressLabels as Record<string, string>)[key] ?? key} ${done ? '✓' : '–'}`,
      done,
    }))
  const progressHtml = (items: { text: string; done: boolean }[]) =>
    items.map((x) => `<li${x.done ? ' data-done' : ''}>${x.text}</li>`).join('')

  const bodyHtml = (k: GuidedTask) => {
    const p = pt()
    const x = p.task[k.id as keyof typeof p.task]
    if (step === 0) {
      const input = k.predict.kind === 'number'
        ? `<label class="predict-number"><span class="visually-hidden">${p.predictNumber}</span>
            <input data-predict inputmode="decimal" autocomplete="off" value="${esc(prediction ?? '')}">
            <span>${k.predict.unit}</span></label>`
        : `<div class="choices" role="group" aria-label="${p.steps[0]}">${x.options.map((o, i) =>
            `<button data-choice="${i}" aria-pressed="${prediction === String(i)}">${o}</button>`).join('')}</div>`
      return `<p>${x.predict}</p>${input}
        <button class="primary" data-commit ${prediction === null ? 'disabled' : ''}>${p.commit}</button>`
    }
    if (step === 1) {
      const line = k.progress ? `<ul class="progress" data-progress>${progressHtml(progressItems(k))}</ul>` : ''
      const help = (x as { actHelp?: string }).actHelp
      const earlier = actFrom > 0 && (k.countsExposures || k.countsMcaRuns) ? `<p class="hint">${(k.countsMcaRuns ? p.earlierRuns : p.earlierExposures)(actFrom)}</p>` : ''
      return `<p>${x.act}</p>${line}${earlier}${help ? `<p class="hint">${help}</p>` : ''}<p class="hint">${p.waiting}</p>`
    }
    if (step === 2) {
      return `<p class="done">✓ ${p.done}</p><p>${x.observe}</p>
        <button class="primary" data-next>${p.explainNext}</button>`
    }
    const mine = k.predict.kind === 'number'
      ? `${esc(prediction ?? '')}${k.predict.unit === '°' ? '' : ' '}${k.predict.unit}` // 22.2°, 20.0 kV
      : x.options[Number(prediction)]
    const answer = k.predict.kind === 'choice' ? `<dt>${p.expected}</dt><dd>${x.options[k.predict.answer]}</dd>` : ''
    return `<p>${x.explain}</p><dl class="recall"><dt>${p.yourPrediction}</dt><dd>${mine}</dd>${answer}</dl>
      <button class="back" data-restart>${p.restart}</button>`
  }

  const cardHtml = (k: GuidedTask) => {
    const p = pt()
    const x = p.task[k.id as keyof typeof p.task]
    return `
      <button class="back" data-back>‹ ${p.back}</button>
      <div class="view-head"><h2>${x.title}</h2><span class="chip">${x.concept}</span></div>
      <ol class="steps">${p.steps.map((st, i) =>
        `<li ${i === step ? 'aria-current="step"' : ''} ${i < step ? 'data-past' : ''}>${st}</li>`).join('')}</ol>
      <div class="task-body" aria-live="polite">${loading ? `<p class="hint">${p.loading}</p>` : bodyHtml(k)}</div>
      ${teacher ? `<details class="teacher"><summary>${p.teacher}</summary><p>${x.teacher}</p></details>` : ''}`
  }

  const build = () => {
    root.innerHTML = task ? cardHtml(task) : listHtml()
  }
  /** The task's crystal lock and panel focus hold until its act step has succeeded (step ≥ 2); a card back at
   * predict or act takes them up again. */
  const lock = (on: boolean) => {
    setActiveTask(on ? task : null)
    onFocus(on && task ? task.controls : null)
  }
  const go = (next: number) => {
    step = next
    if (next === 1) actFrom = logLen(task)
    setHints(next >= 2) // the expected angles would give the answer away before it is found
    if (task) lock(next < 2)
    build()
    root.querySelector<HTMLElement>('.task-body input, .task-body button')?.focus()
    if (next === 1) onAct()
  }
  const start = (k: GuidedTask) => {
    if (!ready()) return
    if (a.busy && !window.confirm(pt().busyConfirm)) return // preparing the bench would cut the running measurement short
    const restart = task === k // a free-pick task started over keeps the student's crystal
    task = k
    step = 0 // the previous task's step never renders with this one
    prediction = null
    notice = ''
    if (getMode() !== k.mode) {
      setMode(k.mode)
      onMode()
    }
    const begin = () => {
      if (task !== k) return // the student went back while the crystal table loaded
      loading = false
      applyInitial(a, k.initial, k.crystal, k.holder, k.crystalLocked !== false || !restart, k.keepCrystal, k.keepDetector)
      clearExports(a) // a restart begins fresh; the exposure log stays (the attenuation tasks read it)
      void loadAbsorbers().catch(() => {}) // the foils the task mounts; retried when the tray opens
      go(0)
    }
    if (k.crystal && k.crystal !== 'NaCl' && !crystalsLoaded()) {
      loading = true
      build()
      loadCrystals().then(begin, () => {
        if (task !== k) return
        task = null // offline: the list stays, nothing half-prepared
        loading = false
        notice = pt().loadFailed
        lock(false)
        build()
      })
    } else begin()
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    const d = b.dataset
    if (d.mode && d.mode !== getMode()) {
      setMode(d.mode as AppMode)
      onMode()
      build()
    } else if (d.task) start(TASKS.find((k) => k.id === d.task)!)
    else if (d.back !== undefined) {
      task = null
      loading = false
      notice = ''
      lock(false)
      setHints(true)
      build()
    } else if (d.choice) {
      prediction = d.choice
      build()
      root.querySelector<HTMLElement>(`[data-choice="${d.choice}"]`)?.focus()
    } else if (d.commit !== undefined && prediction !== null) go(1)
    else if (d.next !== undefined) go(3)
    else if (d.restart !== undefined) start(task!)
  })
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    if (el.dataset.predict === undefined) return
    const v = el.value.trim()
    prediction = v !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? v : null
    root.querySelector<HTMLButtonElement>('[data-commit]')!.disabled = prediction === null
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).dataset.predict !== undefined && prediction !== null) go(1)
  })

  /** Per frame: the act step waits for the task's success condition. True when it was just met (the
   * caller brings the sheet back, since the student is at the instrument then). */
  const render = (): boolean => {
    if (logLen(task) < actFrom) actFrom = 0 // the log was cleared meanwhile
    if (task?.progress && step === 1) {
      const el = root.querySelector<HTMLElement>('[data-progress]')
      const items = progressItems(task)
      const text = items.map((x) => x.text).join('')
      if (el && el.textContent !== text) el.innerHTML = progressHtml(items) // calm live region: only on change
    }
    if (!task || step !== 1 || !task.success(a, actFrom)) return false
    go(2)
    return true
  }

  /** The act instruction while the task waits for it, else null. */
  const actText = () => (task && step === 1 ? pt().task[task.id as keyof ReturnType<typeof pt>['task']].act : null)

  build()
  /** The Learn sheet was closed by the student: release the task's locks unless the act step is under way. */
  const sheetClosed = () => {
    if (task && step !== 1) lock(false)
  }
  /** The experiment changed: drop the open task (its setup belongs to the other experiment) and show the list. */
  const reset = () => {
    task = null
    loading = false
    notice = ''
    lock(false)
    setHints(true)
    build()
  }
  return { build, render, actText, sheetClosed, reset }
}
