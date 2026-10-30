// port of braggsim.scan: the expected counting rate R̄(β) the GM counter sees (no noise).
//
// R̄ = dead_time( scale · Σ_n r_n [continuum_n + lines_n](θ) · rocking + tube · (leak + scatter) ),
// θ = |sensor| / 2; see the Python module docstring for the physics of each term. Every fitted value
// in DEFAULT is documented in model/PARAMETERS.md.
import { D_NACL_PM, MO_KA_COMPONENTS, MO_KB_COMPONENTS, NACL_THERMAL_B_PM2 } from './constants'
import {
  NACL,
  dPm,
  isNacl,
  extinctionRatio,
  muFactor,
  type Crystal,
  dlambdaDthetaPmPerDeg,
  lambdaFromTheta,
  lorentzPolarization,
  thetaFromLambda,
} from './crystal'
import { deadTime } from './detector'
import { checkFilters, filterEdgesPm, transmission, type Filters } from './filters'
import { convolveSame, interp, pyMod, roundHalfEven, trapezoid } from './numpy'
import { continuum, lambdaMinPm, lineRates } from './source'
import { DEFAULT_PARAMS_JSON, MU_RHO_GRID_PM, crystalsLoaded } from './tables'

// Air between anode and counter (18 cm assumed, 1.205 mg/cm³) and the fitted effective absorber.
export const AIR = 'Air, Dry (near sea level)'
export const AIR_PATH_CM = 18.0
export const AIR_MG_CM2 = 1.205 * AIR_PATH_CM
export const ABSORBER = 'Glass, Pyrex'
export const U_REF_KV = 35.0

// Sensor arm −10° … +170° (LD 554 800) → coupled target β = θ in −5° … +85°.
export const SENSOR_MIN_DEG = -10.0
export const SENSOR_MAX_DEG = 170.0
export const BETA_MIN_DEG = SENSOR_MIN_DEG / 2
export const BETA_MAX_DEG = SENSOR_MAX_DEG / 2
export const U_MAX_KV = 35.0
export const I_MAX_MA = 1.0
export const MAX_ORDER = Math.trunc(
  (2 * D_NACL_PM * Math.sin((BETA_MAX_DEG * Math.PI) / 180)) / lambdaMinPm(U_MAX_KV),
)
export const MAX_SCAN_STEPS = 100_000
export const THETA_STEP_DEG = 0.01
export const KERNEL_HALF_WIDTH_SIGMA = 6

/** port of braggsim.scan.ModelParams (field names as in the dataclass and the JSON artifacts). */
export type ModelParams = Readonly<{
  scale: number // counts/s per relative source unit
  line_to_cont: number // Kα line strength relative to the continuum (1/pm)
  debye_waller_pm2: number // effective B of exp(−2B s²)
  sigma_deg: number // Gaussian angular resolution
  tau_s: number // GM dead time
  leak_amp_per_s: number // direct-beam halo at 2θ = 0, 35 kV, 1 mA
  leak_width_deg: number // its Gaussian width in 2θ
  absorber_mg_cm2: number // effective absorber areal density
  scatter_per_s: number // flat scattered radiation at 35 kV, 1 mA
  background_per_s: number // GM natural background, true rate, independent of the tube
  direct_per_s: number // direct beam at 35 kV, 1 mA, no absorber, sensor at 0°, no crystal
}>

const PARAM_KEYS = [
  'scale', 'line_to_cont', 'debye_waller_pm2', 'sigma_deg', 'tau_s',
  'leak_amp_per_s', 'leak_width_deg', 'absorber_mg_cm2', 'scatter_per_s', 'background_per_s', 'direct_per_s',
] as const

const validated = new WeakSet<ModelParams>()

/** Validated, frozen ModelParams (port of ModelParams.__post_init__); the last three keys default to 0.
 * Only objects made here are accepted by expectedRate, as only the dataclass is in Python. */
export function modelParams(
  p: Omit<ModelParams, 'scatter_per_s' | 'background_per_s' | 'direct_per_s'> &
    Partial<Pick<ModelParams, 'scatter_per_s' | 'background_per_s' | 'direct_per_s'>>,
): ModelParams {
  const unknown = Object.keys(p).filter((k) => !(PARAM_KEYS as readonly string[]).includes(k))
  if (unknown.length) throw new TypeError(`unknown model parameters: ${unknown.join(', ')}`)
  const out = Object.freeze({
    ...p,
    scatter_per_s: p.scatter_per_s ?? 0,
    background_per_s: p.background_per_s ?? 0,
    direct_per_s: p.direct_per_s ?? 0,
  }) as ModelParams
  for (const k of PARAM_KEYS) {
    if (!(Number.isFinite(out[k]) && out[k] >= 0)) throw new RangeError(`model parameters must be finite and ≥ 0: ${k}`)
  }
  if (out.sigma_deg === 0 || out.leak_width_deg === 0) throw new RangeError('sigma_deg and leak_width_deg must be > 0')
  validated.add(out)
  return out
}

export const DEFAULT = modelParams(DEFAULT_PARAMS_JSON)

// Goniometer geometry, port of the braggsim.scan constants (model/PARAMETERS.md "Geometry: s₁ and s₂").
export const REF_S1_CM = 5.0
export const REF_S2_CM = 6.0
export const DIRECT_REF_S1_CM = 5.0
export const DIRECT_REF_S2_CM = 5.0
export const COLLIMATOR_WIDTH_MM = 0.2
export const COUNTER_SLIT_WIDTH_MM = 0.3
export const SOURCE_TO_COLLIMATOR_CM = 7.0

function checkGeometry(s1Cm: number, s2Cm: number): void {
  if (!(Number.isFinite(s1Cm) && Number.isFinite(s2Cm) && s1Cm > 0 && s2Cm > 0)) throw new RangeError('s1_cm and s2_cm must be finite and > 0')
}

const slitSigmaSqDeg2 = (widthMm: number, distanceCm: number): number => ((widthMm / (10 * distanceCm) / Math.sqrt(12)) * (180 / Math.PI)) ** 2

/** port of braggsim.scan.angular_sigma_deg: σ(s₁, s₂) in degrees, the fitted `params.sigma_deg` at (REF_S1_CM, REF_S2_CM). */
export function angularSigmaDeg(s1Cm: number = REF_S1_CM, s2Cm: number = REF_S2_CM, params: ModelParams = DEFAULT): number {
  checkGeometry(s1Cm, s2Cm)
  if (s1Cm === REF_S1_CM && s2Cm === REF_S2_CM) return params.sigma_deg
  const ref = slitSigmaSqDeg2(COLLIMATOR_WIDTH_MM, REF_S1_CM) + slitSigmaSqDeg2(COUNTER_SLIT_WIDTH_MM, REF_S2_CM)
  const resSq = params.sigma_deg ** 2 - ref
  if (resSq < 0) throw new RangeError('sigma_deg is below the geometric resolution at the reference slits')
  return Math.sqrt(resSq + slitSigmaSqDeg2(COLLIMATOR_WIDTH_MM, s1Cm) + slitSigmaSqDeg2(COUNTER_SLIT_WIDTH_MM, s2Cm))
}

/** port of braggsim.scan.direct_beam_factor: (r_ref/r)², r = SOURCE_TO_COLLIMATOR_CM + s₁ + s₂. */
export function directBeamFactor(s1Cm: number, s2Cm: number, refS1Cm: number = REF_S1_CM, refS2Cm: number = REF_S2_CM): number {
  checkGeometry(s1Cm, s2Cm)
  return ((SOURCE_TO_COLLIMATOR_CM + refS1Cm + refS2Cm) / (SOURCE_TO_COLLIMATOR_CM + s1Cm + s2Cm)) ** 2
}

/** port of braggsim.scan.crystal_factor: s₂_ref/s₂, the Bragg signal and scatter. */
export function crystalFactor(s2Cm: number, refS2Cm: number = REF_S2_CM): number {
  checkGeometry(REF_S1_CM, s2Cm)
  return refS2Cm / s2Cm
}

// params with σ replaced, memoised per (params, σ) so the tube cache (keyed by params identity) keeps working.
const sigmaParams = new WeakMap<ModelParams, { sigma: number; out: ModelParams }>()
function withSigma(params: ModelParams, sigma: number): ModelParams {
  if (sigma === params.sigma_deg) return params
  if (!validated.has(params)) throw new TypeError('params must come from modelParams()')
  const hit = sigmaParams.get(params)
  if (hit && hit.sigma === sigma) return hit.out
  const out = modelParams({ ...params, sigma_deg: sigma })
  sigmaParams.set(params, { sigma, out })
  return out
}

/** port of braggsim.scan.max_order: highest order that reaches the counter, n λ_min(U) ≤ 2d sin 85°. */
export function maxOrder(crystal: Crystal = NACL, UkV: number = U_MAX_KV): number {
  return maxOrderForD(dPm(crystal), UkV)
}
/** maxOrder() of a series with spacing `dPm` (the Forge asks before it has a Crystal). */
export const maxOrderForD = (d: number, UkV: number = U_MAX_KV): number =>
  Math.max(Math.trunc((2 * d * Math.sin((BETA_MAX_DEG * Math.PI) / 180)) / lambdaMinPm(UkV)), 1)

/** port of ModelParams.order_strengths: r_n for n = 1 … maxOrder(crystal) (index n − 1), relative to NaCl order 1.
 * k = cell_scale · exp(2 B_NaCl,th / (2 d_NaCl)²) for the non-anchor crystals (B_NaCl,th = 13 000 pm² = 1.3 Å², NaCl's thermal B,
 * not the fitted one); B is the fitted value for the anchor and 0 for the others. The λ-dependent muFactor and
 * extinctionRatio are applied per λ in the scan. */
export function orderStrengths(params: ModelParams, crystal: Crystal = NACL): number[] {
  const s1Sq = (1 / (2 * dPm(crystal))) ** 2
  const b = crystal.fitted_debye_waller ? params.debye_waller_pm2 : 0
  let k = crystal.cell_scale
  if (!crystal.fitted_debye_waller) k *= Math.exp((2 * NACL_THERMAL_B_PM2) / (2 * D_NACL_PM) ** 2)
  const n = maxOrder(crystal)
  // the exported f_sq_rel is sized for U_MAX_KV and BETA_MAX_DEG: a longer series would need a re-export
  if (n > crystal.f_sq_rel.length) throw new RangeError(`${crystal.name}: f_sq_rel stops at n = ${crystal.f_sq_rel.length}`)
  return crystal.f_sq_rel.slice(0, n).map((f, i) => k * f * Math.exp(-2 * b * ((i + 1) * (i + 1) - 1) * s1Sq))
}

/** port of ModelParams.order_reflectivity: orderStrengths for NaCl. */
export const orderReflectivity = (params: ModelParams): number[] => orderStrengths(params, NACL)

/** port of braggsim.scan.coupled_betas: target angles from lo to at most hi in steps of step (°). */
export function coupledBetas(loDeg: number, hiDeg: number, stepDeg: number): Float64Array {
  if (!(Number.isFinite(loDeg) && Number.isFinite(hiDeg) && stepDeg > 0 && hiDeg >= loDeg))
    throw new RangeError('a scan needs Δβ > 0 and upper limit ≥ lower limit (LD 554 800)')
  const n = Math.floor((hiDeg - loDeg) / stepDeg + 1e-9) + 1 // 1e-9: 0.3/0.1 = 2.9999…
  if (n > MAX_SCAN_STEPS) throw new RangeError(`${n} steps: a scan has at most ${MAX_SCAN_STEPS}`)
  return Float64Array.from({ length: n }, (_, i) => Math.min(roundHalfEven(loDeg + stepDeg * i, 10), hiDeg))
}

function transmissionTotal(lambdaPm: number, params: ModelParams, filters: Filters = []): number {
  let t = transmission(lambdaPm, AIR, AIR_MG_CM2) * transmission(lambdaPm, ABSORBER, params.absorber_mg_cm2)
  for (const [material, arealDensityMgCm2] of filters) t = t * transmission(lambdaPm, material, arealDensityMgCm2)
  return t
}

function gaussian(xDeg: number, sigmaDeg: number): number {
  return Math.exp(-0.5 * (xDeg / sigmaDeg) ** 2) / (sigmaDeg * Math.sqrt(2 * Math.PI))
}

function moLines(UkV: number, ImA: number, params: ModelParams): [number, number][] {
  const [ka, kb] = lineRates(UkV, ImA, params.line_to_cont)
  return [
    ...MO_KA_COMPONENTS.map(([lam, f]): [number, number] => [lam, ka * f]),
    ...MO_KB_COMPONENTS.map(([lam, f]): [number, number] => [lam, kb * f]),
  ]
}

// Everything R̄ needs that depends on (U, I, params, filters) but not on β, computed once. Python builds the
// convolution grid per query from βmin − half to βmax + half (clamped at node 1); every node a query
// interpolates between is then fully covered by the kernel, so the smoothed values equal those on
// this one grid over the whole range. That makes live single-β steps cheap (plan, Phase 5 notes).
type Tube = {
  params: ModelParams
  crystal: Crystal
  U: number
  I: number
  filtersKey: string // JSON of the filters: callers pass fresh arrays, so identity cannot key the cache
  tube: number
  thetaGrid: Float64Array
  smoothed: Float64Array
  lines: { theta: number; weight: number }[]
}
let cache: Tube | undefined
const photonsOutRef = new WeakMap<ModelParams, number>()

function tubeState(UkV: number, ImA: number, params: ModelParams, filters: Filters, crystal: Crystal): Tube {
  if (!isNacl(crystal) && !crystalsLoaded()) throw new Error('crystals not loaded (await loadCrystals())')
  const filtersKey = JSON.stringify(filters)
  if (cache && cache.params === params && cache.crystal === crystal && cache.U === UkV && cache.I === ImA && cache.filtersKey === filtersKey) return cache
  if (!validated.has(params)) throw new TypeError('params must come from modelParams()')
  const orders = orderStrengths(params, crystal)
  const d = dPm(crystal)
  const anchor = isNacl(crystal)
  const half = Math.ceil((KERNEL_HALF_WIDTH_SIGMA * params.sigma_deg) / THETA_STEP_DEG)
  const iHi = Math.ceil(BETA_MAX_DEG / THETA_STEP_DEG) + half
  const thetaGrid = Float64Array.from({ length: iHi }, (_, i) => THETA_STEP_DEG * (i + 1))
  const density = new Float64Array(iHi)
  if (ImA > 0 && UkV > 0) {
    orders.forEach((r, i) => {
      const n = i + 1
      for (let j = 0; j < iHi; j++) {
        const th = thetaGrid[j]
        const lam = lambdaFromTheta(th, n, d)
        const spec = continuum(lam, UkV, ImA)
        if (spec > 0) {
          const term = r * spec * transmissionTotal(lam, params, filters) * dlambdaDthetaPmPerDeg(th, n, d) * lorentzPolarization(th)
          density[j] += anchor ? term : term * muFactor(crystal, lam) * extinctionRatio(crystal, n, lam)
        }
      }
    })
  }
  const kernel = Float64Array.from({ length: 2 * half + 1 }, (_, k) =>
    gaussian(THETA_STEP_DEG * (k - half), params.sigma_deg),
  )
  const kSum = kernel.reduce((a, b) => a + b, 0)
  const lines: Tube['lines'] = []
  const moLineList = moLines(UkV, ImA, params)
  orders.forEach((r, i) => {
    for (const [lam, rate] of moLineList) {
      const theta = thetaFromLambda(lam, i + 1, d)
      if (rate === 0 || Number.isNaN(theta)) continue
      const weight = r * rate * transmissionTotal(lam, params, filters) * lorentzPolarization(theta)
      lines.push({ theta, weight: anchor ? weight : weight * (muFactor(crystal, lam) * extinctionRatio(crystal, i + 1, lam)) })
    }
  })
  cache = {
    params, crystal, U: UkV, I: ImA, filtersKey, tube: tubeFactor(UkV, ImA, params, filters), thetaGrid,
    smoothed: convolveSame(density, kernel.map((k) => k / kSum)), lines,
  } // prettier-ignore
  return cache
}

/** np.nextafter(x, 0) for a positive finite x. */
function nextBelow(x: number): number {
  const f = new Float64Array([x])
  const b = new BigInt64Array(f.buffer)
  b[0] -= 1n
  return f[0]
}

function photonsOut(UkV: number, params: ModelParams, filters: Filters = []): number {
  let lam: readonly number[] = MU_RHO_GRID_PM
  const edges = filterEdgesPm(filters)
  if (edges.length) {
    // both sides of each filter edge, so the trapezoid rule does not ramp across the step (np.unique of the union)
    lam = [...new Set([...MU_RHO_GRID_PM, ...edges, ...edges.map(nextBelow)])].sort((a, b) => a - b)
  }
  let total = trapezoid(
    lam.map((l) => continuum(l, UkV, 1.0) * transmissionTotal(l, params, filters)),
    lam,
  )
  const [ka, kb] = lineRates(UkV, 1.0, params.line_to_cont)
  for (const [rate, components] of [[ka, MO_KA_COMPONENTS], [kb, MO_KB_COMPONENTS]] as const) {
    for (const [lamPm, fraction] of components) total += rate * fraction * transmissionTotal(lamPm, params, filters)
  }
  return total
}

/** port of braggsim.scan.tube_factor: I · S(U), how leak and scatter follow the tube (1 at 35 kV, 1 mA).
 * `filters` attenuate the photons leaving the tube; the 35 kV reference stays unfiltered. */
export function tubeFactor(UkV: number, ImA: number, params: ModelParams = DEFAULT, filters: Filters = []): number {
  if (ImA === 0 || UkV === 0) return 0
  let ref = photonsOutRef.get(params)
  if (ref === undefined) photonsOutRef.set(params, (ref = photonsOut(U_REF_KV, params)))
  return ImA * (photonsOut(UkV, params, filters) / ref)
}

export function checkTube(UkV: number, ImA: number): void {
  if (!(UkV >= 0 && UkV <= U_MAX_KV && ImA >= 0 && ImA <= I_MAX_MA))
    throw new RangeError(`U_kV must be in 0 … ${U_MAX_KV}, I_mA in 0 … ${I_MAX_MA} (LD 554 800)`)
}

/** port of braggsim.scan.expected_rate: expected observed rate R̄ in counts/s (deterministic).
 * `betaDeg`: target angles; `sensorDeg`: sensor angles, same length, or null/undefined for the 2:1
 * coupled scan (sensor at 2β). `s1Cm`, `s2Cm`: collimator and counter distances (σ, Bragg signal, halo, scatter). Throws on the same invalid inputs as Python. A crystal turned half a
 * turn (β = S/2 + 180°) reflects nothing: its holder blocks the beam. `filters`: absorbers in the beam. `crystal`: default NaCl; the others need loadCrystals(). */
export function expectedRate(
  betaDeg: ArrayLike<number>,
  UkV: number,
  ImA: number,
  params: ModelParams = DEFAULT,
  sensorDeg?: ArrayLike<number> | null,
  filters: Filters = [],
  crystal: Crystal = NACL,
  s1Cm: number = REF_S1_CM,
  s2Cm: number = REF_S2_CM,
): Float64Array {
  checkGeometry(s1Cm, s2Cm)
  params = withSigma(params, angularSigmaDeg(s1Cm, s2Cm, params))
  const gain = crystalFactor(s2Cm)
  const halo = directBeamFactor(s1Cm, s2Cm)
  const beta = Float64Array.from(betaDeg)
  let sensor: Float64Array
  if (sensorDeg == null) {
    if (!beta.every((b) => b >= BETA_MIN_DEG && b <= BETA_MAX_DEG))
      throw new RangeError(`β outside the coupled range ${BETA_MIN_DEG}° … ${BETA_MAX_DEG}°`)
    sensor = beta.map((b) => 2 * b)
  } else {
    sensor = Float64Array.from(sensorDeg)
    if (sensor.length !== beta.length || !beta.every(Number.isFinite))
      throw new RangeError('target and sensor angles must be finite arrays of the same shape')
    if (!sensor.every((s) => s >= SENSOR_MIN_DEG && s <= SENSOR_MAX_DEG))
      throw new RangeError(`sensor outside its range ${SENSOR_MIN_DEG}° … ${SENSOR_MAX_DEG}°`)
    for (let i = 0; i < beta.length; i++) beta[i] = pyMod(beta[i] + 180, 360) - 180 // target turns without limit
  }
  checkTube(UkV, ImA)
  checkFilters(filters)
  const out = new Float64Array(beta.length)
  if (beta.length === 0) return out
  const t = tubeState(UkV, ImA, params, filters, crystal)
  const on = ImA > 0 && UkV > 0
  for (let i = 0; i < beta.length; i++) {
    const s = sensor[i]
    let rate =
      params.background_per_s +
      t.tube * (params.scatter_per_s * gain + halo * params.leak_amp_per_s * Math.exp(-0.5 * (s / params.leak_width_deg) ** 2))
    if (on) {
      const theta = Math.abs(s) / 2
      const rocking = Math.exp(-0.5 * ((s / 2 - beta[i]) / params.sigma_deg) ** 2)
      let lines = 0
      for (const l of t.lines) lines += l.weight * gaussian(theta - l.theta, params.sigma_deg)
      rate = rate + gain * params.scale * rocking * (interp(theta, t.thetaGrid, t.smoothed) + lines)
    }
    out[i] = deadTime(rate, params.tau_s)
  }
  return out
}

/** port of braggsim.scan.direct_rate: observed rate in counts/s with the counter in the direct beam
 * (no crystal, sensor at `sensorDeg`; EPN Práctica 1). Wheel absorbers and Moseley foils are both `filters`. */
export function directRate(UkV: number, ImA: number, filters: Filters = [], params: ModelParams = DEFAULT, sensorDeg = 0, s1Cm: number = DIRECT_REF_S1_CM, s2Cm: number = DIRECT_REF_S2_CM): number {
  checkGeometry(s1Cm, s2Cm)
  if (!(sensorDeg >= SENSOR_MIN_DEG && sensorDeg <= SENSOR_MAX_DEG)) throw new RangeError(`sensor outside its range ${SENSOR_MIN_DEG}° … ${SENSOR_MAX_DEG}°`)
  checkTube(UkV, ImA)
  checkFilters(filters)
  if (!validated.has(params)) throw new TypeError('params must come from modelParams()')
  const profile = Math.exp(-0.5 * (sensorDeg / params.leak_width_deg) ** 2)
  return deadTime(params.direct_per_s * directBeamFactor(s1Cm, s2Cm, DIRECT_REF_S1_CM, DIRECT_REF_S2_CM) * tubeFactor(UkV, ImA, params, filters) * profile + params.background_per_s, params.tau_s)
}
