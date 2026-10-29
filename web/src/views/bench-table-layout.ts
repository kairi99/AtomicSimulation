// Pure layout of the workbench: where each part of an experiment lies on the table in front of the apparatus (its fixed
// "home spot") and the extent of the table drop zone. No three.js, no DOM. Scene units are cm; x to the right, z towards the
// student, as in views/bench.ts. Row-major from the apparatus outwards; a short last row is centred.
import type { Part } from '../apparatus/assembly'

export type Spot = { x: number; z: number }
/** `elev`: the camera's height over its horizontal distance (the view is from the front and above). */
export type TableLayout = { cols: number; dx: number; dz: number; cx: number; z0: number; elev: number }

const FRONT_Z = 19 // the housing's front edge: the table zone starts just in front of it

/** Landscape: two rows of six across the table; portrait (phones): rows of four, spaced so a label fits under each part. */
export const tableLayout = (portrait: boolean): TableLayout =>
  portrait ? { cols: 4, dx: 12.5, dz: 16, cx: 17.5, z0: 25, elev: 0.85 } : { cols: 6, dx: 11, dz: 16, cx: 17.5, z0: 25, elev: 0.7 }

export function tableSpots(parts: readonly Part[], l: TableLayout): Partial<Record<Part, Spot>> {
  const out: Partial<Record<Part, Spot>> = {}
  parts.forEach((p, i) => {
    const row = Math.floor(i / l.cols)
    const inRow = Math.min(l.cols, parts.length - row * l.cols)
    const col = i - row * l.cols
    out[p] = { x: l.cx + (col - (inRow - 1) / 2) * l.dx, z: l.z0 + row * l.dz }
  })
  return out
}

/** The drop zone: the whole table in front of the apparatus (centre and size in x and z). */
export function tableRect(n: number, l: TableLayout): { cx: number; cz: number; w: number; d: number } {
  const rows = Math.max(1, Math.ceil(n / l.cols))
  const zBack = FRONT_Z
  const zFront = l.z0 + (rows - 1) * l.dz + l.dz
  const w = Math.max(l.cols * l.dx + l.dx, 70)
  return { cx: l.cx, cz: (zBack + zFront) / 2, w, d: zFront - zBack }
}
