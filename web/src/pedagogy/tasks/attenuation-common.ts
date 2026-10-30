// Shared by the EPN Práctica 1 (attenuation) Lab tasks: the exposure log read as measurements, and the
// expected rate of each exposure from the model (physics/scan.directRate), never the student's own numbers.
import { SATURATION_OBSERVED_TAU, type ExposureRecord, type Holder } from '../../apparatus/apparatus'
import { DEFAULT, directRate } from '../../physics/scan'
import { FOILS_MG_CM2, WHEELS_MG_CM2 } from '../../physics/tables'

/** Poisson variance of a mean rate over dt seconds, as braggsim.analysis (at least one count). */
export const variance = (rate: number, dt: number) => Math.max(rate * dt, 1) / dt ** 2

/** Expected observed rate of one logged exposure, in counts/s; undefined while the absorber tables load. */
export function expectedOf(r: ExposureRecord): number | undefined {
  const table = WHEELS_MG_CM2[r.setup.holder === 'alWheel' ? 'al' : 'material']
  const names = [r.setup.collimatorFilter, r.setup.sensorFilter].filter((n) => n !== null)
  if (table.length === 0 || names.some((n) => FOILS_MG_CM2[n] === undefined)) return undefined
  const plate = r.slot === null ? null : table[r.slot]
  const filters: [string, number][] = names.map((n) => [n, FOILS_MG_CM2[n]])
  if (plate) filters.push([plate[0], plate[1]])
  return directRate(r.u / 10, r.i / 100, filters, DEFAULT, r.sensorTrue / 10)
}

export const isSaturated = (rate: number) => rate * DEFAULT.tau_s > SATURATION_OBSERVED_TAU

/** Finished, steady exposures with a plate (or the open slot) of one holder in the beam. */
export const plateRuns = (log: readonly ExposureRecord[], holder: Holder) =>
  log.filter((r) => r.setup.holder === holder && r.slot !== null && !r.changed && r.u > 0 && r.i > 0)
