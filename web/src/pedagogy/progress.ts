// Guided-task progress per device and experiment, and the Explore lock it drives: Explore opens once every lab
// task of the experiment's core list is done. Pure logic; the card decides which tasks are core.
// Storage can throw (blocked cookies, sandboxed LMS iframes): progress is then kept for the page only.
import type { Experiment } from '../apparatus/assembly'

export type LockState = { locked: boolean; done: number; total: number }

const KEY = (e: Experiment) => `progress:${e}`
const mem = new Map<Experiment, Set<string>>()

/** Ids of the tasks the student has finished (reached the observe step) for `exp` on this device. */
export function completedIds(exp: Experiment): Set<string> {
  const ids = new Set(mem.get(exp))
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(exp)) ?? '[]')
    if (Array.isArray(raw)) for (const id of raw) if (typeof id === 'string') ids.add(id)
  } catch {}
  return ids
}
/** Records a finished task. Returns true when it was not recorded before. */
export function markCompleted(exp: Experiment, id: string): boolean {
  const ids = completedIds(exp)
  if (ids.has(id)) return false
  ids.add(id)
  mem.set(exp, ids)
  try {
    localStorage.setItem(KEY(exp), JSON.stringify([...ids]))
  } catch {}
  return true
}
/** Forgets the stored progress of every experiment (tests; a "start over" if one is ever added). */
export function clearProgress(experiments: readonly Experiment[]): void {
  mem.clear()
  for (const e of experiments) {
    try {
      localStorage.removeItem(KEY(e))
    } catch {}
  }
}

/** The lock for the lab-task ids that gate Explore. `teacher` (the ?teacher URL param) bypasses it. */
export function lockState(labIds: readonly string[], completed: ReadonlySet<string>, teacher = false): LockState {
  const done = labIds.filter((id) => completed.has(id)).length
  return { locked: !teacher && done < labIds.length, done, total: labIds.length }
}
