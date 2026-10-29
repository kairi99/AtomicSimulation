// A guided task: predict → act → observe → explain (write-guided-task skill). Its success condition asks
// the physics model or the apparatus, never a hand-tuned number.
import type { Apparatus, Holder, Key, Mode, Setup } from '../apparatus/apparatus'
import { FOILS_MG_CM2 } from '../physics/tables'
import type { AppMode } from './mode'

export type GuidedTask = {
  /** Which experiment lists it in Learn (default: attenuation for ids `attenuation-*` and `background`, else Bragg; see taskExperiment). */
  experiment?: 'bragg' | 'attenuation'
  id: string // also the key of its strings in pedagogy/i18n
  mode: AppMode
  level: 1 | 2 | 3 // 1 intro · 2 core · 3 challenge
  /** Panel keys the task needs; the others are dimmed, not disabled. 'U' and 'I' also cover the sliders. */
  controls: Key[]
  initial: { U_kV?: number; I_mA?: number; mode?: Mode; dt_s?: number; dBeta_deg?: number; limits_deg?: [number, number] }
  /** A number with a unit, or one of the task's `options` strings (by index). */
  predict: { kind: 'number'; unit: string } | { kind: 'choice'; answer: number }
  /** `from` is the exposure-log length when the act step opened: the exposure tasks count only the records at or after it. */
  success: (a: Apparatus, from?: number) => boolean
  /** True for the tasks that read the exposure log (the act step then says how many earlier exposures it ignores). */
  countsExposures?: boolean
  /** True for the tasks that read the MCA run log (`a.mcaLog`): `from` is its length when the act step opened, and the
   * task needs a run at or after it (the card says how many earlier runs there are). */
  countsMcaRuns?: boolean
  /** Crystal preset the teacher puts on the crystal holder at the start (default 'NaCl'). */
  crystal?: string
  /** The setup tray's crystal picker stays on `crystal` while the task is active (default true). */
  crystalLocked?: boolean
  /** The Forge tasks never mount `crystal` over what the student has on the holder, not even at the first start. */
  keepCrystal?: boolean
  /** The teacher prepares the bench: the mounted detector and sample stay (an energy detector too), and the student gets no
   * 'detectorReset' alert for the RESET that applyInitial presses. RESET still drives the target home. */
  keepDetector?: boolean
  /** What the teacher puts on the target holder at the start; undefined leaves it (the attenuation tasks keep their wheel). */
  holder?: Holder
  /** Optional checklist shown under the act text: what the task has collected so far, by label key. */
  progress?: (a: Apparatus, from?: number) => { key: string; done: boolean }[]
}

/** Start from the device defaults (RESET: HV off, arms driven home), then the task's settings. */
export function applyInitial(a: Apparatus, init: GuidedTask['initial'], crystal = 'NaCl', holder?: Holder, crystalLocked = true, keepCrystal = false, keepDetector = false): void {
  // With the energy detector mounted the emulator's RESET keeps the sensor at 90° (the real one would drive it into the collimator); the teacher's reset relies on that.
  if (keepDetector) a.mca.stop() // the teacher stops the analyser; the spectrum stays
  a.press('RESET')
  // The task setup is the teacher preparing the bench: the doors are opened through the guarded API (RESET left
  // the HV off and the arms idle) and put back as they were. A non-NaCl preset must be loaded first (loadCrystals()).
  // The holder is left alone unless the task names one (the attenuation tasks have a plate wheel there); a task
  // that lets the student pick the crystal keeps the one mounted; no task starts with a foil left over.
  const want = { holder: holder ?? a.setup.holder, crystal: crystalLocked && !keepCrystal ? crystal : a.setup.crystal, collimatorFilter: null, sensorFilter: null, ...(keepDetector ? { detector: a.setup.detector, sample: a.setup.sample } : { detector: 'gm' as const }) }
  const energy = a.setup.detector === 'energy' && !keepDetector
  if (keepDetector && a.alert === 'detectorReset') a.alert = null // the RESET above was the teacher's
  if ((Object.keys(want) as (keyof typeof want)[]).some((k) => a.setup[k] !== want[k])) {
    const closed = a.doorsClosed
    if (!a.setDoors(false)) throw new Error('bench not safe to prepare')
    try {
      if (!a.mount(want)) throw new Error('bench not safe to prepare')
    } finally {
      a.setDoors(closed)
    }
    if (energy) a.press('RESET') // the sensor arm was locked at 90° for the energy detector: drive it home
  }
  if (init.U_kV !== undefined) a.u = Math.round(init.U_kV * 10)
  if (init.I_mA !== undefined) a.i = Math.round(init.I_mA * 100)
  if (init.dt_s !== undefined) a.dt = init.dt_s
  if (init.dBeta_deg !== undefined) a.dBeta = Math.round(init.dBeta_deg * 10)
  if (init.mode) a.press(init.mode)
  if (init.limits_deg) [a.limitLo, a.limitHi] = init.limits_deg.map((d) => Math.round(d * 10))
}

/** The foils a stored setup had in the beam, as expectedRate takes them (as Apparatus.foils()). */
export const foilsOf = (setup: Setup): [string, number][] =>
  [setup.collimatorFilter, setup.sensorFilter].filter((n) => n !== null).map((n) => [n, FOILS_MG_CM2[n]])

// The task on the card, so the setup tray can lock its crystal picker without importing the card.
let active: GuidedTask | null = null
export const setActiveTask = (k: GuidedTask | null): void => void (active = k)
/** The crystal the active task fixes on the picker, or null when none is active or the task allows a choice. */
/** A guided task is on the card and holds its locks (the weak-signal aid then leaves the filter alone). */
export const hasActiveTask = (): boolean => active !== null
export const lockedCrystal = (): string | null => (active && active.crystalLocked !== false ? (active.crystal ?? 'NaCl') : null)
