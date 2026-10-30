// The workbench: fixed home spots for every part, the table drop zone, and the camera fit over chamber + table.
import { describe, expect, test } from 'vitest'
import { EXPERIMENTS, partsFor } from '../src/apparatus/assembly'
import { fitPoints } from '../src/views/bench-assembly-geometry'
import { tableLayout, tableRect, tableSpots } from '../src/views/bench-table-layout'

describe('tableSpots', () => {
  for (const exp of EXPERIMENTS) {
    for (const portrait of [false, true]) {
      test(`${exp} (${portrait ? 'portrait' : 'landscape'}): every part has its own spot, none closer than the grid`, () => {
        const l = tableLayout(portrait)
        const parts = partsFor(exp)
        const spots = tableSpots(parts, l)
        expect(Object.keys(spots).sort()).toEqual([...parts].sort())
        const pts = parts.map((p) => spots[p]!)
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThanOrEqual(Math.min(l.dx, l.dz) - 1e-9)
        // in front of the housing (z > 17.5), the same input giving the same spots
        expect(pts.every((q) => q.z > 17.5)).toBe(true)
        expect(tableSpots(parts, l)).toEqual(spots)
      })
    }
  }
  test('a short last row is centred on the layout axis', () => {
    const l = { cols: 4, dx: 10, dz: 10, cx: 0, z0: 0, elev: 0.5 }
    const s = tableSpots(['collimator', 'counterCap', 'counter', 'zrFilter', 'counterCable', 'targetStage'], l)
    expect(s.counterCable!.x).toBeCloseTo(-5, 9)
    expect(s.targetStage!.x).toBeCloseTo(5, 9)
    expect(s.collimator!.x).toBeCloseTo(-15, 9)
  })
})

describe('tableRect', () => {
  test('covers every home spot and starts in front of the housing', () => {
    const l = tableLayout(false)
    const parts = partsFor('attenuation')
    const r = tableRect(parts.length, l)
    for (const p of parts) {
      const s = tableSpots(parts, l)[p]!
      expect(Math.abs(s.x - r.cx)).toBeLessThan(r.w / 2)
      expect(s.z).toBeGreaterThan(r.cz - r.d / 2)
      expect(s.z).toBeLessThan(r.cz + r.d / 2)
    }
  })
})

describe('fitPoints', () => {
  const target = { x: 0, y: 0, z: 0 }
  const dir = { x: 0, y: 0.5, z: 1 }
  const pts = [{ x: -20, y: 0, z: 0 }, { x: 20, y: 30, z: 10 }, { x: 0, y: -10, z: 40 }]
  test('a bigger free area needs a nearer camera, a larger margin a farther one', () => {
    const wide = fitPoints(pts, target, dir, 30, 1.6, 1, 1, 1)
    expect(fitPoints(pts, target, dir, 30, 1.6, 0.5, 0.5, 1)).toBeGreaterThan(wide)
    expect(fitPoints(pts, target, dir, 30, 1.6, 1, 1, 1.2)).toBeCloseTo(wide * 1.2, 9)
  })
  test('puts the extreme point exactly on the edge of the free area', () => {
    const d = fitPoints([{ x: 10, y: 0, z: 0 }], target, { x: 0, y: 0, z: 1 }, 40, 1.5, 1, 1, 1)
    expect(10 / (d * Math.tan((40 * Math.PI) / 360) * 1.5)).toBeCloseTo(1, 9)
  })
})
