// Which experiment the student works on (Bragg at NaCl or X-ray attenuation) and whether its assembly was ever
// completed on this device (then the teacher shortcut is offered). The chooser opens at every page load; the
// remembered choice is only pre-highlighted. Storage can throw (blocked cookies): nothing is then remembered.
import { EXPERIMENTS, type Experiment } from '../apparatus/assembly'

const KEY = 'experiment'
const DONE = (e: Experiment) => `assembled:${e}`

let current: Experiment = 'bragg'
let remembered = false
try {
  const v = localStorage.getItem(KEY)
  if ((EXPERIMENTS as readonly string[]).includes(v ?? '')) ((current = v as Experiment), (remembered = true))
} catch {}

export const getExperiment = (): Experiment => current
/** True when a previous visit stored a choice (the chooser pre-highlights it). */
export const hasRememberedExperiment = (): boolean => remembered
export function setExperiment(e: Experiment): void {
  current = e
  remembered = true
  try {
    localStorage.setItem(KEY, e)
  } catch {}
}
let doneMem = new Set<Experiment>()
export function wasAssembled(e: Experiment): boolean {
  try {
    if (localStorage.getItem(DONE(e)) === '1') return true
  } catch {}
  return doneMem.has(e)
}
export function markAssembled(e: Experiment): void {
  doneMem.add(e)
  try {
    localStorage.setItem(DONE(e), '1')
  } catch {}
}
