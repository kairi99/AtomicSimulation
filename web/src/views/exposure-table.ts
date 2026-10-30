// The exposure record as a plain table and the absorber window in the beam, both read straight from the Apparatus
// (its exposure log, wheelSlot and the exported absorber tables): the views compute nothing. The table is raw data only:
// T, ln T and μ are left to the student.
import { wheelSlot, type Apparatus, type ExposureRecord } from '../apparatus/apparatus'
import { t } from '../i18n'
import { WHEELS_MM } from '../physics/tables'

const plateOf = (holder: string): 'al' | 'material' | null => (holder === 'alWheel' ? 'al' : holder === 'materialWheel' ? 'material' : null)
const mmText = (mm: number): string => mm.toFixed(1)
const materialName = (m: string): string => t().absorberNames[m] ?? m

/** What sits in the beam on the absorber plate at the present target angle ("Ventana: Al 1.0 mm", "Marco (entre ventanas)"); '' with no plate mounted. */
export function windowLabel(a: Apparatus): string {
  const plate = plateOf(a.setup.holder)
  if (!plate) return ''
  const s = t()
  const k = wheelSlot(a.setup.holder, a.trueTarget)
  if (k === null) return s.slotFrame
  const slot = WHEELS_MM[plate][k]
  return slot ? s.slotWindow(materialName(slot[0]), mmText(slot[1])) : s.slotOpen
}

/** The columns of one logged exposure: slot angle, material and thickness of the absorber in the beam, and the counting data. */
function cells(e: ExposureRecord): string[] {
  const s = t()
  const plate = plateOf(e.setup.holder)
  const slot = plate && e.slot !== null ? WHEELS_MM[plate][e.slot] : null
  const material = plate === null ? s.expNoPlate : e.slot === null ? s.expFrame : slot ? materialName(slot[0]) : s.expOpen
  const d = plate === null || e.slot === null ? s.expNoPlate : slot ? mmText(slot[1]) : '0'
  return [
    (e.target / 10).toFixed(1), material, d, (e.u / 10).toFixed(1), (e.i / 100).toFixed(2), String(e.dt), String(Math.round(e.rate * e.dt)), String(Number(e.rate.toFixed(1))),
  ]
}

/** The table's HTML; every cell is a number or one of our own strings. A starred row had U or I changing while it counted. */
export function exposureTableHtml(log: readonly ExposureRecord[]): string {
  const s = t()
  const c = s.expCols
  const head = [c.n, c.slot, c.material, c.d, c.u, c.i, c.dt, c.counts, c.rate].map((h) => `<th scope="col">${h}</th>`).join('')
  const rows = log
    .map((e, k) => `<tr><th scope="row">${k + 1}${e.changed ? `<abbr title="${s.expChanged}">*</abbr>` : ''}</th>${cells(e).map((v, j) => `<td${j === 1 ? ' class="txt"' : ''}>${v}</td>`).join('')}</tr>`)
    .join('')
  return `<table aria-label="${s.expTableLabel}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table><p class="foot">${s.expTableNote}</p>`
}
