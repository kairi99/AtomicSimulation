// Lab mode: find the K absorption edge of four foils (EPN Práctica 5, Moseley's law) from one open scan and
// one scan per foil, each exported as CSV. Misconception: "higher Z (more energy) means a larger angle".
// The app checks the scans, never the student's R∞ or σ_K (braggsim.analysis.k_edge_deg is the model).
import { zeroOk, type Apparatus } from '../../apparatus/apparatus'
import { EDGE_SPLIT_HALF_WINDOW_DEG, MAX_EDGE_STEP_DEG, MIN_PROMINENCE_SIGMA } from '../../physics/analysis'
import { HC_KEV_PM, K_EDGE_KEV } from '../../physics/constants'
import { crystalByName, dPm, thetaFromLambda } from '../../physics/crystal'
import { DEFAULT, expectedRate } from '../../physics/scan'
import { FOILS_MG_CM2 } from '../../physics/tables'
import { exportedScans, type ExportRecord } from '../csv'
import type { GuidedTask } from '../task'

const FOILS = Object.keys(K_EDGE_KEV) as (keyof typeof K_EDGE_KEV)[]
const KEYS = ['open', ...FOILS]
// The window of the EPN procedure on NaCl (FIRST, LAST in 0.1°); a wider one (e.g. LD's 3°–8°) also passes.
const P5_WINDOW_DEG = [3.7, 7.5]
const [P5_FIRST, P5_LAST] = P5_WINDOW_DEG.map((d) => Math.round(d * 10))
// A group of scans is all on one of these crystals (the task offers NaCl, and LiF as a variant).
const CRYSTALS_OK = ['NaCl', 'LiF']

/** θ of the 1st-order K edge of `el` on `crystal`, in degrees. */
const edgeTheta = (el: keyof typeof K_EDGE_KEV, crystal: string) =>
  thetaFromLambda(HC_KEV_PM / K_EDGE_KEV[el], 1, dPm(crystalByName(crystal)))

/** The window (FIRST, LAST in 0.1°) a scan on `crystal` must cover: the EPN one on NaCl, else every foil's edge
 * ± the edge-search half-window, computed from that crystal's d. */
function windowOf(crystal: string): [number, number] {
  if (crystal === 'NaCl') return [P5_FIRST, P5_LAST]
  const th = FOILS.map((el) => edgeTheta(el, crystal))
  const h = EDGE_SPLIT_HALF_WINDOW_DEG + 1e-9
  return [Math.floor(10 * (Math.min(...th) - h)), Math.ceil(10 * (Math.max(...th) + h))]
}

/** The scan's own label: the foil in the beam, 'open' with none; null if two foils were in. */
function keyOf(r: ExportRecord): string | null {
  const foils = [r.setup.collimatorFilter, r.setup.sensorFilter].filter((f) => f !== null)
  return foils.length > 1 ? null : (foils[0] ?? 'open')
}

/** A coupled scan on the crystal, steady, fine enough and wide enough for an edge search on its crystal's d. */
function usable(r: ExportRecord): boolean {
  if (r.mode !== 'COUPLED' || r.changed || !zeroOk(r.zero) || r.setup.holder !== 'crystal' || !CRYSTALS_OK.includes(r.setup.crystal)) return false
  if (r.step <= 0 || r.step / 10 > MAX_EDGE_STEP_DEG) return false
  try {
    const [first, last] = windowOf(r.setup.crystal)
    return r.first <= first && r.last >= last
  } catch {
    return false // the crystal table is not loaded (cannot be, after a scan on it)
  }
}

// Same beam and same crystal: groups never mix crystals.
const sameBeam = (a: ExportRecord, b: ExportRecord) => a.u === b.u && a.i === b.i && a.setup.crystal === b.setup.crystal

// The coarse test of braggsim.analysis.k_edge_deg on the expected rates: for every split β_k of the scan
// within EDGE_SPLIT_HALF_WINDOW_DEG of the tabulated edge, the weighted mean transmission T = R_foil / R_open
// over that half-window after β_k against the same before it (β_k itself in neither), with the Poisson
// variance max(R·Δt, 1)/Δt² of both scans. The best split must rise by MIN_PROMINENCE_SIGMA.
const variance = (rate: number, dt: number) => Math.max(rate * dt, 1) / dt ** 2

function edgeStands(el: keyof typeof K_EDGE_KEV, open: ExportRecord, foil: ExportRecord): boolean {
  if (FOILS_MG_CM2[el] === undefined) return false
  const crystal = crystalByName(foil.setup.crystal)
  const thetaK = edgeTheta(el, foil.setup.crystal)
  const h = EDGE_SPLIT_HALF_WINDOW_DEG + 1e-9
  const betas: number[] = []
  for (let b = foil.first; b <= foil.last; b += foil.step) betas.push(b / 10)
  const [u, i] = [foil.u / 10, foil.i / 100]
  const rOpen = expectedRate(betas, u, i, DEFAULT, null, [], crystal)
  const rFoil = expectedRate(betas, u, i, DEFAULT, null, [[el, FOILS_MG_CM2[el]]], crystal)
  if (rOpen.some((r) => r <= 0)) return false
  const side = (inSide: (b: number) => boolean) => {
    let [sw, swt, n] = [0, 0, 0]
    betas.forEach((b, k) => {
      if (!inSide(b)) return
      const T = rFoil[k] / rOpen[k]
      const sigma = Math.sqrt(variance(rFoil[k], foil.dt) + T ** 2 * variance(rOpen[k], open.dt)) / rOpen[k]
      sw += 1 / sigma ** 2
      swt += T / sigma ** 2
      n++
    })
    return { n, mean: swt / sw, err: 1 / Math.sqrt(sw) }
  }
  return betas.some((split) => {
    if (Math.abs(split - thetaK) > h) return false
    const lo = side((b) => b >= split - h && b < split)
    const hi = side((b) => b > split && b <= split + h)
    return lo.n >= 2 && hi.n >= 2 && (hi.mean - lo.mean) / Math.hypot(lo.err, hi.err) >= MIN_PROMINENCE_SIGMA
  })
}

/** The open scan and foils that the exports of one (U, I) group cover, edge check included. */
function collected(group: ExportRecord[]): Set<string> {
  const opens = group.filter((r) => keyOf(r) === 'open')
  const keys = new Set<string>()
  if (opens.length) keys.add('open')
  for (const el of FOILS) {
    if (group.some((f) => keyOf(f) === el && opens.some((o) => edgeStands(el, o, f)))) keys.add(el)
  }
  return keys
}

/** For each usable export, what its (U, I) group has collected, oldest first. Card and success ask every
 * frame, so it is worked out once per list of exports (markExported makes a new list each time). */
const memo = new WeakMap<readonly ExportRecord[], Set<string>[]>()
function groups(a: Apparatus): Set<string>[] {
  const list = exportedScans(a)
  let out = memo.get(list)
  if (!out) {
    const all = list.filter((r) => usable(r) && keyOf(r) !== null)
    out = all.map((r) => collected(all.filter((x) => sameBeam(x, r))))
    memo.set(list, out)
  }
  return out
}

export const task: GuidedTask = {
  id: 'moseley-k-edges',
  mode: 'lab',
  level: 2,
  crystal: 'NaCl', // the default bench; the LiF variant needs the picker
  holder: 'crystal',
  crystalLocked: false,
  controls: ['U', 'I', 'DT', 'DBETA', 'LIMITS', 'SENSOR', 'TARGET', 'COUPLED', 'ZERO', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED' },
  predict: { kind: 'choice', answer: 0 },
  // Exported coupled scans at one U and I (the same beam): an open scan and one per foil, each fine and wide
  // enough for k_edge_deg, and each foil's edge expected to stand MIN_PROMINENCE_SIGMA in the transmission.
  success: (a) => groups(a).some((keys) => keys.size === KEYS.length),
  progress: (a) => {
    const keys = groups(a).at(-1) ?? new Set<string>() // the group of the latest usable export
    return KEYS.map((key) => ({ key, done: keys.has(key) }))
  },
}
