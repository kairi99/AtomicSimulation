// Pure geometry for the 3D assembly (no three.js, no DOM): turning a pointer ray into the distances s₁ and s₂,
// sizing drop volumes so they stay finger-sized on screen, and shifting the view to the free area beside the HUD.
// Scene units are cm; x to the right, y up, z towards the student (see views/bench.ts).
import { DISTANCE_RANGE_CM } from '../apparatus/assembly'

export type V3 = { x: number; y: number; z: number }

/** Where a ray meets the plane z = `planeZ` (null when it runs parallel to it or points away). */
export function rayAtZ(o: V3, d: V3, planeZ: number): { x: number; y: number } | null {
  if (Math.abs(d.z) < 1e-9) return null
  const t = (planeZ - o.z) / d.z
  if (t < 0) return null
  return { x: o.x + t * d.x, y: o.y + t * d.y }
}

const clampRange = (cm: number): number => Math.min(DISTANCE_RANGE_CM.max, Math.max(DISTANCE_RANGE_CM.min, cm))
/** One decimal, like the HUD slider: the label never shows more precision than the student can set. */
export const snapCm = (cm: number): number => Math.round(cm * 10) / 10

/** s₁ (cm) from a pointer ray dragging the goniometer along the guide rods: the unit slides in x on the plane z = `planeZ`
 * (the rods' depth); s₁ is measured from the collimator slit at `slitX`. Clamped to the slider range; null without a hit. */
export function s1FromRay(o: V3, d: V3, planeZ: number, slitX: number, grabOffsetCm = 0): number | null {
  const p = rayAtZ(o, d, planeZ)
  return p ? snapCm(clampRange(p.x - slitX - grabOffsetCm)) : null
}

/** s₂ (cm) from a pointer ray dragging the counter along the sensor arm: the arm turns about the axis (`axis`, in the
 * beam plane z = `planeZ`) by `angleRad`; s₂ is the counter window's distance from the axis along it. */
export function s2FromRay(o: V3, d: V3, planeZ: number, axis: { x: number; y: number }, angleRad: number, grabOffsetCm = 0): number | null {
  const p = rayAtZ(o, d, planeZ)
  if (!p) return null
  const along = (p.x - axis.x) * Math.cos(angleRad) + (p.y - axis.y) * Math.sin(angleRad)
  return snapCm(clampRange(along - grabOffsetCm))
}

/** Screen pixels per scene cm at distance `dist` from a perspective camera (vertical field of view in degrees). */
export const pxPerCm = (viewportHeightPx: number, fovDeg: number, dist: number): number =>
  viewportHeightPx / (2 * dist * Math.tan((fovDeg * Math.PI) / 360))

/** A drop volume's edge in cm: at least `baseCm`, and never smaller than `minPx` on screen. */
export const hitSizeCm = (baseCm: number, pxPerCm_: number, minPx = 48): number => Math.max(baseCm, minPx / Math.max(pxPerCm_, 1e-6))

export type Reserve = { left: number; right: number; top: number; bottom: number }
/** The free rectangle of a viewport of w × h px once the HUD takes `reserve`: its centre offset from the viewport
 * centre (px) and the fraction of each side that is free. camera.setViewOffset(w, h, -dx, -dy, w, h) shifts the scene by (dx, dy). */
export function freeArea(w: number, h: number, r: Reserve): { dx: number; dy: number; fw: number; fh: number } {
  const fw = Math.max(0.25, (w - r.left - r.right) / w)
  const fh = Math.max(0.25, (h - r.top - r.bottom) / h)
  return { dx: (r.left - r.right) / 2, dy: (r.top - r.bottom) / 2, fw, fh }
}

/** Camera distance so a w × h cm face fits the free fraction (fw, fh) of the viewport. */
export function fitDistance(wCm: number, hCm: number, fovDeg: number, aspect: number, fw: number, fh: number, margin: number): number {
  const vt = Math.tan((fovDeg * Math.PI) / 360)
  const ht = vt * aspect
  return margin * Math.max(wCm / fw / 2 / ht, hCm / fh / 2 / vt)
}

/** Camera distance from `target` along the unit-ish direction `dir` (target -> camera) so that every point of `pts` lands inside the
 * free fraction (fw, fh) of the viewport, times `margin`. The camera looks at `target` with +y up. */
export function fitPoints(pts: readonly V3[], target: V3, dir: V3, fovDeg: number, aspect: number, fw: number, fh: number, margin: number): number {
  const n = Math.hypot(dir.x, dir.y, dir.z) || 1
  const w = { x: dir.x / n, y: dir.y / n, z: dir.z / n } // camera axis, pointing at the camera
  let rx = w.z // right = up x w
  let rz = -w.x
  const rn = Math.hypot(rx, rz) || 1
  rx /= rn
  rz /= rn
  const r = { x: rx, y: 0, z: rz }
  const u = { x: w.y * r.z, y: w.z * r.x - w.x * r.z, z: -w.y * r.x } // screen up = w x r
  const un = Math.hypot(u.x, u.y, u.z) || 1
  const vt = Math.tan((fovDeg * Math.PI) / 360)
  const ht = vt * aspect
  let need = 0
  for (const p of pts) {
    const d = { x: p.x - target.x, y: p.y - target.y, z: p.z - target.z }
    const depth = d.x * w.x + d.y * w.y + d.z * w.z // towards the camera: the point is that much closer
    const px = Math.abs(d.x * r.x + d.y * r.y + d.z * r.z)
    const py = Math.abs(d.x * u.x + d.y * u.y + d.z * u.z) / un
    need = Math.max(need, depth + px / (fw * ht), depth + py / (fh * vt))
  }
  return margin * need
}
