// Entry point: one apparatus, the views around it, and one frame loop driving the simulated clock.
// The 3D bench is the room. The panel, the monitor's spectrum and the chamber's 2D goniometer are focus cards
// the camera flies to; Learn and Huygens stay inspectors.
import './styles/app.css'
import { Apparatus } from './apparatus/apparatus'
import { Assembly, ZERO_STEP, sameSetup, type BenchAssemblyHooks, type Experiment } from './apparatus/assembly'
import { getLang, setLang, t, type Lang } from './i18n'
import { mountLearn, pt } from './pedagogy/card'
import { mountExplore } from './pedagogy/explore'
import { getExperiment, hasRememberedExperiment, markAssembled, setExperiment, wasAssembled } from './pedagogy/experiment'
import { getMode, setMode } from './pedagogy/mode'
import type { Focus, mountBench, Pick } from './views/bench'
import type { Reserve } from './views/bench-assembly-geometry'
import type { mountForge } from './views/forge'
import { readPalette } from './views/canvas'
import { mountGoniometer } from './views/goniometer'
import { mountAbout } from './views/about'
import { at } from './views/assembly-i18n'
import { mountAssemblyHud } from './views/assembly-hud'
import { mountChooser } from './views/chooser'
import { absorbersLoaded, loadAbsorbers } from './physics/tables'
import { mountHuygens } from './views/huygens'
import { mountPanel } from './views/panel'
import { mountSetup } from './views/setup'
import { mountSound } from './views/sound'
import { mountSpectrum } from './views/spectrum'

type Theme = 'auto' | 'light' | 'dark'
const THEMES: Theme[] = ['auto', 'light', 'dark']
const SCALES = [1, 10, 100, Infinity]
const CARDS = ['panel', 'monitor', 'chamber'] as const
const TOAST_MS = 2500
const DESKTOP = matchMedia('(min-width: 1024px)') // as in app.css

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <header class="topbar">
    <h1 data-title></h1>
    <div class="tools">
      <button class="tool" data-experiment></button>
      <button class="tool" data-learn aria-controls="learn" aria-pressed="false"></button>
      <button class="tool explore" data-forge aria-controls="forge" aria-pressed="false"></button>
      <button class="tool more" data-more aria-controls="tools-more" aria-expanded="false">⋯</button>
      <div class="tools-more" id="tools-more" data-open="false">
        <label class="scale"><span class="sim-tag" aria-hidden="true" data-sim-tag></span><span class="visually-hidden" data-scale-label></span>
          <select data-scale>${SCALES.map((x) => `<option value="${x}">${x === Infinity ? '' : `×${x}`}</option>`).join('')}</select>
        </label>
        <button class="tool explore" data-huygens aria-controls="huygens" aria-pressed="false">λ</button>
        <button class="tool" data-theme></button>
        <button class="tool" data-lang></button>
        <button class="tool about-btn" data-about></button>
      </div>
    </div>
  </header>
  <main class="stage" data-view="room">
    <canvas class="bench" data-bench role="img"></canvas>
    <p class="no3d" data-no3d hidden></p>
    <button class="act-strip" data-act hidden></button>
    <aside class="asm" data-asm></aside>
    <p class="bench-tip" data-tip hidden></p>
    <button class="view-reset" data-view-reset hidden></button>
    <p class="toast" role="status" data-toast></p>
    <div class="dock" role="group" data-dock>
      <button class="gear" data-go="panel"><span aria-hidden="true">⚙︎</span><span data-settings></span></button>
      <button class="tool" data-go="monitor"></button>
      <button class="tool" data-go="chamber"></button>
      <button class="tool" data-door></button>
    </div>
    <section class="focus-card panel-card" data-focus="panel" role="dialog" tabindex="-1" aria-labelledby="panel-title" inert>
      <h2 class="card-title" id="panel-title" data-panel-title></h2><button class="tool close" data-back></button>
      <div class="panel" data-panel></div>
    </section>
    <section class="focus-card monitor-card" data-focus="monitor" role="dialog" tabindex="-1" inert>
      <button class="tool close" data-back></button>
      <div class="spectrum" data-spectrum></div>
      <div data-mca hidden></div>
    </section>
    <section class="focus-card chamber-card" data-focus="chamber" role="dialog" tabindex="-1" aria-labelledby="chamber-title" inert>
      <h2 class="card-title" id="chamber-title" data-chamber-title></h2><button class="tool close" data-back></button>
      <div class="led rate" role="group" data-rate-led><output data-rate></output><span class="unit" data-rate-unit></span></div>
      <canvas role="img" data-gonio></canvas><div class="sliders explore" data-explore></div>
      <p class="hint" role="status" data-saturated></p>
      <details class="setup" data-setup></details>
    </section>
    <aside class="sheet inspector" id="learn" data-open="false">
      <button class="tool close" data-close aria-label="">×</button>
      <div class="learn" data-learn-body></div>
      <button class="about-link" data-about-open></button>
    </aside>
    <aside class="sheet inspector" id="huygens" data-open="false">
      <button class="tool close" data-close aria-label="">×</button>
      <div class="huygens" data-huygens-body></div>
    </aside>
  </main>
  <div class="chooser" data-chooser hidden inert></div>
  <div class="forge-sheet" id="forge" role="dialog" aria-modal="true" tabindex="-1" data-open="false" inert></div>`
const q = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel)!

// Theme: automatic (system), light or dark; remembered where storage works.
let theme: Theme = 'auto'
try {
  theme = (THEMES as string[]).includes(localStorage.getItem('theme') ?? '') ? (localStorage.getItem('theme') as Theme) : 'auto'
} catch {}
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  readPalette()
}
applyTheme()
setMode(getMode())
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readPalette()
  forge?.redraw()
})

const apparatus = new Apparatus()
// The bench is assembled by the student before an experiment runs (apparatus/assembly.ts). `bench` hooks are the
// contract with the 3D bench: it reads hooks.assembly and assigns hooks.resolveZone (see BenchAssemblyHooks).
// Gating: until the assembly is done, the panel/monitor/chamber cards and the Learn tasks refuse with a hint; the
// Apparatus itself is untouched (no panel, no HV; its interlock already refuses HV with the door open).
const benchHooks: BenchAssemblyHooks = { assembly: new Assembly(getExperiment()) }
const asm = (): Assembly => benchHooks.assembly
const ready = (): boolean => asm().done()
const sound = mountSound(apparatus)
const gonio = mountGoniometer(q<HTMLCanvasElement>('[data-gonio]'), apparatus)
const spectrum = mountSpectrum(q('[data-spectrum]'), apparatus)
// The MCA view (own lazy chunk) takes the monitor's place while the 559 938 energy detector is mounted.
let mca: ReturnType<typeof import('./views/mca').mountMca> | null = null
let mcaLoading = false
const energyOn = () => apparatus.setup.detector === 'energy'
const monitorView = () => (energyOn() && mca ? mca : spectrum)
const about = mountAbout(q('[data-about]'))
q('[data-about-open]').addEventListener('click', about.open)
const huygens = mountHuygens(q('[data-huygens-body]'), apparatus)
const panel = mountPanel(q('[data-panel]'), apparatus, sound.detent)
const explore = mountExplore(q('[data-explore]'), apparatus)
const setup = mountSetup(q<HTMLDetailsElement>('[data-setup]'), apparatus)
const learn = mountLearn(q('[data-learn-body]'), apparatus, {
  onMode: applyMode,
  ready,
  notReadyHint: () => at().gateTasks,
  onFocus: (keys) => {
    panel.focus(keys)
    // the settings button leads there: a badge, and the same said to screen readers
    const gear = q('[data-go="panel"]')
    gear.toggleAttribute('data-task', !!keys?.length)
    if (keys?.length) gear.setAttribute('aria-description', t().taskNeedsPanel)
    else gear.removeAttribute('aria-description')
  },
  // Below desktop the card is a bottom sheet over the instrument: step aside for the act step (the act
  // strip keeps the instruction, and the frame loop brings the card back once it is met).
  onAct: () => {
    if (!DESKTOP.matches) openSheet(learnSheet, false, false)
  },
})
const stage = q('.stage')
const huygensSheet = q('#huygens')
const learnSheet = q('#learn')
const actStrip = q<HTMLButtonElement>('[data-act]')
const viewReset = q<HTMLButtonElement>('[data-view-reset]')
viewReset.addEventListener('click', () => bench?.resetView())
const inspectors = [learnSheet, huygensSheet]
const opener = (sheet: HTMLElement) => q(sheet === learnSheet ? '[data-learn]' : '[data-huygens]')

function labels() {
  const s = t()
  document.documentElement.lang = getLang()
  document.title = s.title
  q('[data-title]').textContent = s.titleShort
  q('[data-sim-tag]').textContent = s.simTag
  q('[data-scale-label]').textContent = `${s.timeScale} (${s.timeScaleNote})`
  q('[data-scale]').title = `${s.simulation}: ${s.timeScale}. ${s.timeScaleNote}`
  q('[data-scale] option:last-child').textContent = '×∞' // short for the phone topbar; the title names it
  q('[data-scale] option:last-child').title = s.instant
  viewReset.textContent = at().resetView
  viewReset.title = at().resetViewHint
  q('[data-huygens]').setAttribute('aria-label', s.huygens)
  q('[data-huygens]').title = s.huygens
  q('[data-learn]').textContent = pt().learn
  q('[data-forge]').textContent = s.forge
  const themeLabel = `${s.theme}: ${s.themes[theme]}`
  q('[data-theme]').setAttribute('aria-label', themeLabel)
  q('[data-theme]').title = themeLabel
  q('[data-theme]').textContent = { auto: '◐', light: '○', dark: '●' }[theme]
  q('[data-lang]').textContent = getLang() === 'es' ? 'EN' : 'ES'
  q('[data-lang]').setAttribute('aria-label', s.language)
  about.build()
  q('[data-about-open]').textContent = t().aboutTitle
  q('[data-gonio]').setAttribute('aria-label', getMode() === 'explore' ? `${s.gonioLabel}. ${s.dragCrystal}` : s.gonioLabel)
  for (const b of app.querySelectorAll('[data-close]')) b.setAttribute('aria-label', s.close)
  for (const b of app.querySelectorAll('.focus-card > [data-back]')) (b.setAttribute('aria-label', s.back), (b.textContent = '×'))
  q('[data-bench]').setAttribute('aria-label', s.benchLabel)
  q('[data-no3d]').textContent = s.no3d
  q('[data-experiment]').textContent = at().experiment
  q('[data-more]').setAttribute('aria-label', at().moreTools)
  q('[data-more]').title = at().moreTools
  q('[data-settings]').textContent = s.settings
  q('[data-go="monitor"]').textContent = s.monitor
  q('[data-go="chamber"]').textContent = s.chamber
  q('[data-go="chamber"]').title = s.chamberLabel
  q('[data-panel-title]').textContent = s.panel
  q('[data-chamber-title]').textContent = s.chamberLabel
  q('[data-dock]').setAttribute('aria-label', s.dock)
  q('[data-rate-led]').setAttribute('aria-label', s.topDisplay)
  doorLabel()
}
function doorLabel() {
  const text = apparatus.doorsClosed ? t().doorOpen : t().doorClose
  if (q('[data-door]').textContent !== text) q('[data-door]').textContent = text
}
labels()

function openSheet(sheet: HTMLElement, open: boolean, moveFocus = true) {
  if (!open && moveFocus && sheet === learnSheet) learn.sheetClosed() // the student closed it (not the act step stepping aside)
  sheet.dataset.open = String(open)
  // One inspector at a time: Learn and Huygens share the right-hand column (the bottom sheet on phones).
  for (const o of inspectors) {
    if (o !== sheet && open) o.dataset.open = 'false'
    opener(o).setAttribute('aria-pressed', o.dataset.open!)
  }
  stage.toggleAttribute('data-inspector', open)
  // ponytail: focus moves in and back, no focus trap (the sheet is non-modal, Esc closes it)
  if (moveFocus) (open ? sheet.querySelector<HTMLElement>('[data-close]')! : opener(sheet)).focus()
  labels()
}

// The bench: the camera flies to a part, then its card fades in (CSS delays it by half the flight).
let bench: ReturnType<typeof mountBench> | null = null
let focus: Focus = 'room'
function setFocus(f: Focus) {
  if (f === focus) return
  if (f !== 'room' && !ready() && !(f === 'panel' && asm().current()?.id === ZERO_STEP)) return showToast(at().gateHint) // the last step needs the panel alone
  const prev = focus
  focus = f
  stage.dataset.view = f
  for (const c of CARDS) q(`[data-focus="${c}"]`).inert = c !== f
  q('[data-dock]').inert = f !== 'room'
  bench?.fly(f)
  if (f !== 'room') q(`[data-focus="${f}"]`).focus() // the card, not its ×: no focus ring after a tap
  else if (prev !== 'room') q(`[data-go="${prev}"]`).focus()
}
function onPick(p: Pick | null) {
  if (p === 'door') toggleDoor()
  else if (p) setFocus(p)
  else setFocus('room') // a tap on the empty room: back out
}
let toastTimer: ReturnType<typeof setTimeout> | undefined
function toggleDoor() {
  if (!apparatus.doorsClosed) {
    // closing: the bench must be fully assembled, and the Apparatus must really carry the assembled setup (the absorber
    // tables may still be loading: closing the door then would run the attenuation with the crystal)
    const gateState = asm().doorGate(apparatus.setup)
    if (gateState === 'notReady') {
      bench?.shake()
      return showToast(at().gateHint)
    }
    if (gateState === 'loading') {
      bench?.shake()
      void loadAbsorbers().then(syncApparatus, () => showToast(at().loadFailed))
      return showToast(at().loadingParts)
    }
  }
  if (apparatus.setDoors(!apparatus.doorsClosed)) return
  // Refused by the interlock: say why.
  bench?.shake()
  showToast(t().doorLocked)
}
function showToast(text: string) {
  const el = q('[data-toast]')
  // Below desktop the assembly HUD is a bottom sheet: the toast rides above it (the measured height), not over it.
  const hudEl = q('[data-asm]')
  const hr = hudEl.getBoundingClientRect()
  if (!DESKTOP.matches && !hudEl.hidden && hr.width > 0) el.style.bottom = `${Math.max(0, stage.getBoundingClientRect().bottom - hr.top) + 8}px`
  else el.style.removeProperty('bottom')
  el.textContent = '' // so a repeated message is announced again
  el.textContent = text
  el.dataset.show = 'true'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.dataset.show = 'false'), TOAST_MS)
}
// ── Experiment choice and assembly ──
let chosen: Experiment | null = null
const hud = mountAssemblyHud(q('[data-asm]'), benchHooks, {
  toast: (m) => showToast(m),
  teacherShortcut: () => wasAssembled(asm().experiment),
  onTeacher: () => {
    // the absorber tables must be in before the Apparatus can mount a wheel or a filter
    const go = () => {
      asm().autoComplete() // mounts the setup and closes the door through syncApparatus
      apparatus.press('ZERO') // the last step, done for the teacher
    }
    if (asm().experiment === 'attenuation' && !absorbersLoaded()) void loadAbsorbers().then(go, () => showToast(at().loadFailed))
    else go()
  },
  title: () => at().cards[asm().experiment].title,
})
const chooser = mountChooser(q('[data-chooser]'), {
  onChoose: chooseExperiment,
  active: () => chosen,
  remembered: () => (hasRememberedExperiment() ? getExperiment() : null),
})
/** The Apparatus carries the setup the assembly describes (or the assembly has none yet). */
const setupMatches = (): boolean => asm().doorGate(apparatus.setup) !== 'loading'
let adopting = false
/** Mirror the assembly on the Apparatus: mount the setup while the door is open, close the door for a teacher shortcut. */
function syncApparatus() {
  if (adopting) return // the assembly just took over the Apparatus's own setup
  const A = asm()
  const want = A.setup()
  if (want && !apparatus.doorsClosed && !sameSetup(apparatus.setup, want)) {
    if ((want.holder.endsWith('Wheel') || want.collimatorFilter) && !absorbersLoaded()) void loadAbsorbers().then(syncApparatus, () => {})
    else {
      try {
        apparatus.mount(want)
      } catch {}
    }
  }
  if (A.done() && A.doorClosed() && !apparatus.doorsClosed && setupMatches()) apparatus.setDoors(true)
}
// One source of truth for the swappable parts: a setup that changes on the Apparatus from outside (a guided task, the setup
// tray) is adopted by the assembly, so its tray, swap rules and 3D parts follow.
let seenSetup = apparatus.setup
let seenZero = apparatus.zeroPresses
function followApparatus() {
  if (apparatus.zeroPresses !== seenZero) {
    seenZero = apparatus.zeroPresses
    asm().notifyZero()
  }
  if (apparatus.setup !== seenSetup) {
    seenSetup = apparatus.setup
    adopting = true
    try {
      asm().adopt(apparatus.setup)
    } finally {
      adopting = false
    }
  }
}
let lastReady = false
function gate() {
  const on = ready()
  const zeroStep = asm().current()?.id === ZERO_STEP
  for (const b of app.querySelectorAll<HTMLElement>('.dock [data-go]')) b.setAttribute('aria-disabled', String(!(on || (zeroStep && b.dataset.go === 'panel'))))
  if (on && !lastReady) markAssembled(asm().experiment)
  if (on !== lastReady) {
    lastReady = on
    learn.build()
  }
}
function chooseExperiment(exp: Experiment) {
  chosen = exp
  setExperiment(exp)
  // a fresh bench: HV off, arms home, default setup, door open for the assembly
  apparatus.press('RESET')
  apparatus.setDoors(false)
  try {
    apparatus.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' })
  } catch {}
  seenSetup = apparatus.setup
  seenZero = apparatus.zeroPresses
  if (exp === 'attenuation') void loadAbsorbers().catch(() => {}) // the wheels and the Zr foil need the tables
  setFocus('room')
  learn.reset()
  const A = new Assembly(exp)
  A.onChange(syncApparatus)
  A.onChange(gate)
  hud.attach(A) // replaces benchHooks.assembly and tells the bench (onAssembly)
  lastReady = false
  gate()
  showToast(at().switched(at().cards[exp].title))
}
{
  const A = asm()
  A.onChange(syncApparatus)
  A.onChange(gate)
  hud.attach(A)
}

// The part of the stage the assembly HUD covers (css px): a side column on desktop, a bottom sheet (above the dock) below it.
// While the HUD is a sheet its height only grows during one assembly, so the chamber does not jump from step to step.
let sheetPx = 0
let sheetFor: Assembly | null = null
function benchReserve(): Reserve {
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  const hudEl = q('[data-asm]')
  const st = stage.getBoundingClientRect()
  const dock = q('[data-dock]').getBoundingClientRect()
  const dockPx = Math.max(0, st.bottom - dock.top + 8)
  if (hudEl.hidden || hudEl.getBoundingClientRect().width === 0) return { ...none, bottom: dockPx }
  const r = hudEl.getBoundingClientRect()
  if (DESKTOP.matches) return { ...none, left: Math.max(0, r.right - st.left + 16), bottom: dockPx }
  if (sheetFor !== asm()) ((sheetFor = asm()), (sheetPx = 0))
  sheetPx = Math.max(sheetPx, st.bottom - r.top + 8)
  return { ...none, bottom: Math.max(sheetPx, dockPx) }
}

import('./views/bench')
  .then(({ mountBench }) => {
    bench = mountBench(q<HTMLCanvasElement>('[data-bench]'), apparatus, { monitor: monitorView, dialDeg: panel.dialDeg }, onPick, benchHooks, {
      reserve: benchReserve,
      tip: q('[data-tip]'),
    })
    if (import.meta.env.DEV) (window as unknown as { __benchZones: unknown }).__benchZones = () => bench?.debug()
    if (focus !== 'room') bench.fly(focus) // a card opened before the chunk arrived
  })
  .catch(() => {
    // No WebGL (or the chunk failed): the dock still opens every card.
    stage.toggleAttribute('data-no3d', true)
    q('[data-no3d]').hidden = false
  })

// The Materials Forge: a full-screen sheet in its own lazy chunk (the worker and tables load when it builds).
const forgeSheet = q('#forge')
let forge: ReturnType<typeof mountForge> | null = null
const underForge: HTMLElement[] = []
async function openForge(open: boolean) {
  if (open && !forge) {
    try {
      forge = (await import('./views/forge')).mountForge(forgeSheet, apparatus, (msg) => {
        void openForge(false)
        showToast(msg)
      })
    } catch {
      return // chunk failed to load: the button just does nothing
    }
  }
  forgeSheet.dataset.open = String(open)
  forgeSheet.inert = !open
  q('[data-forge]').setAttribute('aria-pressed', String(open))
  // modal: the rest of the app is inert while the sheet is open (only what was live before is restored)
  if (open) {
    for (const el of app.children as Iterable<HTMLElement>) if (el !== forgeSheet && !el.inert) ((el.inert = true), underForge.push(el))
  } else for (const el of underForge.splice(0)) el.inert = false
  ;(open ? forgeSheet : q('[data-forge]')).focus()
}

/** Explore ↔ Lab: lab mode hides every reveal (λ panel, overlays, sliders, λ in the readout). */
function applyMode() {
  if (getMode() === 'lab' && forgeSheet.dataset.open === 'true') void openForge(false)
  if (getMode() === 'lab' && huygensSheet.dataset.open === 'true') openSheet(huygensSheet, false, false)
  labels()
}

// A shared Forge link (?forge=<code>): the param is consumed on load so a reload doesn't re-apply it over later edits.
if (new URLSearchParams(location.search).has('forge')) {
  void (async () => {
    const share = await import('./views/forge-share')
    const link = share.readForgeParam(location.search)
    history.replaceState(history.state, '', share.withoutForgeParam(location.href))
    if (link && 'input' in link) {
      if (getMode() === 'lab') {
        setMode('explore')
        applyMode()
      }
      await openForge(true)
      ;(forge as ReturnType<typeof mountForge> | null)?.open(link.input) // openForge assigned it; TS narrowed it to null
    } else {
      const { ft } = await import('./views/forge-i18n')
      showToast(ft().badLinkToast)
    }
  })()
}

app.addEventListener('click', (e) => {
  if (e.target === stage) return setFocus('room') // the scrim round an open card
  const b = (e.target as HTMLElement).closest<HTMLElement>('button')
  if (!b) return
  if (b.dataset.more !== undefined) setMore(q('#tools-more').dataset.open !== 'true')
  else if (b.dataset.experiment !== undefined) chooser.open()
  else if (b.dataset.go) setFocus(b.dataset.go as Focus)
  else if (b.dataset.back !== undefined) setFocus('room')
  else if (b.dataset.door !== undefined) toggleDoor()
  else if (b.dataset.forge !== undefined) void openForge(forgeSheet.dataset.open !== 'true')
  else if (b.dataset.forgeClose !== undefined) void openForge(false)
  else if (b.dataset.huygens !== undefined) openSheet(huygensSheet, huygensSheet.dataset.open !== 'true')
  else if (b.dataset.learn !== undefined) openSheet(learnSheet, learnSheet.dataset.open !== 'true')
  else if (b.dataset.close !== undefined) openSheet(b.closest<HTMLElement>('.inspector')!, false)
  else if (b.dataset.act !== undefined) openSheet(learnSheet, true)
  else if (b.dataset.theme !== undefined) {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    try {
      localStorage.setItem('theme', theme)
    } catch {}
    applyTheme()
    labels()
    forge?.redraw()
  } else if (b.dataset.lang !== undefined) {
    setLang((getLang() === 'es' ? 'en' : 'es') as Lang)
    labels()
    panel.build()
    spectrum.build()
    mca?.build()
    huygens.build()
    hud.render()
    if (chooser.isOpen()) chooser.build()
    explore.build()
    setup.build()
    learn.build()
    forge?.build()
  }
})
q<HTMLSelectElement>('[data-scale]').addEventListener('change', (e) => {
  apparatus.timeScale = Number((e.target as HTMLSelectElement).value)
})
function setMore(open: boolean) {
  q('#tools-more').dataset.open = String(open)
  q('[data-more]').setAttribute('aria-expanded', String(open))
}
addEventListener('pointerdown', (e) => {
  if (q('#tools-more').dataset.open === 'true' && !(e.target as HTMLElement).closest('.tools')) setMore(false)
})
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && q('#tools-more').dataset.open === 'true') return void (setMore(false), q('[data-more]').focus())
  if (e.key !== 'Escape') return
  if (forgeSheet.dataset.open === 'true') return void openForge(false)
  const inspector = inspectors.find((o) => o.dataset.open === 'true')
  if (inspector) openSheet(inspector, false)
  else setFocus('room')
})

// Keep the screen on while a program runs: a locked phone stops requestAnimationFrame, and a
// 38-minute scan at ×1 would silently stall. Unsupported or refused: the scan just pauses meanwhile.
let wakeLock: WakeLockSentinel | null = null
let wakeLockPending = false
function keepAwake(on: boolean) {
  if (on && !wakeLock && !wakeLockPending && 'wakeLock' in navigator) {
    wakeLockPending = true
    navigator.wakeLock.request('screen').then(
      (l) => (wakeLock = l).addEventListener('release', () => (wakeLock = null)),
      () => {},
    ).finally(() => (wakeLockPending = false))
  } else if (!on && wakeLock) {
    void wakeLock.release()
    wakeLock = null
  }
}

let last = performance.now()
let counting = false
function frame(now: number) {
  const dtS = Math.min((now - last) / 1000, 1) // cap: a background tab must not jump ahead
  last = now
  apparatus.tick(dtS)
  gonio(dtS)
  if (energyOn() && !mca && !mcaLoading) {
    mcaLoading = true
    import('./views/mca')
      .then((m) => (mca = m.mountMca(q('[data-mca]'), apparatus)))
      .catch(() => (mcaLoading = false)) // offline: tried again on the next frame
  }
  const shown = monitorView()
  for (const [view, el] of [[spectrum, '[data-spectrum]'], [mca, '[data-mca]']] as const) q(el).hidden = view !== shown
  const name = mca && shown === mca ? mca.title() : t().spectrum // the card is named after the view it shows
  const card = q('[data-focus="monitor"]')
  if (card.getAttribute('aria-label') !== name) card.setAttribute('aria-label', name)
  shown.render() // before the bench: the monitor copies it
  bench?.render(dtS)
  doorLabel()
  if (asm().doorClosed() !== apparatus.doorsClosed) asm().setDoor(apparatus.doorsClosed) // the Apparatus owns the door
  followApparatus()
  if (focus === 'chamber') {
    // the counter's reading next to the goniometer, as the device's top display shows it
    const d = apparatus.display()
    if (q('[data-rate]').textContent !== d.top) q('[data-rate]').textContent = d.top
    if (q('[data-rate-unit]').textContent !== d.topUnit) q('[data-rate-unit]').textContent = d.topUnit
    const sat = apparatus.saturated ? t().saturated : ''
    const satEl = q('.chamber-card [data-saturated]') // the panel card has its own, earlier in the markup
    if (satEl.textContent !== sat) satEl.textContent = sat
    setup.render()
  }
  // SCAN passed its self-test: step back from the panel to watch the arms move and the monitor fill.
  const nowCounting = apparatus.phase === 'positioning' || apparatus.phase === 'scan'
  if (nowCounting && !counting && focus === 'panel') setFocus('room')
  counting = nowCounting
  if (huygensSheet.dataset.open === 'true') huygens.render(dtS)
  panel.render()
  if (getMode() === 'explore') explore.render()
  // A task met while its sheet is closed (the student is at the instrument): bring the card back.
  if (learn.render() && learnSheet.dataset.open !== 'true') openSheet(learnSheet, true)
  // Meanwhile its instruction stays on show over the goniometer.
  const act = learnSheet.dataset.open === 'true' ? null : learn.actText()
  if (actStrip.hidden !== (act === null)) actStrip.hidden = act === null
  const showReset = !!bench?.assemblyActive() && focus === 'room'
  if (viewReset.hidden === showReset) viewReset.hidden = !showReset
  if (act !== null && actStrip.textContent !== act) actStrip.textContent = act
  sound.render()
  keepAwake(apparatus.busy)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
chooser.open() // at every page open the student chooses the experiment first
