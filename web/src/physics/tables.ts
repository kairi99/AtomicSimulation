// Lookup data exported by model/scripts/export_artifacts.py. The browser never recomputes it.
import muRho from '../../../artifacts/tables/mu_rho.json'
import modelParams from '../../../artifacts/tables/model_params.json'
import type { Crystal } from './crystal'
import structureFactor from '../../../artifacts/tables/structure_factor.json'

export const MU_RHO_GRID_PM: readonly number[] = muRho.lambda_pm
// The logs are taken once at load: transmission() interpolates log μ/ρ over log λ.
export const LOG_MU_RHO_GRID = Float64Array.from(muRho.lambda_pm, Math.log)
const logMuRho: Record<string, Float64Array> = Object.fromEntries(
  Object.entries(muRho.mu_rho_cm2_g).map(([m, t]) => [m, Float64Array.from(t, Math.log)]),
)
export const LOG_MU_RHO: Readonly<Record<string, Float64Array>> = logMuRho
/** K, L1–L3 absorption edges (pm) of each material inside the grid, exported by Python and only read here. */
const edgesPm: Record<string, readonly number[]> = { ...muRho.edge_lambda_pm }
export const EDGES_PM: Readonly<Record<string, readonly number[]>> = edgesPm

/** Foil set 554 832 (name → mg/cm²) and the two plates of the absorption accessory 554 834 (7 slots,
 * `null` = open); empty until loadAbsorbers() resolves. */
export const FOILS_MG_CM2: Record<string, number> = {}
/** A foil name (or null = none) as the [name, mg/cm²] list the physics functions take. */
export const foilOf = (name: string | null): [string, number][] => (name === null ? [] : [[name, FOILS_MG_CM2[name]]])
export type Slot = readonly [string, number] | null
export const WHEELS_MG_CM2: Record<'al' | 'material', readonly Slot[]> = { al: [], material: [] }
/** The same slots with their thickness in mm (the LD catalog value the areal density was computed from); exported by Python. */
export const WHEELS_MM: Record<'al' | 'material', readonly Slot[]> = { al: [], material: [] }

export const absorbersLoaded = (): boolean => 'Zr' in logMuRho

/** Merge the absorber tables (Polystyrene … In, ~78 kB gzip) into LOG_MU_RHO. A separate chunk, fetched
 * only by the views that use filters; idempotent. Same λ grid as mu_rho.json. */
export async function loadAbsorbers(): Promise<void> {
  if (absorbersLoaded()) return
  const { default: absorbers } = await import('../../../artifacts/tables/mu_rho_absorbers.json')
  for (const [m, t] of Object.entries(absorbers.mu_rho_cm2_g as Record<string, number[]>)) logMuRho[m] = Float64Array.from(t, Math.log)
  Object.assign(edgesPm, absorbers.edge_lambda_pm)
  Object.assign(FOILS_MG_CM2, absorbers.foils_mg_cm2)
  Object.assign(WHEELS_MG_CM2, absorbers.wheels_mg_cm2)
  Object.assign(WHEELS_MM, absorbers.wheels_mm)
}
/** Crystal presets by name (LiF, NaCl, Si, calcite, muscovite); empty until loadCrystals() resolves. The NaCl
 * default path never needs it: it uses STRUCTURE_FACTOR_SQ_REL and D_NACL_PM. */
export const CRYSTALS: Record<string, Crystal> = {}
export const crystalsLoaded = (): boolean => 'NaCl' in CRYSTALS

export const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v)
  return Object.freeze(o)
}
/** Run `load` once however often the result is asked for; a rejection is forgotten so a retry runs it again. */
export function retryableOnce(load: () => Promise<void>): () => Promise<void> {
  let p: Promise<void> | undefined
  return () => (p ??= load().catch((e) => {
    p = undefined
    throw e
  }))
}

/** Fill CRYSTALS from crystals.json (~52 kB gzip). A separate chunk, fetched only when a non-NaCl crystal is
 * chosen; idempotent, one import however often it is called (a failed fetch can be retried). Entries are
 * deep-frozen: the tube cache and the μ cache key on object identity. */
export const loadCrystals = retryableOnce(async () => {
  const { default: t } = await import('../../../artifacts/tables/crystals.json')
  const rows = Object.entries(t.crystals as unknown as Record<string, Omit<Crystal, 'name'>>)
  for (const [name, c] of rows) CRYSTALS[name] = deepFreeze({ name, ...structuredClone(c) })
})
export const STRUCTURE_FACTOR_SQ_REL: readonly number[] = structureFactor.f_sq_rel
export const DEFAULT_PARAMS_JSON = modelParams.params
export const MODEL_VERSION = modelParams.model_version

/** One row of forge_elements.json (port of the dict braggsim.forge.element_tables builds for one Z). */
export type ForgeElement = {
  symbol: string
  atomic_weight: number // g/mol
  f0: readonly number[] // Rayleigh form factor, uniform in s = sin θ/λ (Å⁻¹) with step f0_step_A
  idx: readonly number[] // nodes of MU_RHO_GRID_PM kept for this element
  sigma_cm2: readonly number[] // atomic cross-section on those nodes
  f_prime: readonly number[]
  f_second: readonly number[] // xraylib sign: negative
  edges_pm: readonly number[]
  edge_sigma_cm2: readonly (readonly [number, number])[] // σ on the short-λ and long-λ side of each edge
}
/** Per-element tables of the Materials Forge (Z = 1 … 92, index Z − 1); empty until loadForgeElements() resolves. */
/** The limits Python exports with the tables (braggsim.forge.CONSTANTS): one source for both languages. */
export type ForgeConstants = {
  min_atom_distance_pm: number
  many_orders: number
  max_orders: number
  n_points: number // extinction quadrature of a forged crystal (presets: 2001)
  max_b_A2: number
}
export const FORGE: { f0_step_A: number; elements: readonly ForgeElement[]; constants: ForgeConstants } = {
  f0_step_A: 0,
  elements: [],
  constants: { min_atom_distance_pm: 0, many_orders: 0, max_orders: 0, n_points: 0, max_b_A2: 0 },
}
export const forgeElementsLoaded = (): boolean => FORGE.elements.length > 0

/** Fill FORGE from forge_elements.json (~148 kB gzip, 150.6 kB as built). A separate chunk, fetched only by the Forge; idempotent,
 * one import however often it is called (a failed fetch can be retried). */
export const loadForgeElements = retryableOnce(async () => {
  const { default: t } = await import('../../../artifacts/tables/forge_elements.json')
  FORGE.f0_step_A = t.f0_step_A
  FORGE.constants = t.constants
  FORGE.elements = deepFreeze(structuredClone(t.elements) as unknown as ForgeElement[])
})

/** One fluorescence line of an XRF sample (port of fluorescence.LineKernel without the secondary part). */
export type XrfLine = { label: string; energy_keV: number; k: readonly number[]; pin_eff: number }
/** One sample of artifacts/tables/xrf/<name>.json; every k, rayleigh, compton has lam_pm.length + 4 entries (Mo components last). */
export type XrfSample = {
  lam_pm: readonly number[]
  lines: readonly XrfLine[]
  rayleigh: readonly number[]
  compton: readonly number[]
  pin_eff_mid_rayleigh: readonly number[]
  pin_eff_mid_compton: readonly number[]
}
type XrfFile = {
  scale_per_source_unit: number
  compton_shift_pm: number
  air_in_mg_cm2: number
  pin_eff_mo_lines: Readonly<Record<string, number>>
  /** Lines a student may pick for a fit (fluorescence.reference_lines_keV); the JSON is key-sorted, not in menu order. */
  reference_lines_keV: Readonly<Record<string, number>>
  sample: XrfSample
}
/** XRF kernels (braggsim.fluorescence.kernels) by sample name, filled by loadXrfSample(); the shared constants
 * are 0 until the first sample loads. */
export const XRF: Omit<XrfFile, 'sample'> & { samples: Record<string, XrfSample> } = {
  scale_per_source_unit: 0, compton_shift_pm: 0, air_in_mg_cm2: 0, pin_eff_mo_lines: {}, reference_lines_keV: {}, samples: {},
}
const xrfFiles = import.meta.glob<XrfFile>('../../../artifacts/tables/xrf/*.json', { import: 'default' })
const xrfPath = (name: string) => `../../../artifacts/tables/xrf/${name}.json`
/** Every exported XRF sample (fluorescence.SAMPLES), loaded or not. */
export const XRF_SAMPLE_NAMES: readonly string[] = Object.keys(xrfFiles).map((p) => p.slice(p.lastIndexOf('/') + 1, -5))
const xrfLoaders = new Map<string, () => Promise<void>>()

/** Load one sample's kernels (~70 kB gzip each, own chunk), fetched only by the XRF practice; idempotent per
 * sample (a failed fetch can be retried). Rejects with RangeError for a sample that was never exported. */
export function loadXrfSample(name: string): Promise<void> {
  const file = xrfFiles[xrfPath(name)]
  if (!file) return Promise.reject(new RangeError(`unknown XRF sample ${JSON.stringify(name)}: use one of ${XRF_SAMPLE_NAMES}`))
  let load = xrfLoaders.get(name)
  if (!load) {
    load = retryableOnce(async () => {
      const { sample, ...shared } = deepFreeze(structuredClone(await file()))
      Object.assign(XRF, shared)
      XRF.samples[name] = sample
    })
    xrfLoaders.set(name, load)
  }
  return load()
}
