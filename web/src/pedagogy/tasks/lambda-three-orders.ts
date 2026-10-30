// Lab mode: measure one scan across three orders and export it, to find λ(Kα) and λ(Kβ) from each order
// (LD P6.3.3.1 Tables 3–5). The app checks the scan, never the student's wavelengths.
import { zeroOk } from '../../apparatus/apparatus'
import { MO_KA_PM, MO_KB_PM } from '../../physics/constants'
import { MAX_STEP_DEG, MIN_PROMINENCE_SIGMA, PEAK_HALF_WINDOW_DEG, lineProminences } from '../../physics/analysis'
import { thetaFromLambda } from '../../physics/crystal'
import { wasExported } from '../csv'
import { foilsOf, type GuidedTask } from '../task'

const THETAS = [1, 2, 3].flatMap((n) => [thetaFromLambda(MO_KB_PM, n), thetaFromLambda(MO_KA_PM, n)])
const W = PEAK_HALF_WINDOW_DEG

export const task: GuidedTask = {
  id: 'lambda-three-orders',
  mode: 'lab',
  level: 2,
  crystal: 'NaCl',
  holder: 'crystal',
  controls: ['U', 'I', 'DT', 'DBETA', 'LIMITS', 'SENSOR', 'TARGET', 'COUPLED', 'ZERO', 'SCAN'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED' },
  predict: { kind: 'choice', answer: 0 },
  // A finished, exported coupled scan at steady U and I that braggsim.analysis could work with: every
  // Kβ and Kα peak of orders 1–3 inside it with its marked window (±PEAK_HALF_WINDOW_DEG), a step no
  // coarser than MAX_STEP_DEG, and each line expected to stand MIN_PROMINENCE_SIGMA above its background.
  success: (a) => {
    const s = a.lastScan
    const r = a.replay
    if (!s || s.mode !== 'COUPLED' || s.changed || !zeroOk(s.zero) || a.busy || r.length < 2 || !wasExported(a)) return false
    if (s.setup.holder !== 'crystal' || s.setup.crystal !== 'NaCl') return false // the scan's own setup, not the bench's now
    const filters = foilsOf(s.setup)
    if ((r[1].angle - r[0].angle) / 10 > MAX_STEP_DEG) return false
    if (r[0].angle / 10 > THETAS[0] - W || r.at(-1)!.angle / 10 < THETAS[5] + W) return false
    // each line's background window is cut at the midpoint to its neighbours, as in braggsim.analysis.wavelength_table
    const lines = lineProminences(r[0].angle / 10, r.at(-1)!.angle / 10, s.u / 10, s.i / 100, s.dt, filters)
    return THETAS.every((th) => lines.some(([t, , sigma]) => t === th && sigma >= MIN_PROMINENCE_SIGMA))
  },
}
