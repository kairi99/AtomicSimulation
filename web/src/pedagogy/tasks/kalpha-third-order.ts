// Where is 3rd-order Kα? Confronts "the n-th order sits at n times the 1st-order angle": sin θ triples,
// not θ. Third order, not second: 3 × 7.24° is 0.49° (4σ) short of Kα, so the wrong guess finds only
// continuum; in second order the two are one σ apart and the wrong guess would still see the peak.
import { wrapTarget } from '../../apparatus/apparatus'
import { MO_KA_PM } from '../../physics/constants'
import { thetaFromLambda } from '../../physics/crystal'
import type { GuidedTask } from '../task'

const THETA_STEP = Math.round(10 * thetaFromLambda(MO_KA_PM, 3)) // the display step nearest θ₃, 0.1°

export const task: GuidedTask = {
  id: 'kalpha-third-order',
  mode: 'explore',
  level: 1,
  crystal: 'NaCl',
  holder: 'crystal',
  controls: ['COUPLED', 'HV'],
  initial: { U_kV: 35, I_mA: 1, mode: 'COUPLED' },
  predict: { kind: 'number', unit: '°' },
  // HV on, crystal at rest on the step nearest the Bragg angle, counter coupled at 2θ. (An intro task: it does not require the zero calibration.)
  success: (a) =>
    a.setup.holder === 'crystal' && a.setup.crystal === 'NaCl' && a.hvOn && !a.moving && wrapTarget(a.target) === THETA_STEP && a.sensor === 2 * THETA_STEP ,
}
