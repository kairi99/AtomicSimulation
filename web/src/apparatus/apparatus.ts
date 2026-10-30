// Emulator of the LD X-ray apparatus 554 800 with goniometer 554 831 (LD instruction sheet 554 800,
// §6–§8, §11). Pure state machine: no DOM, driven by press(), adjust(), setDoors() and tick().
//
// Settings are integers in device steps (U in 0.1 kV, I in 0.01 mA, angles in 0.1°) and become floats
// only when the physics is called: 100 × 0.01 mA summed in floats is 1.0000000000000007 mA > 1 mA.
import { mulberry32, poisson, type Rng } from '../physics/detector'
import { BETA_MAX_DEG, BETA_MIN_DEG, DEFAULT, SENSOR_MAX_DEG, SENSOR_MIN_DEG, directRate, expectedRate, type ModelParams } from '../physics/scan'
import { MO_KA_PM } from '../physics/constants'
import { crystalByName, dPm, thetaFromLambda, type Crystal } from '../physics/crystal'
import { mcaSpectrum } from '../physics/fluorescence'
import { FOILS_MG_CM2, WHEELS_MG_CM2, XRF, absorbersLoaded, foilOf } from '../physics/tables'
import { Mca } from './mca'
import { armLimits, SENSOR_RANGE, type ArmLimits } from './collision'

export type Key =
  | 'U' | 'I' | 'DT' | 'DBETA' | 'LIMITS' // parameter keys (§7 b3)
  | 'SENSOR' | 'TARGET' | 'COUPLED' | 'ZERO' // scan-mode keys (§7 b4)
  | 'RESET' | 'REPLAY' | 'SCAN' | 'HV' | 'SPEAKER' // operational keys (§7 b5)
export type Mode = 'SENSOR' | 'TARGET' | 'COUPLED'
type Param = 'U' | 'I' | 'DT' | 'DBETA' | 'LIMIT_LO' | 'LIMIT_HI'
/** What sits in the beam path: the crystal, one of the two 554 834 absorber plates, an XRF sample, or nothing. */
export type Holder = 'crystal' | 'alWheel' | 'materialWheel' | 'sample' | 'empty'
/** Accessories mounted with the door open; filter values are FOILS_MG_CM2 names (e.g. 'Zr'). `crystal`: CRYSTALS
 * preset name, only meaningful when the holder is the crystal ('NaCl' needs no table; the others need loadCrystals()).
 * `detector`: the 559 01 GM counter or the 559 938 energy detector (MCA); `sample`: an XRF_SAMPLE_NAMES entry, only
 * meaningful when the holder is the sample (needs loadXrfSample()). Both default (gm, Cu) when mount() gets them omitted. */
export type Setup = Readonly<{ holder: Holder; crystal: string; collimatorFilter: string | null; sensorFilter: string | null; detector?: 'gm' | 'energy'; sample?: string }>
/** The sensor arm angle (0.1°) the energy detector must be mounted at (guide: sensor arm to 90°, in SENSOR mode, first). */
export const ENERGY_SENSOR = 900

/** The crystal preset a setup names (throws if unknown or not loaded; NaCl never needs the table). */
export const crystalOf = (setup: Pick<Setup, 'crystal'>): Crystal => crystalByName(setup.crystal)
export type Phase = 'idle' | 'safety' | 'positioning' | 'scan' | 'exposure'
type Arms = { target: number; sensor: number } // 0.1°

// [min, max, default] in device steps, LD 554 800 §7 b3.
export const RANGES: Record<'U' | 'I' | 'DT' | 'DBETA', readonly [number, number, number]> = {
  U: [0, 350, 50], // 0.1 kV
  I: [0, 100, 0], // 0.01 mA
  DT: [1, 9999, 1], // s
  DBETA: [0, 200, 1], // 0.1°; 0 = exposure-timer mode
}
// Arm and limit ranges in 0.1°: sensor −10 … +170° (§4); coupled target β = sensor/2. The target arm
// turns without limit; the physics wraps it, and its limits are kept to one turn either way.
const ARM_RANGE: Record<Mode, readonly [number, number]> = {
  SENSOR: [-100, 1700],
  TARGET: [-3600, 3600],
  COUPLED: [-50, 850],
}
// ponytail: a binary window, no angular profile: an assumption to be confirmed by the lab staff and
// upgraded to a Python profile if L2 needs it. A target turned ≈180° is treated as blocked, though a real
// plate might put an absorber on the tube side.
export const WHEEL_WINDOW_DEG = 3 // target within ±3° of a slot centre: the slot is in the beam
// Hidden zero offsets of the goniometer (the guide's "calibration", LD P7.1.2.1): the arms' mechanical zero is not exactly
// where the panel reads 0.0°. Emulator assumptions, not in the manual: the target arm is off by 0.1–0.4° and the sensor by
// 0.2–0.8° (in the sensor's own angle 2θ), each with a random sign, per session and per mounted crystal. The rocking Gaussian is
// σ = 0.12° wide, so the target error (≈1–3σ) visibly costs rate at the Kα maximum and the sensor error shifts the peak by
// 0.1–0.4° in θ, yet both stay small enough that a careful student finds the maximum within a degree of the expected angle.
export const ZERO_OFFSET_TARGET_DEG = [0.1, 0.4] as const
export const ZERO_OFFSET_SENSOR_DEG = [0.2, 0.8] as const
/** TARGET, COUPLED and β LIMITS pressed within this window count as "held together" (the real gesture is a three-key hold). */
export const CALIBRATION_WINDOW_MS = 3000
/** The calibration only stores a position that is at the first-order Kα maximum, within these reaches (0.1°): the target
 * arm 1.5° and the sensor arm 3.0° of the expected angle. Farther away, the key combo is refused (simulation aid: on the
 * real device it would store whatever the student left there). */
export const CALIBRATION_REACH_TENTHS = { target: 15, sensor: 30 } as const
/** Residual zero error (0.1°) a measurement still tolerates after the student calibrated by hand: target 0.3°, sensor 0.6°. */
export const ZERO_TOLERANCE_TENTHS = { target: 3, sensor: 6 } as const
/** A hidden zero error in 0.1° (fractional): true arm angle = panel reading + offset. */
export type ZeroOffset = Readonly<{ target: number; sensor: number }>

/** The zero error of a scan (or the mounted goniometer) is small enough that its measured angles are the true ones within the
 * tolerance; a missing record counts as aligned. Success checks use this: an uncalibrated scan does not count. */
export const zeroOk = (z: ZeroOffset | undefined): boolean =>
  z === undefined || (Math.abs(z.target) <= ZERO_TOLERANCE_TENTHS.target && Math.abs(z.sensor) <= ZERO_TOLERANCE_TENTHS.sensor)

const hashName = (name: string): number => {
  let h = 2166136261
  for (let k = 0; k < name.length; k++) h = Math.imul(h ^ name.charCodeAt(k), 16777619)
  return h >>> 0
}
/** The offsets (0.1°) drawn for one crystal mount from a session seed: deterministic in (seed, crystal), magnitudes uniform in the
 * ranges above, random signs. */
export function drawZeroOffset(seed: number, crystal: string): ZeroOffset {
  const r = mulberry32((seed ^ hashName(crystal)) >>> 0)
  r() // the first draw of mulberry32 is correlated with small seeds
  const one = ([lo, hi]: readonly [number, number]) => (r() < 0.5 ? -1 : 1) * (lo + (hi - lo) * r()) * 10
  return { target: one(ZERO_OFFSET_TARGET_DEG), sensor: one(ZERO_OFFSET_SENSOR_DEG) }
}

const COUNTER_MAX_PER_S = 65_535 // internal rate limit (§4)
const DISPLAY_MAX = 9999 // 4-digit display

// Emulator assumptions: the manual gives no number for these.
export const SAFE_S = 1.0 // "SAFE" alone during the self-test (§6)
export const OK_S = 0.5 // then "SAFE" + "OK" before HV comes on
/** Stepper-motor speed of the faster arm in °/s. Both arms of a move arrive together, so a coupled
 * move stays 2:1 the whole way. An assumption: to be timed on the lab's goniometer 554 831. */
export const MOTOR_DEG_PER_S = 20
// Motor moves: ZERO, RESET, auto-scan positioning and scan steps. ADJUST moves the arm directly (a hand
// turns slower than the motor). Motion runs on the physics clock, like the Δt countdown, and pauses
// during the 1.5 s self-test (ponytail: arms still travelling from a ZERO wait for it). Default limits
// are 0.0° / 0.0°. The tube switches off when a scan or exposure program ends.

/** Dynamic ADJUST response (§7 b2): turning faster gives bigger increments. */
export function adjustMultiplier(detentsPerSecond: number): number {
  return detentsPerSecond < 5 ? 1 : detentsPerSecond < 15 ? 5 : 20
}

/** Window over which the turning speed of a CONTINUOUS turn (dial drag, wheel, a held key) is measured. */
export const ADJUST_WINDOW_MS = 300
/** Turning-speed tracker for the dynamic ADJUST response. Only a continuous turn accelerates: separate presses of the
 * − / + keys or of an arrow key (each one a discrete step, however fast the student taps) always move one detent, so
 * "10° = 100 presses" lands on 10°, not on a multiple of the multiplier. */
export class AdjustAccel {
  private recent: number[] = []
  /** The multiplier for a detent at `nowMs`; a discrete press resets the speed history. */
  multiplier(nowMs: number, continuous: boolean): number {
    if (!continuous) {
      this.recent = []
      return 1
    }
    this.recent = [...this.recent.filter((t0) => nowMs - t0 < ADJUST_WINDOW_MS), nowMs]
    return adjustMultiplier(this.recent.length < 3 ? 0 : (1000 * this.recent.length) / ADJUST_WINDOW_MS)
  }
}

export type ReplayPoint = { angle: number; rate: number } // angle in 0.1°, mean rate in 1/s over Δt

/** One finished exposure (Δβ = 0). Simulation aid: the device keeps only the last value for REPLAY, a
 * student doing a series of exposures would otherwise have to note the setup of each by hand. */
export type ExposureRecord = Readonly<{
  target: number // 0.1°, wrapped
  sensor: number // 0.1°, the reading
  sensorTrue: number // 0.1°, what the physics saw (reading + hidden zero offset); the expected rate uses this
  slot: number | null // absorber-plate slot in the beam (see wheelSlot), null: frame or no plate
  mode: Mode | null // the arm selected when the exposure ran (null: none, e.g. a background run)
  setup: Setup
  u: number // 0.1 kV, when counting started
  i: number // 0.01 mA, when counting started
  dt: number // s
  rate: number // mean rate in 1/s = counts / dt, the value REPLAY shows
  changed: boolean // U or I differed from the start values while it counted
}>

/** One finished MCA run (simulation aid, like ExposureRecord: the analyser only shows the spectrum on show). */
export type McaRecord = Readonly<{
  sample: string
  collimatorFilter: string | null // foils mounted when the run started counting
  sensorFilter: string | null
  u: number // 0.1 kV, when the run started counting
  i: number // 0.01 mA, when the run started counting
  target: number // 0.1°, wrapped, when the run started counting
  nChannels: number
  gain: number
  presetS: number
  realS: number
  liveS: number
  changed: boolean // sample, holder, detector, U, I, target or the emitting state differed from the start while it counted
  seen: boolean // at the run's first tick the energy detector saw the sample with the tube emitting; if not, later counts make the run `changed`
}>

/** The slot of an absorber plate in the beam for a target angle (0.1°, any turn): 0 … 6, or null when the
 * wheel frame blocks the beam or the holder is no plate. */
export function wheelSlot(holder: Holder, angle: number): number | null {
  if (holder !== 'alWheel' && holder !== 'materialWheel') return null
  const t = wrapTarget(angle)
  const k = Math.round(t / 100)
  return k < 0 || k > 6 || Math.abs(t - 100 * k) > WHEEL_WINDOW_DEG * 10 ? null : k
}

/** Saturation warning: the dead-time loss fraction 1 − m/R = m·τ (non-paralysable, m observed) is past 30 %, i.e. R·τ > 0.43.
 * The guide's own settings (30 kV, 0.02 mA, open slot: loss ≈ 24 % in our model, ≈ 18 % at the leaflet's tabulated 1841/s) must not
 * trip it. See model/PARAMETERS.md, `Apparatus.saturated` threshold. */
export const SATURATION_OBSERVED_TAU = 0.3

export type Display = {
  top: string
  topUnit: '1/s' | '°' | ''
  bottom: string
  bottomUnit: 'kV' | 'mA' | 's' | '°' | ''
  symbol: 'lower' | 'upper' | 'exposure' | null // dot-matrix symbols of the LIMITS and Δβ keys
  blinkTop: boolean // self-test failed: a door is open (§6)
  flashBottom: boolean // upper limit < lower limit: no scan can start (§7 b3)
  hvLamp: boolean // flashes while HV is on (§7 b6)
  alert: Alert | null // why the last SCAN/HV was refused; the view explains it (simulation aid)
}
/** `detector`: the energy detector is on the sensor arm, which is locked at 90° (and must be there to mount it). */
/** `calibrated` / `calibFar`: the zero-calibration key combo stored the zero / was refused (the arms are not at the Kα maximum). */
export type Alert = 'mode' | 'limits' | 'doors' | 'detector' | 'detectorReset' | 'calibrated' | 'calibFar'

type Program = {
  steps: number[] // scan-arm angles in 0.1° (one entry for the exposure timer)
  index: number
  elapsedS: number // whole seconds counted at the current step
  started?: boolean // U and I were noted when counting began
  counts: number
}

export class Apparatus {
  // Settings (device steps)
  u = RANGES.U[2]
  i = RANGES.I[2]
  dt = RANGES.DT[2]
  dBeta = RANGES.DBETA[2]
  limitLo = 0
  limitHi = 0
  // Goniometer (0.1°; fractional only while the motor drives)
  target = 0
  sensor = 0
  mode: Mode | null = null
  private coupleRef: Arms = { target: 0, sensor: 0 }
  private path: Arms[] = [] // motor waypoints still to reach
  // Panel
  edit: Param | null = null
  bottomShows: Param | Mode = 'U'
  topShowsSensor = false
  exposureDone = false // "0 s" stays on show after an exposure until the next key or turn
  speaker = false
  doorsClosed = true
  private _setup: Setup = { holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm', sample: 'Cu' }
  /** The 559 938's analyser; counts only with the energy detector, a sample on the holder and the tube emitting. */
  mca = new Mca()
  private mcaKey = ''
  private mcaCache: { counts: ArrayLike<number>; live: number } | null = null
  private _exposures: ExposureRecord[] = []
  /** How many times the ZERO key was processed (accepted: not during a program, not with the energy detector). The assembly's last step watches it. */
  zeroPresses = 0
  private _mcaRuns: McaRecord[] = []
  /** The conditions when the current run started counting from real time 0 (set on its first tick). */
  private mcaRun: { key: string; sample: string; collimatorFilter: string | null; sensorFilter: string | null; u: number; i: number; target: number; changed: boolean; seen: boolean; loggedS?: number } | null = null
  private exposureStart: { u: number; i: number; changed: boolean } | null = null
  hvOn = false
  alert: Alert | null = null // cleared by the next key
  // Program
  phase: Phase = 'idle'
  private safetyLeftS = 0
  private next: 'hv' | 'scan' | 'exposure' = 'hv'
  private program: Program | null = null
  replay: ReplayPoint[] = []
  replayIndex: number | null = null
  /** The auto-scan that filled `replay`: its arm, limits in 0.1°, and U, I, Δt at its start in device
   * steps (null after an exposure). `changed`: U or I differed from those while it counted (the device
   * allows it). */
  lastScan: { mode: Mode; first: number; last: number; u: number; i: number; dt: number; changed: boolean; setup: Setup; zero?: ZeroOffset } | null = null
  /** Counts in the last whole simulated second; the rate display and speaker clicks use it. */
  lastSecondCounts = 0
  secondsCounted = 0 // increments with every whole simulated second
  timeScale = 1 // 1, 10, 100 or Infinity (instant); simulation-only, not a feature of the real device
  private clockS = 0
  private limits: ArmLimits | null = null

  private rng: Rng
  private params: ModelParams
  // Hidden zero offsets, per crystal (the session's calibration state). null seed: perfectly aligned goniometer (tests, teacher).
  private zeroSeed: number | null
  private zeroByCrystal = new Map<string, ZeroOffset>()
  private comboAt = new Map<Key, number>()
  /** Wall clock (ms) of the key-combo window; replaceable in tests. */
  nowMs: () => number = () => Date.now()
  /** How many times the calibration combo stored a zero (accepted). */
  calibrations = 0

  /** `zeroSeed`: seed of this session's hidden zero offsets (see ZERO_OFFSET_*); null (default) is a perfectly aligned goniometer. */
  constructor(rng: Rng = mulberry32(Date.now()), params: ModelParams = DEFAULT, zeroSeed: number | null = null) {
    this.rng = rng
    this.params = params
    this.zeroSeed = zeroSeed
  }

  /** The hidden zero error of the mounted crystal's goniometer, in 0.1° (true angle = reading + offset). For physics and success checks, never shown. */
  get zeroOffset(): ZeroOffset {
    // Without a crystal there is no Kα maximum to calibrate on (the attenuation guide skips calibration), so the
    // goniometer counts as aligned: an uncorrectable sensor error would only bias the direct-beam rate.
    if (this._setup.holder !== 'crystal') return { target: 0, sensor: 0 }
    const name = this._setup.crystal
    let z = this.zeroByCrystal.get(name)
    if (!z) {
      z = this.zeroSeed === null ? { target: 0, sensor: 0 } : drawZeroOffset(this.zeroSeed, name)
      this.zeroByCrystal.set(name, z)
    }
    return z
  }

  /** Target arm angle the physics sees, in 0.1° (reading + hidden offset). */
  get trueTarget(): number {
    return this.target + this.zeroOffset.target
  }

  /** Sensor arm angle the physics sees, in 0.1° (reading + hidden offset), kept inside the model's sensor range. */
  get trueSensor(): number {
    return clamp(this.sensor + this.zeroOffset.sensor, SENSOR_MIN_DEG * 10, SENSOR_MAX_DEG * 10)
  }

  /** Teacher shortcut: the goniometer is aligned from now on (offsets 0 for every crystal). */
  alignZero(): void {
    this.zeroSeed = null
    this.zeroByCrystal.clear()
  }

  /** Whether the readings are within the tolerance of the true angles (the student calibrated, or the teacher aligned it). */
  get zeroCalibrated(): boolean {
    return zeroOk(this.zeroOffset)
  }

  /** The calibration key combo (TARGET + COUPLED + β LIMITS, LD P7.1.2.1): the arms stand at the first-order Kα maximum of the
   * mounted crystal, so the device stores the positions as the expected angles θ₁ and 2θ₁: the readings become those angles and the
   * hidden offsets whatever the student's maximum search left over. Refused (false, alert `calibFar`) when no crystal is in, the
   * motor runs, or the arms are not within CALIBRATION_REACH_TENTHS of the maximum. */
  calibrate(): boolean {
    if (this.busy || this.energy) return false
    const crystal = this.crystal
    const th = 10 * thetaFromLambda(MO_KA_PM, 1, dPm(crystal))
    const dt = wrapTarget(this.trueTarget) - th
    const ds = this.trueSensor - 2 * th
    if (this._setup.holder !== 'crystal' || this.moving || Math.abs(dt) > CALIBRATION_REACH_TENTHS.target || Math.abs(ds) > CALIBRATION_REACH_TENTHS.sensor) {
      this.alert = 'calibFar'
      return false
    }
    const target = Math.round(th)
    const sensor = 2 * target // COUPLED keeps the sensor at exactly twice the target on the display
    // the true arm angles do not move: reading + offset stays, so the offset absorbs the change of the reading
    const next: ZeroOffset = { target: wrapTarget(this.trueTarget) - target, sensor: this.trueSensor - sensor }
    this.zeroByCrystal.set(this._setup.crystal, next)
    this.target = target
    this.sensor = sensor
    this.coupleRef = { target, sensor }
    this.calibrations++
    this.alert = 'calibrated'
    return true
  }

  get busy(): boolean {
    return this.phase !== 'idle'
  }

  /** A program may count: the exposure timer needs HV only (a background run is at 0 kV), auto-scan also U and I. */
  private get ready(): boolean {
    return this.phase === 'exposure' ? this.hvOn : this.emitting
  }

  /** The motor is driving the arms. */
  get moving(): boolean {
    return this.path.length > 0
  }

  private get energy(): boolean {
    return this._setup.detector === 'energy'
  }

  /** The tube is emitting: HV on with voltage and emission current set. */
  get emitting(): boolean {
    return this.hvOn && this.u > 0 && this.i > 0
  }
  /** The quantity on the bottom display (its key is lit): the scan arm while a scan runs, unless a key is being edited. */
  get bottomKey(): Param | Mode {
    return (this.phase === 'scan' || this.phase === 'positioning') && this.edit === null ? this.mode! : this.bottomShows
  }
  /** SCAN was accepted: its self-test, positioning, or the program itself is running. */
  get programOn(): boolean {
    return this.phase === 'scan' || this.phase === 'exposure' || this.phase === 'positioning' || (this.phase === 'safety' && this.next !== 'hv')
  }

  get setup(): Setup {
    return this._setup
  }

  /** The crystal of the current setup (NaCl unless the picker chose another; only used when the holder is the crystal). */
  get crystal(): Crystal {
    return crystalOf(this._setup)
  }

  /** The exposures finished so far, oldest first (simulation aid). Stopped exposures are not logged; RESET
   * keeps the log, as it keeps the setup; only clearExposureLog() empties it. */
  get exposureLog(): readonly ExposureRecord[] {
    return this._exposures
  }

  clearExposureLog(): void {
    this._exposures = []
  }

  /** The MCA runs that reached their preset, oldest first (simulation aid). A stopped run is not logged until it
   * is resumed and reaches the preset (or its preset is shortened to the time it reached); a preset lengthened after
   * a run finished continues the same run (logged again at the new preset): one record per real time reached;
   * RESET keeps the log; only clearMcaLog() empties it. */
  get mcaLog(): readonly McaRecord[] {
    return this._mcaRuns
  }

  /** The conditions of the current (or last) MCA run, as snapshotted at its first tick; null before any run. */
  get mcaRunInfo(): Readonly<Pick<McaRecord, 'sample' | 'collimatorFilter' | 'sensorFilter' | 'u' | 'i' | 'target' | 'changed' | 'seen'>> | null {
    return this.mcaRun
  }

  clearMcaLog(): void {
    this._mcaRuns = []
  }

  /** Expected rate R̄ at the current arm positions, in counts/s. With HV off the counter still sees the
   * natural GM background. */
  expectedRate(): number {
    const { u, i, params } = this
    const [target, sensor] = [this.trueTarget, this.trueSensor] // the physics sees the true angles
    if (this._setup.detector === 'energy') return 0 // no GM plugged in: the rate display idles
    if (!this.hvOn) return directRate(0, 0, [], params)
    if (this._setup.holder === 'crystal') return expectedRate([target / 10], u / 10, i / 100, params, [sensor / 10], this.foils(), this.crystal)[0]
    // ponytail: the GM with a sample on the holder sees background only (fluorescence into the GM is not modelled); Python first if a task needs it
    return this.direct(sensor / 10) ?? directRate(0, 0, [], params)
  }

  /** The no-crystal beam seen by a counter at `sensorDeg`: through the wheel slot in the beam, undefined
   * when the wheel frame blocks it. */
  private direct(sensorDeg: number): number | undefined {
    const slot = this._setup.holder === 'empty' ? null : this.wheelSlot()
    if (slot === undefined) return undefined
    const filters = this.foils()
    return directRate(this.u / 10, this.i / 100, slot ? [...filters, slot] : filters, this.params, sensorDeg)
  }

  /** Expected rate a counter at the specular angle 2β would see, in counts/s: the reflected beam the
   * goniometer view draws. 0 with HV off, without the crystal, and where 2β lies outside the sensor range. */
  specularRate(): number {
    const beta = wrapTarget(this.trueTarget) / 10
    if (!this.hvOn || this._setup.holder !== 'crystal' || beta < BETA_MIN_DEG || beta > BETA_MAX_DEG) return 0
    return expectedRate([beta], this.u / 10, this.i / 100, this.params, undefined, this.foils(), this.crystal)[0]
  }

  /** Expected rate straight through the target position (sensor at 0°) without the crystal, in counts/s:
   * the direct beam the views draw. 0 with the crystal, HV off, or the plate frame in the beam. */
  transmittedRate(): number {
    return !this.hvOn || this._setup.holder === 'crystal' ? 0 : (this.direct(0) ?? 0)
  }

  /** The true rate R is past Rτ = 0.3: dead-time losses exceed 23 % and the choice of dead-time model
   * starts to matter (simulation aid, not a device feature). */
  get saturated(): boolean {
    return this.expectedRate() * this.params.tau_s > SATURATION_OBSERVED_TAU
  }

  /** Change the accessories; only with the door open and the HV off (§6). Refused (false) otherwise. */
  mount(setup: Setup): boolean {
    if (this.alert === 'detector' || this.alert === 'detectorReset') this.alert = null // a refusal here is reported fresh
    if (this.doorsClosed || this.hvOn || this.busy) return false
    setup = { detector: 'gm', sample: this._setup.sample, ...setup } // a task's remount keeps the (loaded) sample
    if (setup.detector === 'energy' && this._setup.detector !== 'energy' && (this.moving || this.sensor !== ENERGY_SENSOR)) {
      this.alert = 'detector'
      return false
    }
    if (setup.holder === 'sample' && !Object.hasOwn(XRF.samples, setup.sample!)) throw new RangeError(`XRF sample ${setup.sample} not loaded`)
    const names = [setup.collimatorFilter, setup.sensorFilter].filter((n) => n !== null)
    if ((setup.holder.endsWith('Wheel') || names.length > 0) && !absorbersLoaded()) throw new RangeError('absorber tables not loaded')
    for (const n of names) if (!Object.hasOwn(FOILS_MG_CM2, n)) throw new RangeError(`unknown filter ${n}`)
    crystalOf(setup) // unknown or unloaded preset throws
    if (this.energy && setup.detector !== 'energy') this.mca.stop() // its view is hidden now
    this._setup = Object.freeze({ ...setup })
    return true
  }

  private foils(): [string, number][] {
    return [...foilOf(this._setup.collimatorFilter), ...foilOf(this._setup.sensorFilter)]
  }

  /** The wheel slot in the beam (null = open slot), or undefined when the wheel frame blocks it. */
  private wheelSlot(): readonly [string, number] | null | undefined {
    const k = wheelSlot(this._setup.holder, this.trueTarget)
    return k === null ? undefined : WHEELS_MG_CM2[this._setup.holder === 'alWheel' ? 'al' : 'material'][k]
  }

  /** A panel key. TARGET, COUPLED and β LIMITS pressed together (within CALIBRATION_WINDOW_MS, in any order) store the zero (calibrate()). */
  press(key: Key): void {
    this.pressKey(key)
    if (key !== 'TARGET' && key !== 'COUPLED' && key !== 'LIMITS') return void this.comboAt.clear()
    if (this.busy || this.energy) return
    const now = this.nowMs()
    this.comboAt.set(key, now)
    const times = (['TARGET', 'COUPLED', 'LIMITS'] as const).map((k) => this.comboAt.get(k))
    if (times.every((t) => t !== undefined && now - t <= CALIBRATION_WINDOW_MS)) {
      this.comboAt.clear()
      this.calibrate()
    }
  }

  private pressKey(key: Key): void {
    this.alert = null
    this.exposureDone = false
    if (key !== 'REPLAY') this.replayIndex = null
    const prevEdit = this.edit
    this.edit = null // any key ends a parameter edit (§7 b2)
    // During a program only these keys act.
    if (this.busy && !['U', 'I', 'COUPLED', 'SCAN', 'HV', 'RESET', 'SPEAKER'].includes(key)) return
    if (this.energy && (key === 'SENSOR' || key === 'COUPLED' || key === 'ZERO')) {
      this.alert = 'detector' // the detector sits on the sensor arm
      return
    }
    switch (key) {
      case 'U':
      case 'I':
      case 'DT':
      case 'DBETA':
        this.edit = this.bottomShows = key
        return
      case 'LIMITS':
        this.edit = this.bottomShows = prevEdit === 'LIMIT_LO' ? 'LIMIT_HI' : 'LIMIT_LO'
        return
      case 'SENSOR':
      case 'TARGET':
        this.selectMode(key)
        return
      case 'COUPLED':
        // Pressed again while COUPLED is on show: the top display toggles rate ↔ sensor angle.
        if (this.mode === 'COUPLED' && (this.bottomShows === 'COUPLED' || this.busy))
          this.topShowsSensor = !this.topShowsSensor
        else if (!this.busy) {
          this.selectMode('COUPLED')
          this.coupleRef = this.restingArms()
          this.topShowsSensor = false
        }
        return
      case 'ZERO':
        this.zeroPresses++
        this.path = this.target === 0 && this.sensor === 0 ? [] : [{ target: 0, sensor: 0 }] // nothing to drive when already there
        this.coupleRef = { target: 0, sensor: 0 }
        return
      case 'RESET': // defaults, HV off, arms driven home (§7 b5)
        Object.assign(this, new Apparatus(this.rng, this.params), {
          doorsClosed: this.doorsClosed,
          speaker: this.speaker,
          timeScale: this.timeScale,
          secondsCounted: this.secondsCounted,
          target: this.target,
          sensor: this.sensor,
          _setup: this._setup,
          _exposures: this._exposures,
          _mcaRuns: this._mcaRuns,
          mcaRun: this.mcaRun,
          mca: this.mca, // a separate device: the panel's RESET does not touch it
          zeroPresses: this.zeroPresses,
          zeroSeed: this.zeroSeed,
          zeroByCrystal: this.zeroByCrystal,
          nowMs: this.nowMs,
          calibrations: this.calibrations,
          path: this.target === 0 && this.sensor === (this.energy ? ENERGY_SENSOR : 0) ? [] : [{ target: 0, sensor: this.energy ? ENERGY_SENSOR : 0 }],
        })
        if (this.energy) this.alert = 'detectorReset' // the real RESET would drive the detector into the collimator
        return
      case 'REPLAY':
        if (this.replay.length > 0) this.replayIndex = 0
        return
      case 'SPEAKER':
        this.speaker = !this.speaker
        return
      case 'HV':
        if (this.hvOn || this.busy) this.stop()
        else this.startSafety('hv')
        return
      case 'SCAN':
        if (this.busy) return this.stop()
        if (this.dBeta === 0) return this.startSafety('exposure')
        if (this.mode === null) {
          this.alert = 'mode' // auto-scan needs SENSOR, TARGET or COUPLED (§7 b5)
          return
        }
        if (this.limitHi < this.limitLo) {
          this.alert = 'limits'
          this.edit = this.bottomShows = 'LIMIT_HI' // show the flashing limit, ready to correct
          return
        }
        if (this.energy) {
          this.alert = 'detector' // every auto-scan first drives both arms to 0°: the detector would hit the collimator
          return
        }
        return this.startSafety('scan')
    }
  }

  /** Turn ADJUST by `detents` (negative: counter-clockwise), already multiplied by adjustMultiplier. */
  adjust(detents: number): void {
    detents = Math.trunc(detents)
    this.exposureDone = false
    if (this.replayIndex !== null) {
      this.replayIndex = clamp(this.replayIndex + detents, 0, this.replay.length - 1)
      return
    }
    if (this.edit !== null) {
      if (this.busy && this.edit !== 'U' && this.edit !== 'I') return
      if (this.edit === 'LIMIT_LO' || this.edit === 'LIMIT_HI') {
        const [lo, hi] = ARM_RANGE[this.mode ?? 'COUPLED']
        if (this.edit === 'LIMIT_LO') this.limitLo = clamp(this.limitLo + detents, lo, hi)
        else this.limitHi = clamp(this.limitHi + detents, lo, hi)
        return
      }
      const [lo, hi] = RANGES[this.edit]
      const key = ({ U: 'u', I: 'i', DT: 'dt', DBETA: 'dBeta' } as const)[this.edit]
      this[key] = clamp(this[key] + detents, lo, hi)
      return
    }
    this.moveArm(detents)
  }

  /** Turn the selected arm by `detents` × 0.1° by hand (ADJUST, or dragging the crystal in the view),
   * keeping the 2:1 coupling in COUPLED mode. Ignored while a program runs or the motor drives. */
  moveArm(detents: number): void {
    if (this.busy || this.mode === null || this.moving) return
    if (this.energy && this.mode !== 'TARGET') {
      this.alert = 'detector'
      return
    }
    this.edit = this.replayIndex = null // a hand on the arm ends an edit, as a key would
    this.bottomShows = this.mode // the display shows the arm being moved
    if (this.mode === 'TARGET') this.target = clamp(this.target + detents, ...this.armRange('TARGET'))
    else if (this.mode === 'SENSOR') this.sensor = clamp(this.sensor + detents, ...this.armRange('SENSOR'))
    else {
      // Manual 2:1 coupling relative to the arms when COUPLED was pressed (§7 b4, §11 c).
      const [sMin, sMax] = this.armRange('SENSOR')
      const { target: t0, sensor: s0 } = this.coupleRef
      const t = this.target + detents
      const tMin = t0 + Math.ceil((sMin - s0) / 2)
      const tMax = t0 + Math.floor((sMax - s0) / 2)
      this.target = clamp(t, Math.min(tMin, this.target), Math.max(tMax, this.target))
      this.sensor = clamp(s0 + 2 * (this.target - t0), sMin, sMax)
    }
  }

  /** Open or close the lead-glass doors; they are locked while X-rays can be produced (§6). */
  setDoors(closed: boolean): boolean {
    if (!closed && (this.hvOn || this.busy)) return false
    this.doorsClosed = closed
    if (closed && this.alert === 'doors') this.alert = null
    return true
  }

  /** Advance by `realS` seconds of wall time, scaled by timeScale (Infinity: finish the program now).
   * The self-test always runs in real time: time acceleration is a simulation feature, not a device one. */
  tick(realS: number): void {
    if (this.phase === 'safety') {
      this.driveMca(Math.min(realS, this.safetyLeftS) * this.timeScale) // the analyser is a separate device: its clock runs through the self-test
      this.safetyLeftS -= realS
      if (this.safetyLeftS > 0) return
      realS = -this.safetyLeftS // only the time after the self-test counts
      this.passSafety()
    }
    // Instant: finish the program now; the rate meter keeps counting in real time.
    let simS = realS * this.timeScale
    const instant = this.timeScale === Infinity
    if (instant) {
      this.finish() // the tube is off afterwards: the analyser runs to its preset in that state
      simS = realS
      this.driveMca(Infinity)
    }
    // Advance event by event: the next whole second of the counter or the end of a motor leg.
    for (let n = 0; simS > 0 && n < 1_000_000; n++) {
      const leg = this.path[0]
      const legS = leg ? Math.max(Math.abs(leg.target - this.target), Math.abs(leg.sensor - this.sensor)) / (10 * MOTOR_DEG_PER_S) : Infinity
      const toSecond = 1 - this.clockS
      const dt = Math.min(simS, toSecond, legS)
      simS -= dt
      // ponytail: one Poisson pass over all channels per slice (≈ 100 per frame at 100×); merge slices with equal state if phones jank
      if (!instant) this.driveMca(dt) // the analyser sees the state of this slice
      if (dt === toSecond) {
        this.clockS = 0
        this.countSecond() // a program step only ends while no leg runs, so `leg` stays current
      } else this.clockS += dt
      if (!leg) continue
      if (dt === legS) this.reach()
      else {
        this.target += ((leg.target - this.target) * dt) / legS
        this.sensor += ((leg.sensor - this.sensor) * dt) / legS
      }
    }
  }

  display(): Display {
    const d: Display = {
      top: '', topUnit: '', bottom: '', bottomUnit: '', symbol: null,
      blinkTop: this.alert === 'doors', flashBottom: this.limitHi < this.limitLo, hvLamp: this.hvOn,
      alert: this.alert,
    } // prettier-ignore
    if (this.phase === 'safety') {
      d.top = 'SAFE'
      d.bottom = this.safetyLeftS <= OK_S ? 'OK' : ''
      return d
    }
    if (this.replayIndex !== null) {
      const p = this.replay[this.replayIndex]
      return { ...d, top: fmtMean(p.rate), topUnit: '1/s', bottom: fmtAngle(p.angle), bottomUnit: '°' }
    }
    if (this.mode === 'COUPLED' && this.topShowsSensor) Object.assign(d, { top: fmtAngle(this.sensor), topUnit: '°' })
    else Object.assign(d, { top: fmtRate(this.lastSecondCounts), topUnit: '1/s' })
    if (this.phase === 'exposure' && this.program && this.edit === null) {
      return { ...d, bottom: String(this.dt - this.program.elapsedS), bottomUnit: 's', symbol: 'exposure' }
    }
    if (this.exposureDone) return { ...d, bottom: '0', bottomUnit: 's', symbol: 'exposure' }
    switch (this.bottomKey) {
      case 'U':
        return { ...d, bottom: (this.u / 10).toFixed(1), bottomUnit: 'kV' }
      case 'I':
        return { ...d, bottom: (this.i / 100).toFixed(2), bottomUnit: 'mA' }
      case 'DT':
        return { ...d, bottom: String(this.dt), bottomUnit: 's' }
      case 'DBETA':
        return { ...d, bottom: fmtAngle(this.dBeta), bottomUnit: '°', symbol: this.dBeta === 0 ? 'exposure' : null }
      case 'LIMIT_LO':
        return { ...d, bottom: fmtAngle(this.limitLo), bottomUnit: '°', symbol: 'lower' }
      case 'LIMIT_HI':
        return { ...d, bottom: fmtAngle(this.limitHi), bottomUnit: '°', symbol: 'upper' }
      case 'SENSOR':
        return { ...d, bottom: fmtAngle(this.sensor), bottomUnit: '°' }
      default: // TARGET, COUPLED
        return { ...d, bottom: fmtAngle(wrapTarget(this.target)), bottomUnit: '°' }
    }
  }

  /** Feed the analyser `dtS` of simulated time: the expected spectrum when the energy detector sees the sample (cached
   * per sample, U, I, channels, gain: the kernel sum is too slow per frame), else only its clocks run. */
  private driveMca(dtS: number): void {
    const { mca } = this
    if (mca.running && dtS > 0) {
      // 0 · Infinity is NaN
      const { detector, holder, sample, collimatorFilter, sensorFilter } = this._setup
      let live = 1
      let counts: ArrayLike<number> | null = null
      if (detector === 'energy' && holder === 'sample' && this.emitting) {
        const { nChannels, gain } = mca.settings
        const key = `${sample} ${collimatorFilter} ${sensorFilter} ${this.u} ${this.i} ${nChannels} ${gain}`
        if (key !== this.mcaKey) {
          const r = mcaSpectrum(sample!, this.u / 10, this.i / 100, 1, nChannels, gain, foilOf(collimatorFilter), foilOf(sensorFilter))
          this.mcaCache = { counts: r.counts, live: r.liveTimeS }
          this.mcaKey = key
        }
        ;({ counts, live } = this.mcaCache!)
      }
      const run = `${sample} ${collimatorFilter} ${sensorFilter} ${holder} ${detector} ${this.u} ${this.i} ${this.target} ${this.emitting}`
      if (mca.realS === 0 || !this.mcaRun) this.mcaRun = { key: run, sample: sample ?? '', collimatorFilter, sensorFilter, u: this.u, i: this.i, target: wrapTarget(this.target), changed: false, seen: counts !== null }
      else if (run !== this.mcaRun.key) this.mcaRun.changed = true
      mca.tick(dtS, counts, live, this.rng)
    }
    // Also when idle: a preset shortened to the time already reached stops the run (Mca.set) and logs it here.
    const x = this.mcaRun
    if (x && !mca.running && mca.realS >= mca.settings.presetS && x.loggedS !== mca.realS) {
      const { nChannels, gain, presetS } = mca.settings
      x.loggedS = mca.realS
      this._mcaRuns = [...this._mcaRuns, Object.freeze({ sample: x.sample, collimatorFilter: x.collimatorFilter, sensorFilter: x.sensorFilter, u: x.u, i: x.i, target: x.target, nChannels, gain, presetS, realS: mca.realS, liveS: mca.liveS, changed: x.changed, seen: x.seen })]
    }
  }

  private startSafety(next: 'hv' | 'scan' | 'exposure'): void {
    if (!this.doorsClosed) {
      this.alert = 'doors' // self-test fails, HV stays off, top display blinks (§6)
      return
    }
    this.phase = 'safety'
    this.next = next
    this.safetyLeftS = SAFE_S + OK_S
  }

  private passSafety(): void {
    this.phase = 'idle'
    this.hvOn = true
    if (this.next === 'hv') return
    this.replay = []
    this.clockS = 0
    if (this.next === 'exposure') {
      this.phase = 'exposure'
      this.lastScan = null
      this.exposureStart = { u: this.u, i: this.i, changed: false }
      const arms = this.restingArms()
      this.program = { steps: [this.mode === 'SENSOR' ? arms.sensor : wrapTarget(arms.target)], index: 0, elapsedS: 0, counts: 0 }
      return
    }
    // Auto-scan: both arms to zero (in every mode, confirmed by the lab staff), then the scan arm to the
    // lower limit, and only then HV on (§7 b5).
    this.hvOn = false
    const mode = this.mode!
    const [lo, hi] = ARM_RANGE[mode]
    const first = clamp(this.limitLo, lo, hi)
    const last = clamp(this.limitHi, lo, hi)
    const n = Math.floor((last - first) / this.dBeta) + 1
    this.lastScan = { mode, first, last, u: this.u, i: this.i, dt: this.dt, changed: false, setup: this._setup, zero: this.zeroOffset }
    this.path = [{ target: 0, sensor: 0 }]
    this.coupleRef = { target: 0, sensor: 0 } // auto-scan couples to the zero of the measuring system
    this.phase = 'positioning'
    this.program = { steps: Array.from({ length: n }, (_, k) => first + k * this.dBeta), index: 0, elapsedS: 0, counts: 0 }
    this.moveTo(this.program.steps[0])
  }

  /** Select a scan mode; limits set for another arm are clamped into this one's range, so the
   * display never shows limits the scan would not use. */
  private selectMode(mode: Mode): void {
    const [lo, hi] = ARM_RANGE[mode]
    this.mode = this.bottomShows = mode
    this.limitLo = clamp(this.limitLo, lo, hi)
    this.limitHi = clamp(this.limitHi, lo, hi)
  }

  /** Where the arms come to rest: the last motor waypoint, or where they are. */
  private restingArms(): Arms {
    return this.path.at(-1) ?? { target: this.target, sensor: this.sensor }
  }

  /** The distances s₁, s₂ (cm) the student set on the bench, and `refCm` (the attenuation set-up measures to the absorber set's
   * window). The counter and the crystal holder then run into the chamber at angles that depend on them (apparatus/collision.ts):
   * the arms stall there, and anything beyond is out of reach. null: no geometry, the plain ranges apply. */
  setGeometry(g: { s1Cm: number; s2Cm: number; refCm?: number } | null): void {
    this.limits = g && armLimits(g.s1Cm, g.s2Cm, g.refCm ?? 0)
    const [sLo, sHi] = this.armRange('SENSOR')
    const [tLo, tHi] = this.armRange('TARGET')
    this.sensor = clamp(this.sensor, sLo, sHi)
    this.target = clamp(this.target, tLo, tHi)
    this.path = this.path.map((p) => ({ target: clamp(p.target, tLo, tHi), sensor: clamp(p.sensor, sLo, sHi) }))
  }

  /** The mechanical collision limits of the arms now (0.1°), null without geometry. */
  get armLimits(): ArmLimits | null {
    return this.limits
  }

  /** The range an arm can reach in `mode` (0.1°): the device range cut by what the chamber allows at the current s₁, s₂. COUPLED
   * is the target's range; the sensor follows at twice the angle, so both must stay free. */
  armRange(mode: Mode): readonly [number, number] {
    const l = this.limits
    if (!l) return mode === 'TARGET' ? [-Infinity, Infinity] : ARM_RANGE[mode] // the target arm turns without limit
    if (mode === 'SENSOR') return [Math.max(SENSOR_RANGE[0], l.sensorMin), Math.min(SENSOR_RANGE[1], l.sensorMax)]
    if (mode === 'TARGET') return [l.targetMin <= ARM_RANGE.TARGET[0] ? -Infinity : l.targetMin, l.targetMax >= ARM_RANGE.TARGET[1] ? Infinity : l.targetMax] // free: it turns without limit
    const [lo, hi] = ARM_RANGE.COUPLED
    return [Math.max(lo, Math.ceil(l.sensorMin / 2), l.targetMin), Math.min(hi, Math.floor(l.sensorMax / 2), l.targetMax)]
  }

  /** Queue a motor move of the scan arm to `angle` (0.1°). An arm that meets the chamber stalls at the last free angle. */
  private moveTo(angle: number): void {
    const at = this.restingArms()
    angle = clamp(angle, ...this.armRange(this.mode ?? 'COUPLED'))
    if (this.mode === 'SENSOR') this.path.push({ ...at, sensor: angle })
    else if (this.mode === 'TARGET') this.path.push({ ...at, target: angle })
    else this.path.push({ target: angle, sensor: 2 * angle }) // auto-scan couples to zero (§7 b4)
  }

  /** The arms reach the next waypoint. After the last one, positioning ends in HV on, and a program's
   * Δt starts now. */
  private reach(): void {
    Object.assign(this, this.path.shift())
    if (this.moving) return
    if (this.phase === 'positioning') {
      this.phase = 'scan'
      this.hvOn = true
    }
    if (this.program) this.clockS = 0
  }

  private land(): void {
    while (this.moving) this.reach()
  }

  /** One whole simulated second: sample the counter, feed the running program. */
  private countSecond(): void {
    const c = Math.min(poisson(this.expectedRate(), this.rng), COUNTER_MAX_PER_S)
    this.lastSecondCounts = c
    this.secondsCounted++
    const p = this.program
    if (!p || !this.ready || this.moving) return // a program waits for HV, emission current and the arms (§7 b5)
    p.counts += c
    this.watch(p)
    if (++p.elapsedS === this.dt) this.endStep()
  }

  /** Counting has begun or goes on: note U and I at the first counted second (not while the arms still
   * move), then flag a later change (the device allows it). */
  private watch(p: Program): void {
    const s = this.lastScan ?? this.exposureStart // lastScan is null for an exposure
    if (!s) return
    if (!p.started) {
      p.started = true
      s.u = this.u
      s.i = this.i
    } else if (this.u !== s.u || this.i !== s.i) s.changed = true
  }

  private endStep(): void {
    const p = this.program!
    const point = { angle: p.steps[p.index], rate: p.counts / this.dt }
    this.replay.push(point)
    const x = this.exposureStart
    if (this.phase === 'exposure' && x) {
      const { holder } = this._setup
      this._exposures = [
        ...this._exposures,
        Object.freeze({
          target: wrapTarget(this.target), sensor: this.sensor, slot: wheelSlot(holder, this.trueTarget), sensorTrue: this.trueSensor, mode: this.mode,
          setup: this._setup, u: x.u, i: x.i, dt: this.dt, rate: point.rate, changed: x.changed,
        }),
      ]
    } // prettier-ignore
    p.index++
    p.elapsedS = p.counts = 0
    if (p.index === p.steps.length) {
      this.exposureDone = this.phase === 'exposure'
      this.stop()
    }
    else this.moveTo(p.steps[p.index])
  }

  /** Instant mode: finish the program in one go, Poisson(R̄ · remaining time) per step.
   * A sum of Poisson counts is Poisson, so the stored means have the same statistics as in real time. */
  private finish(): void {
    this.land()
    while (this.program && this.ready) {
      const p = this.program
      const left = this.dt - p.elapsedS
      this.watch(p)
      p.counts += Math.min(poisson(this.expectedRate() * left, this.rng), COUNTER_MAX_PER_S * left)
      p.elapsedS = this.dt
      this.endStep()
      this.land()
    }
  }

  /** End any program and switch the high voltage off; stored values stay for REPLAY. The arms finish
   * their current leg, so they always rest on whole 0.1° steps. */
  private stop(): void {
    this.phase = 'idle'
    this.program = null
    this.exposureStart = null
    this.hvOn = false
    this.path.length = Math.min(this.path.length, 1)
    if (this.replay.length === 0) this.lastScan = null // stopped before the first point
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

/** Target angle in 0.1° folded into −180.0° … 179.9°, as the physics wraps it; the arm itself turns freely. */
export function wrapTarget(tenths: number): number {
  return ((((tenths + 1800) % 3600) + 3600) % 3600) - 1800
}

function fmtAngle(tenths: number): string {
  return (Math.round(tenths) / 10).toFixed(1) // "-0.0" never shows: Math.round(-0.4) is -0, and (-0).toFixed is "0.0"
}

/** A stored mean rate (REPLAY) with as many decimals as fit the 4 digits: 5.810, 58.10, 581.0, 5810. */
export function fmtMean(rate: number): string {
  for (let decimals = 3; decimals > 0; decimals--) {
    const s = rate.toFixed(decimals)
    if (s.replace('.', '').length <= 4) return s // 9.9996 → "10.000" is 5 digits: one decimal fewer
  }
  return fmtRate(rate)
}

function fmtRate(rate: number): string {
  return String(Math.min(Math.round(rate), DISPLAY_MAX))
}
