// Pointer ray -> s₁ / s₂, finger-sized drop volumes and the view shift beside the HUD.
import { describe, expect, test } from 'vitest'
import { DISTANCE_RANGE_CM } from '../src/apparatus/assembly'
import { fitDistance, freeArea, hitSizeCm, pxPerCm, rayAtZ, s1FromRay, s2FromRay } from '../src/views/bench-assembly-geometry'

const cam = { x: 10, y: 20, z: 100 }
const toward = (x: number, y: number, z: number) => {
  const d = { x: x - cam.x, y: y - cam.y, z: z - cam.z }
  const n = Math.hypot(d.x, d.y, d.z)
  return { x: d.x / n, y: d.y / n, z: d.z / n }
}

describe('rayAtZ', () => {
  test('meets the plane where the ray was aimed', () => {
    const p = rayAtZ(cam, toward(14, 25, -9), -9)!
    expect(p.x).toBeCloseTo(14, 9)
    expect(p.y).toBeCloseTo(25, 9)
  })
  test('null when parallel or pointing away', () => {
    expect(rayAtZ(cam, { x: 1, y: 0, z: 0 }, 0)).toBeNull()
    expect(rayAtZ(cam, { x: 0, y: 0, z: 1 }, 0)).toBeNull()
  })
})

describe('s1FromRay', () => {
  test('x on the rod plane minus the slit, one decimal', () => {
    expect(s1FromRay(cam, toward(6 + 5.24, 20, -9), -9, 6)).toBe(5.2)
  })
  test('clamps to the slider range', () => {
    expect(s1FromRay(cam, toward(60, 20, -9), -9, 6)).toBe(DISTANCE_RANGE_CM.max)
    expect(s1FromRay(cam, toward(0, 20, -9), -9, 6)).toBe(DISTANCE_RANGE_CM.min)
  })
  test('grab offset keeps the part under the finger', () => {
    expect(s1FromRay(cam, toward(6 + 5.5, 20, -9), -9, 6, 0.5)).toBe(5)
  })
})

describe('s2FromRay', () => {
  const axis = { x: 11, y: 20 }
  test('along the horizontal arm', () => {
    expect(s2FromRay(cam, toward(17, 20, 0), 0, axis, 0)).toBe(6)
  })
  test('along an arm raised by 90°: only the vertical offset counts', () => {
    expect(s2FromRay(cam, toward(11, 26, 0), 0, axis, Math.PI / 2)).toBe(6)
    expect(s2FromRay(cam, toward(30, 20, 0), 0, axis, Math.PI / 2)).toBe(DISTANCE_RANGE_CM.min)
  })
})

describe('drop volumes and framing', () => {
  test('a volume is never under 48 px on screen', () => {
    const k = pxPerCm(800, 30, 60)
    const size = hitSizeCm(1, k)
    expect(size * k).toBeGreaterThanOrEqual(48 - 1e-9)
    expect(hitSizeCm(50, k)).toBe(50)
  })
  test('free area: side column shifts right, bottom sheet shifts up', () => {
    const side = freeArea(1440, 900, { left: 400, right: 0, top: 0, bottom: 0 })
    expect(side.dx).toBe(200)
    expect(side.fw).toBeCloseTo(1040 / 1440, 9)
    const sheet = freeArea(390, 844, { left: 0, right: 0, top: 0, bottom: 300 })
    expect(sheet.dy).toBe(-150)
    expect(sheet.fh).toBeCloseTo(544 / 844, 9)
  })
  test('a smaller free area needs a larger camera distance', () => {
    expect(fitDistance(32, 30, 30, 1.6, 0.7, 0.6, 1.1)).toBeGreaterThan(fitDistance(32, 30, 30, 1.6, 1, 1, 1.1))
  })
})
