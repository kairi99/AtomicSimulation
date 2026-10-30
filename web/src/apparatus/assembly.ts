// Assembly of the 554 800 bench: the order in which a student mounts the parts before an experiment starts.
// Pure state machine (no DOM, no three.js, no Apparatus instance): the HUD (views/assembly-hud.ts) and the 3D
// bench render it; the paraphrased steps follow LD leaflets P7.1.2.1 (Bragg, NaCl) and P6.3.2.1 (attenuation)
// and the 554 800 instruction sheet.
//
// ── How a view uses it ───────────────────────────────────────────────────────────────────────────────────
//   const asm = new Assembly('bragg')
//   asm.current()          the step to do now (null when done); asm.index() / asm.steps.length for progress
//   asm.place(part, zone)  the one way to mount a part: { ok: true } or { ok: false, reason }
//   asm.zonesFor(part)     zones that accept the part right now (highlight them while it is dragged)
//   asm.mounted(part)      is the part on the device now (show/hide its 3D mesh). The counter cap starts mounted
//                          (on the counter) and the target stage starts mounted on the holder for BOTH experiments:
//                          the attenuation guide removes it (the absorbers need the holder), Bragg keeps it (the
//                          crystal lies flat on it).
//   asm.inChamber(part)    the counter lies loose on the chamber floor during the cap step (its tray item is then
//                          "in the chamber" and not a second source); from the next step it is a tray part.
//   asm.distance('s1'|'s2')  cm, for placing the (always mounted) goniometer and the sensor holder. Bragg: s1 collimator slit to the
//                          target axis, s2 axis to the sensor slit. Attenuation (leaflet P6.3.2.1): both are measured to
//                          the EMPTY WINDOW of the absorber set, i.e. from/to a point PLATE_R_CM beyond the axis (the
//                          views add that reference; this class stores the leaflet's numbers).
//                          A distance is edited live (setDistance, only for the CURRENT distance step) and the step
//                          completes only on release/commit (commitDistance): a value passing through the tolerance
//                          band mid-drag does not complete it.
//   asm.setDoor(closed)    tell it the door state. Parts can only be moved with the door open; the step 'door'
//                          completes when the door closes (and both distances are in tolerance). Door state is owned
//                          by the Apparatus.
//   asm.notifyZero()       the Apparatus processed the ZERO key (it counts them in `zeroPresses`): completes the final
//                          step 'zero', during which only the panel card is unlocked.
//   asm.adopt(setup)       the Apparatus setup changed from outside (a guided task, the setup tray): mirror it so the
//                          tray, the swap rules and the 3D parts keep ONE source of truth; setup() then returns it.
//   asm.onChange(cb)       called after every state change (a part, a distance, the door, reset).
//   asm.setup()            the Apparatus `Setup` the finished (or about to be closed) bench corresponds to, else null.
//
// Once done() the assembly stays done and the distances are locked. The attenuation experiment still swaps parts with
// the door open ("free swaps"): zrFilter <-> collimatorTip / tray, absorbersI <-> absorbersII on the targetHolder (one
// set at a time: the other must go to the tray first). Those go through the same place() and change setup().
//
// Gating decision: main.ts treats `!asm.done()` as "bench not ready": the dock's panel/monitor/chamber buttons,
// setFocus() and the Learn tasks refuse with a hint (during the final 'zero' step the panel alone is unlocked). HV cannot
// be switched on without the panel, and the Apparatus's own interlock already refuses HV with the door open.
import type { Setup } from './apparatus'

export type Experiment = 'bragg' | 'attenuation'
export type Part =
  | 'collimator' | 'counterCap' | 'counter' | 'counterCable'
  | 'targetStage' | 'naclCrystal' | 'absorbersI' | 'absorbersII' | 'zrFilter'
export type Zone =
  | 'collimatorMount' | 'sensorSeat' | 'gmSocket'
  | 'targetHolder' | 'tray' | 'collimatorTip'
export type Distance = 's1' | 's2'
export type StepId = string
export type Step = Readonly<{ id: StepId; part?: Part; zone?: Zone; distance?: { which: Distance; targetCm: number; tolCm: number } }>
export type PlaceResult = { ok: true } | { ok: false; reason: 'wrongZone' | 'notYet' | 'alreadyPlaced' | 'wrongPart' | 'doorClosed' | 'setTaken' }

export const EXPERIMENTS: readonly Experiment[] = ['bragg', 'attenuation']
/** Distance range the sliders offer, in cm. */
export const DISTANCE_RANGE_CM = { min: 2, max: 12 } as const
/** Where the distances start: out of tolerance for every step. */
export const START_DISTANCE_CM = 9
export const DOOR_STEP = 'door'
export const ZERO_STEP = 'zero'

const dist = (which: Distance, targetCm: number): Step => ({ id: which, distance: { which, targetCm, tolCm: 0.5 } })
const mount = (part: Part, zone: Zone): Step => ({ id: part, part, zone })

// The goniometer sits permanently on its guide rods and its ribbon cable is already plugged in (as in the real lab):
// they are not parts of the assembly, the 3D bench draws them from the start.
const COMMON: Step[] = [mount('collimator', 'collimatorMount')]
const STEPS: Record<Experiment, readonly Step[]> = {
  bragg: [
    ...COMMON, dist('s1', 5),
    mount('counterCap', 'tray'), mount('counter', 'sensorSeat'), mount('counterCable', 'gmSocket'),
    dist('s2', 6), mount('naclCrystal', 'targetHolder'), { id: DOOR_STEP }, { id: ZERO_STEP },
  ],
  attenuation: [
    ...COMMON,
    mount('counterCap', 'tray'), mount('counter', 'sensorSeat'), mount('counterCable', 'gmSocket'),
    mount('targetStage', 'tray'), mount('absorbersI', 'targetHolder'), dist('s1', 5), dist('s2', 5), { id: DOOR_STEP }, { id: ZERO_STEP },
  ],
}
/** Tray extras that are never right during the assembly (always refused with a reason). */
const DISTRACTORS: Record<Experiment, readonly Part[]> = {
  bragg: ['absorbersI', 'absorbersII', 'zrFilter'],
  attenuation: ['naclCrystal', 'absorbersII', 'zrFilter'],
}

export const stepsFor = (exp: Experiment): readonly Step[] => STEPS[exp]
/** Seeded shuffle (mulberry32 + Fisher-Yates): the tray order must not give the sequence away, yet stay stable. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let x = seed >>> 0
  const rnd = () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = x
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const SEED: Record<Experiment, number> = { bragg: 554800, attenuation: 6321 }
const TRAY: Record<Experiment, readonly Part[]> = {
  bragg: shuffled([...STEPS.bragg.flatMap((s) => (s.part ? [s.part] : [])), ...DISTRACTORS.bragg], SEED.bragg),
  attenuation: shuffled([...STEPS.attenuation.flatMap((s) => (s.part ? [s.part] : [])), ...DISTRACTORS.attenuation], SEED.attenuation),
}
/** Every part shown in the tray of an experiment: the steps' parts and the distractors in one fixed, seeded shuffle. */
export const partsFor = (exp: Experiment): readonly Part[] => TRAY[exp]
/** Do two setups mount the same accessories (the sample only matters for the XRF holder)? */
export const sameSetup = (a: Setup, b: Setup): boolean =>
  a.holder === b.holder && a.crystal === b.crystal && a.collimatorFilter === b.collimatorFilter && a.sensorFilter === b.sensorFilter && (a.detector ?? 'gm') === (b.detector ?? 'gm')
export const isDistractor = (exp: Experiment, part: Part): boolean => DISTRACTORS[exp].includes(part)
/** The zones a student can drop on in an experiment (the tip only matters for the attenuation filter swap). */
export const zonesOf = (exp: Experiment): readonly Zone[] => {
  const z = STEPS[exp].flatMap((s) => (s.zone ? [s.zone] : []))
  const all = [...new Set<Zone>(z)]
  if (exp === 'attenuation') all.push('collimatorTip')
  return all.includes('tray') ? [...all.filter((x) => x !== 'tray'), 'tray'] : all
}

/** The hooks B2 (bench.ts) implements or consumes; main.ts owns the object and passes it around. */
export interface BenchAssemblyHooks {
  /** The CURRENT assembly (main.ts replaces it when the experiment changes, then calls `onAssembly`): show/hide parts
   * from `mounted()`, place the goniometer/sensor holder from `distance()`, listen with `assembly.onChange`. */
  assembly: Assembly
  /** main.ts -> bench: a fresh assembly replaced `assembly` (experiment switched); re-subscribe and redraw. */
  onAssembly?: (a: Assembly) => void
  /** Bench -> HUD: which zone (if any) is under a screen point? The HUD calls it on every pointer move/drop of a
   * dragged tray item. B2 assigns it once the 3D scene exists; until then the HUD falls back to its zone list. */
  resolveZone?: (clientX: number, clientY: number) => Zone | null
  /** HUD -> bench: a tray drag begins (`zones` = assembly.zonesFor(part): highlight them). */
  onDragStart?: (part: Part, zones: readonly Zone[]) => void
  /** HUD -> bench: pointer moved; `over` is resolveZone's answer (highlight it as hot). */
  onDragMove?: (part: Part, clientX: number, clientY: number, over: Zone | null) => void
  /** HUD -> bench: drag ended (`dropped` = the zone under the pointer, `result` = what assembly.place answered, null when no zone). */
  onDragEnd?: (part: Part, dropped: Zone | null, result: PlaceResult | null) => void
  /** Bench -> HUD: a pointerdown on a part that is on the device (the cap, the target stage, the Zr filter, an absorber set)
   * starts the same drag lifecycle as a tray item (ghost chip, onDragStart/Move/End, drop on the HUD = back to the tray). */
  beginDrag?: (part: Part, e: PointerEvent) => void
}

export class Assembly {
  readonly experiment: Experiment
  readonly steps: readonly Step[]
  private idx = 0
  private on = new Set<Part>()
  private d: Record<Distance, number> = { s1: START_DISTANCE_CM, s2: START_DISTANCE_CM }
  private doorShut = false
  private zeroed = false
  /** A setup the Apparatus got from outside (a task, the setup tray); null while the parts say it all. */
  private ext: Setup | null = null
  private listeners = new Set<() => void>()
  private readonly doorIdx: number

  constructor(experiment: Experiment) {
    this.experiment = experiment
    this.steps = STEPS[experiment]
    this.doorIdx = this.steps.findIndex((s) => s.id === DOOR_STEP)
    this.reset(false)
  }

  current(): Step | null {
    return this.steps[this.idx] ?? null
  }
  index(): number {
    return this.idx
  }
  done(): boolean {
    return this.idx >= this.steps.length
  }
  /** Everything before the door step is done and the distances are in tolerance (the bench can be mounted on the Apparatus now). */
  setupReady(): boolean {
    return this.idx >= this.doorIdx && this.distancesOk()
  }
  /** Every distance step's value is within its tolerance. */
  private distancesOk(): boolean {
    return this.steps.every((s) => !s.distance || Math.abs(this.d[s.distance.which] - s.distance.targetCm) <= s.distance.tolCm + 1e-9)
  }
  doorClosed(): boolean {
    return this.doorShut
  }
  distance(which: Distance): number {
    return this.d[which]
  }
  mounted(part: Part): boolean {
    return this.on.has(part)
  }
  /** The part still lies loose in the chamber (the counter during the cap step): the tray must not offer it as well. */
  inChamber(part: Part): boolean {
    return part === 'counter' && this.current()?.id === 'counterCap'
  }
  parts(): readonly Part[] {
    return partsFor(this.experiment)
  }
  zones(): readonly Zone[] {
    return zonesOf(this.experiment)
  }

  /** Zones that would accept `part` now (for highlighting during a drag). */
  zonesFor(part: Part): Zone[] {
    if (this.doorShut) return []
    if (this.done()) {
      if (this.experiment !== 'attenuation') return []
      if (part === 'zrFilter') return [this.on.has(part) ? 'tray' : 'collimatorTip']
      if (part === 'absorbersI' || part === 'absorbersII') return [this.on.has(part) ? 'tray' : 'targetHolder']
      return []
    }
    const s = this.current()
    return s?.part === part && s.zone ? [s.zone] : []
  }

  place(part: Part, zone: Zone): PlaceResult {
    if (!this.parts().includes(part)) return { ok: false, reason: 'wrongPart' }
    if (this.doorShut) return { ok: false, reason: 'doorClosed' }
    const known = this.steps.findIndex((s) => s.part === part)
    if (this.done()) return this.swap(part, zone, known >= 0)
    if (known < 0) return { ok: false, reason: 'wrongPart' }
    if (known < this.idx) return { ok: false, reason: 'alreadyPlaced' }
    if (known > this.idx) return { ok: false, reason: 'notYet' }
    if (zone !== this.steps[known].zone) return { ok: false, reason: 'wrongZone' }
    if (zone === 'tray') this.on.delete(part)
    else this.on.add(part)
    this.idx++
    this.advance()
    return { ok: true }
  }

  /** Free swaps after the assembly: only the attenuation experiment has any. */
  private swap(part: Part, zone: Zone, inSteps: boolean): PlaceResult {
    const has = this.on.has(part)
    const fail = (reason: 'wrongZone' | 'alreadyPlaced' | 'wrongPart' | 'setTaken'): PlaceResult => ({ ok: false, reason })
    if (this.experiment !== 'attenuation' || (part !== 'zrFilter' && part !== 'absorbersI' && part !== 'absorbersII')) return fail(inSteps ? 'alreadyPlaced' : 'wrongPart')
    const home: Zone = part === 'zrFilter' ? 'collimatorTip' : 'targetHolder'
    if (zone !== home && zone !== 'tray') return fail('wrongZone')
    if ((zone === 'tray') === !has) return fail('alreadyPlaced') // already where it is asked to go
    if (zone === 'tray') this.on.delete(part)
    else {
      // one set in the groove: the student takes the other out first (it goes to the tray), then places this one
      const other: Part | null = part === 'absorbersI' ? 'absorbersII' : part === 'absorbersII' ? 'absorbersI' : null
      if (other && this.on.has(other)) return fail('setTaken')
      this.on.add(part)
    }
    this.ext = null
    this.emit()
    return { ok: true }
  }

  /** Edit a distance live (cm, clamped to the slider range). Only the CURRENT distance step's distance can be edited, and
   * nothing completes here: the step is committed on release (`commitDistance`). Returns whether the value is within
   * that step's tolerance (for the live note). After the assembly (and before the step) distances are locked. */
  setDistance(which: Distance, cm: number): boolean {
    const s = this.current()
    if (!Number.isFinite(cm) || s?.distance?.which !== which) return false
    cm = Math.min(DISTANCE_RANGE_CM.max, Math.max(DISTANCE_RANGE_CM.min, cm))
    if (cm !== this.d[which]) {
      this.d[which] = cm
      this.emit()
    }
    return Math.abs(cm - s.distance.targetCm) <= s.distance.tolCm + 1e-9
  }

  /** The student let go (pointer up, slider/number `change`): the current distance step completes if the value is in tolerance. */
  commitDistance(which: Distance): boolean {
    const s = this.current()
    if (s?.distance?.which !== which || Math.abs(this.d[which] - s.distance.targetCm) > s.distance.tolCm + 1e-9) return false
    this.idx++
    this.advance()
    return true
  }

  /** The door state (owned by the Apparatus). Closing it at the door step moves on to the ZERO step. */
  setDoor(closed: boolean): void {
    if (closed === this.doorShut) return
    this.doorShut = closed
    this.advance()
  }

  /** The Apparatus processed the ZERO key. It completes the final step (earlier presses do not count). */
  notifyZero(): void {
    if (this.current()?.id !== ZERO_STEP) return
    this.zeroed = true
    this.advance()
  }

  /** Teacher shortcut: mounts everything, sets the distances, closes the door (the caller mirrors that on the Apparatus). */
  autoComplete(): void {
    for (const s of this.steps) {
      if (s.part) (s.zone === 'tray' ? this.on.delete(s.part) : this.on.add(s.part))
      if (s.distance) this.d[s.distance.which] = s.distance.targetCm
    }
    this.doorShut = true
    this.zeroed = true
    this.ext = null
    this.idx = this.steps.length
    this.emit()
  }

  /** The Apparatus setup changed from outside (a guided task mounting a wheel, the setup tray): mirror what it says about the
   * swappable parts, so the tray, the swap rules and the 3D bench never disagree with it. No effect before the bench is set up. */
  adopt(setup: Setup): void {
    if (!this.setupReady()) return
    this.ext = null
    if (sameSetup(setup, this.setup()!)) return
    if (this.experiment === 'attenuation') {
      this.setMounted('absorbersI', setup.holder === 'alWheel')
      this.setMounted('absorbersII', setup.holder === 'materialWheel')
      this.setMounted('zrFilter', setup.collimatorFilter === 'Zr')
    } else this.setMounted('naclCrystal', setup.holder === 'crystal')
    this.ext = sameSetup(setup, this.setup()!) ? null : setup // anything the parts cannot express (an XRF sample, LiF) is kept as it is
    this.emit()
  }
  private setMounted(part: Part, on: boolean): void {
    if (on) this.on.add(part)
    else this.on.delete(part)
  }

  /** Back to the empty chamber (the experiment stays). `emit` is false only inside the constructor. */
  reset(emit = true): void {
    this.idx = 0
    this.on = new Set<Part>(['counterCap', 'targetStage'])
    this.d = { s1: START_DISTANCE_CM, s2: START_DISTANCE_CM }
    this.doorShut = false
    this.zeroed = false
    this.ext = null
    this.advance(emit)
  }

  /** The Apparatus setup this bench corresponds to; null while parts are still missing. */
  setup(): Setup | null {
    if (!this.setupReady()) return null
    if (this.ext) return this.ext
    if (this.experiment === 'bragg') return { holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' }
    const holder = this.on.has('absorbersI') ? 'alWheel' : this.on.has('absorbersII') ? 'materialWheel' : 'empty'
    return { holder, crystal: 'NaCl', collimatorFilter: this.on.has('zrFilter') ? 'Zr' : null, sensorFilter: null, detector: 'gm' }
  }

  /** May the door close now? 'notReady': parts or distances are still missing; 'loading': the Apparatus does not carry the
   * assembled setup yet (the absorber tables are still loading), so closing would run the experiment with the wrong parts. */
  doorGate(apparatusSetup: Setup): 'ok' | 'notReady' | 'loading' {
    const want = this.setup()
    if (!want) return 'notReady'
    return sameSetup(apparatusSetup, want) ? 'ok' : 'loading'
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb()
  }

  /** Move past the current step when it is satisfied by the state (door shut, ZERO pressed); a part or a committed distance
   * moves on by itself before calling this. */
  private advance(emit = true): void {
    for (;;) {
      const s = this.current()
      if (!s) break
      const met = s.id === DOOR_STEP ? this.doorShut && this.distancesOk() : s.id === ZERO_STEP ? this.zeroed : false
      if (!met) break
      this.idx++
    }
    if (emit) this.emit()
  }
}
