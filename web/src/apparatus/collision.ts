// Mechanical limits of the goniometer's arms: where the counter (sensor arm) and the crystal holder (target arm) run into the
// experiment chamber's walls, floor, ceiling or the collimator. Pure geometry of the device, no physics: the Apparatus uses it as
// a dynamic limit that depends on the distances s₁ and s₂ the student set, and the 3D bench shares its constants.
//
// Scene frame (cm): x right, y up, z towards the student. Both arms turn in the x–y plane about the goniometer axis (a line along z
// at (axisX, BEAM_Y)); positive angle = up. The check is two-dimensional. Every body carries `deep`: parts at the back of the chamber
// (the arm's rods and brackets, z ≈ −7.6) pass behind the collimator's z-range, so they only meet the chamber's walls.

/** Housing (instruction sheet §4) and the chamber, cm. */
export const W = 67
export const H = 48
export const D = 35
export const FLOOR = 8 // chamber floor above the table (feet and plinth)
export const CEIL = H - 2
export const COL_X = -W / 2 + 17 // right edge of the panel column
export const WALL_X = 1 // wall between the tube chamber and the experiment chamber
export const BEAM_Y = 20
export const SLIT_X = WALL_X + 5 // collimator slit, s₁ before the goniometer axis in the Bragg set-up
/** Inner faces of the experiment chamber (the liners). */
export const CHAMBER = { x0: WALL_X + 0.85, x1: W / 2 - 1.1, floor: FLOOR + 0.2, ceil: CEIL } as const
/** The sensor arm's z (rods and brackets), just in front of the plate. */
export const ARM_Z = -9 + 1.4

/** Sensor arm: −10 … +170° (§4), 0.1° steps. The target arm turns freely (the physics wraps it); one turn either way here. */
export const SENSOR_RANGE: readonly [number, number] = [-100, 1700]
export const TARGET_RANGE: readonly [number, number] = [-3600, 3600]
/** Gap kept between moving parts and what they would touch, cm. */
const CLEAR = 0.1

/** Poly: convex polygon, counter-clockwise points (x, y). */
type Poly = readonly (readonly [number, number])[]
type Body = { poly: Poly; deep: boolean }

const rect = (x0: number, x1: number, y0: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/** Counter geometry in the arm frame (origin: the counter's window at s₂; the body runs away from the axis along +x). From
 * `buildCounter` in views/bench-models.ts: front cylinder, brass band, rear body, stub, the hex clamp and its thumb screw below. */
export const COUNTER = {
  front: { x0: 0, x1: 4.3, r: 1.3 },
  hex: { x0: 2.35, x1: 3.85, r: 1.95 },
  band: { x0: 4.15, x1: 4.65, r: 1.42 },
  body: { x0: 4.7, x1: 8.3, r: 1.05 },
  stub: { x0: 8.1, x1: 8.9, r: 0.4 },
  screw: { x0: 2.55, x1: 3.65, y0: -3.05, y1: -1.3 }, // the knurled thumb screw under the clamp
} as const
/** The arm's rods and its two brackets: from the left bracket behind the axis to the one at the counter end (s₂ + 3.1). */
const ARM = { left: { x0: -6.45, x1: -5.35, h: 3.3 }, right: { dx0: 2.45, dx1: 3.75, h: 3.3 }, rodY0: 2.6, rodY1: 3.2 } as const

/** Where the sensor window sits on its arm, from the axis, and the goniometer axis in x. `refCm`: the attenuation experiment
 * measures s₁ and s₂ to the empty window of the absorber set, `refCm` beyond the axis (views/goniometer PLATE_R_CM). */
export function armGeometry(s1Cm: number, s2Cm: number, refCm = 0): { axisX: number; s2Len: number } {
  return { axisX: SLIT_X + Math.max(1, s1Cm - refCm), s2Len: s2Cm + refCm }
}

/** Everything that turns with the sensor arm. */
function sensorBodies(s2Len: number): Body[] {
  const c = COUNTER
  const cyl = (p: { x0: number; x1: number; r: number }): Body => ({ poly: rect(s2Len + p.x0, s2Len + p.x1, -p.r, p.r), deep: false })
  return [
    cyl(c.front), cyl(c.hex), cyl(c.band), cyl(c.body), cyl(c.stub),
    { poly: rect(s2Len + c.screw.x0, s2Len + c.screw.x1, c.screw.y0, c.screw.y1), deep: false },
    { poly: rect(ARM.left.x0, ARM.left.x1, -ARM.left.h, ARM.left.h), deep: true },
    { poly: rect(s2Len + ARM.right.dx0, s2Len + ARM.right.dx1, -ARM.right.h, ARM.right.h), deep: true },
    { poly: rect(ARM.left.x1, s2Len + ARM.right.dx0, ARM.rodY0, ARM.rodY1), deep: true },
    { poly: rect(ARM.left.x1, s2Len + ARM.right.dx0, -ARM.rodY1, -ARM.rodY0), deep: true },
  ] // prettier-ignore
}

/** The crystal holder on the target arm (target frame, origin on the axis): the crystal on top and the grey holder under it. The
 * stage disc, the brass block and the absorber strip sit at other z than the collimator and are 6 cm or more from the walls. */
const TARGET_BODIES: Body[] = [{ poly: rect(-1.7, 1.7, -2.4, 0), deep: false }]

/** Obstacles in world coordinates. `deep`: the whole chamber depth (walls, floor, ceiling); otherwise only at the collimator's z. */
function obstacles(): { name: string; poly: Poly; deep: boolean }[] {
  const { x0, x1, floor, ceil } = CHAMBER
  const big = 200
  const L = SLIT_X - (WALL_X + 1.3)
  const f = WALL_X + 1.3 // the collimator's wall face
  const g = CLEAR
  return [
    { name: 'wall', poly: rect(-big, x0 + g, -big, big), deep: true },
    { name: 'right', poly: rect(x1 - g, big, -big, big), deep: true },
    { name: 'floor', poly: rect(-big, big, -big, floor + g), deep: true },
    { name: 'ceiling', poly: rect(-big, big, ceil - g, big), deep: true },
    // the collimator, a lathe about y = BEAM_Y: base cylinder r 2.4, cone to r 1.15, then r 1 to the tip (convex pieces)
    { name: 'collimator', poly: rect(f, f + 0.5, BEAM_Y - 2.4 - g, BEAM_Y + 2.4 + g), deep: false },
    { name: 'collimator', poly: [[f + 0.5, BEAM_Y - 2.4 - g], [f + L - 1.7, BEAM_Y - 1.15 - g], [f + L - 1.7, BEAM_Y + 1.15 + g], [f + 0.5, BEAM_Y + 2.4 + g]], deep: false },
    { name: 'collimator', poly: rect(f + L - 1.7, SLIT_X + g, BEAM_Y - 1 - g, BEAM_Y + 1 + g), deep: false },
  ] // prettier-ignore
}

const place = (poly: Poly, ax: number, ay: number, deg: number): Poly => {
  const c = Math.cos((deg * Math.PI) / 180)
  const s = Math.sin((deg * Math.PI) / 180)
  return poly.map(([x, y]) => [ax + x * c - y * s, ay + x * s + y * c] as const)
}

/** Separating-axis test for two convex polygons (touching counts as free). */
function overlap(a: Poly, b: Poly): boolean {
  for (const p of [a, b]) {
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i]
      const [x1, y1] = p[(i + 1) % p.length]
      const nx = y1 - y0
      const ny = x0 - x1
      let aMin = Infinity
      let aMax = -Infinity
      let bMin = Infinity
      let bMax = -Infinity
      for (const [x, y] of a) {
        const d = x * nx + y * ny
        aMin = Math.min(aMin, d)
        aMax = Math.max(aMax, d)
      }
      for (const [x, y] of b) {
        const d = x * nx + y * ny
        bMin = Math.min(bMin, d)
        bMax = Math.max(bMax, d)
      }
      if (aMax <= bMin + 1e-9 || bMax <= aMin + 1e-9) return false
    }
  }
  return true
}

/** The first angle (0.1°) from 0 outward in `dir` (±1) at which a body meets an obstacle, or null up to `limit`. A rear
 * bracket or rod already overlapping an obstacle at 0° (a very short s₁ pushes it into the wall) does not count against that
 * obstacle: the arm is not trapped by something it started inside. The counter has no such grace: if it meets the wall at 0°
 * the arm cannot move. */
function firstHit(bodies: readonly Body[], at: (deg: number, poly: Poly) => Poly, limit: number, dir: 1 | -1): number | null {
  const obs = obstacles()
  const skip = new Set<string>()
  const hits = (deg: number, mark: boolean): boolean => {
    let hit = false
    bodies.forEach((b, i) => {
      const p = at(deg, b.poly)
      obs.forEach((o, j) => {
        if (b.deep === false || o.deep) {
          if (!skip.has(`${i}.${j}`) && overlap(p, o.poly)) {
            if (mark) {
              if (b.deep) skip.add(`${i}.${j}`) // only the rear brackets and rods get this grace
            }
            else hit = true
          }
        }
      })
    })
    return hit
  }
  hits(0, true)
  // 1° steps first (the parts are over a centimetre thick: no overlap can start and end within one), then 0.1° inside the hit step
  for (let c = 10; c < limit + 10; c += 10) {
    if (!hits((dir * Math.min(c, limit)) / 10, false)) continue
    let t = c - 9
    while (t < c && !hits((dir * t) / 10, false)) t++
    return t - 1
  }
  return null
}

export type ArmLimits = Readonly<{ sensorMin: number; sensorMax: number; targetMin: number; targetMax: number }> // 0.1°

/** The angles (0.1°) the arms reach before something blocks them, for the distances the student set. The sensor limits sit inside
 * −10 … +170°; the target limits inside one turn either way. Target collisions are only modelled for the crystal holder (the
 * Bragg set-up, `refCm` = 0): the absorber strip's windows pass the collimator by design. */
export function armLimits(s1Cm: number, s2Cm: number, refCm = 0): ArmLimits {
  const key = `${s1Cm}/${s2Cm}/${refCm}`
  let r = memo.get(key)
  if (!r) {
    r = compute(s1Cm, s2Cm, refCm)
    if (memo.size > 200) memo.clear()
    memo.set(key, r)
  }
  return r
}
const memo = new Map<string, ArmLimits>()

function compute(s1Cm: number, s2Cm: number, refCm: number): ArmLimits {
  const { axisX, s2Len } = armGeometry(s1Cm, s2Cm, refCm)
  const sensor = sensorBodies(s2Len)
  const sAt = (deg: number, p: Poly) => place(p, axisX, BEAM_Y, deg)
  const sUp = firstHit(sensor, sAt, SENSOR_RANGE[1], 1)
  const sDown = firstHit(sensor, sAt, -SENSOR_RANGE[0], -1)
  let tMax: number = TARGET_RANGE[1]
  let tMin: number = TARGET_RANGE[0]
  if (refCm === 0) {
    const tAt = (deg: number, p: Poly) => place(p, axisX, BEAM_Y, deg)
    const up = firstHit(TARGET_BODIES, tAt, TARGET_RANGE[1], 1)
    const down = firstHit(TARGET_BODIES, tAt, -TARGET_RANGE[0], -1)
    if (up !== null) tMax = up
    if (down !== null) tMin = -down || 0
  }
  return { sensorMin: sDown === null ? SENSOR_RANGE[0] : -sDown || 0, sensorMax: sUp === null ? SENSOR_RANGE[1] : sUp, targetMin: tMin, targetMax: tMax }
}

/** Does anything on the sensor arm touch the chamber at `sensorDeg`? (Used by the tests and the views' sanity checks.) */
export function sensorCollides(s1Cm: number, s2Cm: number, sensorDeg: number, refCm = 0): boolean {
  const { axisX, s2Len } = armGeometry(s1Cm, s2Cm, refCm)
  const obs = obstacles()
  return sensorBodies(s2Len).some((b) => obs.some((o) => (!b.deep || o.deep) && overlap(place(b.poly, axisX, BEAM_Y, sensorDeg), o.poly)))
}
