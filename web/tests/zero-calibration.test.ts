// Hidden goniometer zero offsets and the calibration key combo (LD P7.1.2.1): draw, physics mapping, calibration, per-crystal
// persistence, absorber-window robustness and the tasks that need a calibrated zero.
import { beforeAll, describe, expect, test } from 'vitest'
import {
  Apparatus, CALIBRATION_WINDOW_MS, OK_S, SAFE_S, WHEEL_WINDOW_DEG, ZERO_OFFSET_SENSOR_DEG, ZERO_OFFSET_TARGET_DEG, ZERO_TOLERANCE_TENTHS,
  drawZeroOffset, wheelSlot, zeroOk,
} from '../src/apparatus/apparatus'
import { markExported } from '../src/pedagogy/csv'
import { applyInitial } from '../src/pedagogy/task'
import { task as lambda3 } from '../src/pedagogy/tasks/lambda-three-orders'
import { MO_KA_PM } from '../src/physics/constants'
import { thetaFromLambda } from '../src/physics/crystal'
import { mulberry32 } from '../src/physics/detector'
import { loadCrystals } from '../src/physics/tables'

beforeAll(loadCrystals)
const TH1 = Math.round(10 * thetaFromLambda(MO_KA_PM)) // 72, 0.1°

function bench(seed: number | null) {
  const a = new Apparatus(mulberry32(7), undefined, seed)
  a.u = 350
  a.i = 100
  a.press('HV')
  a.tick(SAFE_S + OK_S + 0.1)
  expect(a.hvOn).toBe(true)
  return a
}
const best = (from: number, to: number, rate: (x: number) => number) => {
  let [bx, br] = [from, -Infinity]
  for (let x = from; x <= to; x++) if (rate(x) > br) [bx, br] = [x, rate(x)]
  return bx
}
/** What the student does: coupled maximum, then the target alone in TARGET, then the sensor alone in SENSOR (one pass, like the guide). */
function optimise(a: Apparatus) {
  a.press('COUPLED')
  const t = best(TH1 - 20, TH1 + 20, (x) => ((a.target = x), (a.sensor = 2 * x), a.expectedRate()))
  a.target = t
  a.sensor = 2 * t
  a.press('TARGET')
  a.target = best(t - 15, t + 15, (x) => ((a.target = x), a.expectedRate()))
  a.press('SENSOR')
  a.sensor = best(2 * t - 30, 2 * t + 30, (x) => ((a.sensor = x), a.expectedRate()))
}
function combo(a: Apparatus, keys: ('TARGET' | 'COUPLED' | 'LIMITS')[] = ['TARGET', 'COUPLED', 'LIMITS']) {
  let t = 1000
  a.nowMs = () => t
  for (const k of keys) {
    a.press(k)
    t += 300
  }
}
const mountCrystal = (a: Apparatus, crystal: string) => {
  a.setDoors(false)
  expect(a.mount({ holder: 'crystal', crystal, collimatorFilter: null, sensorFilter: null })).toBe(true)
  a.setDoors(true)
}

describe('offset draw', () => {
  test('magnitudes stay inside the named ranges, both signs occur, over many seeds', () => {
    const signs = new Set<number>()
    for (let seed = 0; seed < 500; seed++) {
      const z = drawZeroOffset(seed, 'NaCl')
      expect(Math.abs(z.target)).toBeGreaterThanOrEqual(10 * ZERO_OFFSET_TARGET_DEG[0] - 1e-9)
      expect(Math.abs(z.target)).toBeLessThanOrEqual(10 * ZERO_OFFSET_TARGET_DEG[1] + 1e-9)
      expect(Math.abs(z.sensor)).toBeGreaterThanOrEqual(10 * ZERO_OFFSET_SENSOR_DEG[0] - 1e-9)
      expect(Math.abs(z.sensor)).toBeLessThanOrEqual(10 * ZERO_OFFSET_SENSOR_DEG[1] + 1e-9)
      signs.add(Math.sign(z.target)).add(2 * Math.sign(z.sensor))
    }
    expect(signs.size).toBe(4)
  })
  test('deterministic in (seed, crystal); another seed or crystal differs', () => {
    expect(drawZeroOffset(42, 'NaCl')).toEqual(drawZeroOffset(42, 'NaCl'))
    expect(drawZeroOffset(42, 'NaCl')).not.toEqual(drawZeroOffset(43, 'NaCl'))
    expect(drawZeroOffset(42, 'NaCl')).not.toEqual(drawZeroOffset(42, 'LiF'))
  })
  test('no seed: a perfectly aligned goniometer (the default of tests and the teacher)', () => {
    const a = new Apparatus()
    expect(a.zeroOffset).toEqual({ target: 0, sensor: 0 })
    a.target = 72
    a.sensor = 144
    expect([a.trueTarget, a.trueSensor]).toEqual([72, 144])
  })
})

describe('physics sees the true angles', () => {
  test('uncalibrated, the rate at the displayed Kα angle is below the maximum; the panel reading is unchanged', () => {
    const seed = 5
    const a = bench(seed)
    const z = drawZeroOffset(seed, 'NaCl')
    a.press('COUPLED')
    a.target = TH1
    a.sensor = 2 * TH1
    expect(a.display().bottom).toBeDefined()
    const aligned = bench(null)
    aligned.press('COUPLED')
    aligned.target = TH1
    aligned.sensor = 2 * TH1
    expect(a.expectedRate()).toBeLessThan(0.9 * aligned.expectedRate())
    expect([a.target, a.sensor]).toEqual([TH1, 2 * TH1]) // the display shows what was set
    expect(a.trueTarget).toBeCloseTo(TH1 + z.target, 9)
  })
  test('the maximum search lands off the expected angle by roughly the hidden offsets', () => {
    const a = bench(11)
    const z = a.zeroOffset
    optimise(a)
    expect(Math.abs(a.target - (TH1 - z.target))).toBeLessThanOrEqual(1.5)
  })
})

describe('calibration combo', () => {
  test('TARGET + COUPLED + β LIMITS together store the zero: readings become the expected angles', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const a = bench(seed)
      optimise(a)
      combo(a)
      expect(a.calibrations, `seed ${seed}`).toBe(1)
      expect(a.alert).toBe('calibrated')
      expect([a.target, a.sensor]).toEqual([TH1, 2 * TH1])
      expect(a.zeroCalibrated, `seed ${seed}`).toBe(true)
      // the maximum is now where the panel says: the rate at the displayed Kα angle is within a few % of the aligned maximum
      const aligned = bench(null)
      aligned.press('COUPLED')
      aligned.target = TH1
      aligned.sensor = 2 * TH1
      expect(a.expectedRate()).toBeGreaterThan(0.9 * aligned.expectedRate())
    }
  })
  test('any order of the three keys works; a key outside the window does not', () => {
    const a = bench(3)
    optimise(a)
    combo(a, ['LIMITS', 'TARGET', 'COUPLED'])
    expect(a.calibrations).toBe(1)
    const b = bench(3)
    optimise(b)
    let t = 0
    b.nowMs = () => t
    b.press('TARGET')
    t += CALIBRATION_WINDOW_MS + 1
    b.press('COUPLED')
    b.press('LIMITS')
    expect(b.calibrations).toBe(0)
  })
  test('another key in between breaks the combo', () => {
    const a = bench(3)
    optimise(a)
    let t = 0
    a.nowMs = () => t
    for (const k of ['TARGET', 'COUPLED', 'U', 'LIMITS'] as const) (a.press(k), (t += 100))
    expect(a.calibrations).toBe(0)
  })
  test('refused far from the Kα maximum (alert calibFar), the offsets stay', () => {
    const a = bench(3)
    const z = a.zeroOffset
    a.press('COUPLED')
    a.target = 30
    a.sensor = 60
    combo(a)
    expect(a.calibrations).toBe(0)
    expect(a.alert).toBe('calibFar')
    expect(a.zeroOffset).toEqual(z)
  })
  test('refused with the energy detector or a program running', () => {
    const a = bench(3)
    optimise(a)
    a.press('SCAN') // mode is SENSOR: auto-scan starts its self-test
    expect(a.busy).toBe(true)
    expect(a.calibrate()).toBe(false)
  })
  test('the Shift+Z form (calibrate()) does the same as the combo', () => {
    const a = bench(9)
    optimise(a)
    expect(a.calibrate()).toBe(true)
    expect(a.zeroCalibrated).toBe(true)
  })
  test('ZERO moves to the stored zero and does not calibrate', () => {
    const a = bench(9)
    const z = a.zeroOffset
    a.press('ZERO')
    a.tick(60)
    expect([a.target, a.sensor]).toEqual([0, 0])
    expect(a.zeroOffset).toEqual(z)
  })
  test('RESET keeps the calibration; alignZero (teacher) zeroes every crystal', () => {
    const a = bench(9)
    optimise(a)
    a.calibrate()
    const z = a.zeroOffset
    a.press('RESET')
    expect(a.zeroOffset).toEqual(z)
    a.alignZero()
    expect(a.zeroOffset).toEqual({ target: 0, sensor: 0 })
  })
})

describe('per crystal', () => {
  test('swapping crystal draws that mount\'s own offset and restoring NaCl returns its calibrated state', () => {
    const a = bench(21)
    optimise(a)
    expect(a.calibrate()).toBe(true)
    a.press('HV') // HV off: the door may open
    const nacl = a.zeroOffset
    mountCrystal(a, 'LiF')
    const lif = a.zeroOffset
    expect(lif).toEqual(drawZeroOffset(21, 'LiF')) // fresh, uncalibrated
    expect(lif).not.toEqual(nacl)
    mountCrystal(a, 'NaCl')
    expect(a.zeroOffset).toEqual(nacl)
    expect(zeroOk(a.zeroOffset)).toBe(true)
  })
  test('the Kα angle used by the calibration follows the crystal (LiF)', () => {
    const a = bench(21)
    a.press('HV')
    a.tick(1)
    mountCrystal(a, 'LiF')
    a.press('HV')
    a.tick(SAFE_S + OK_S + 0.1)
    const th = Math.round(10 * thetaFromLambda(MO_KA_PM, 1, 201.35))
    a.press('COUPLED')
    a.target = th
    a.sensor = 2 * th
    expect(a.calibrate()).toBe(true) // true angles are within the reach of the LiF maximum
    expect([a.target, a.sensor]).toEqual([th, 2 * th])
  })
})

describe('absorber wheel window', () => {
  test('a 0.4° target error never changes the slot in the beam at the slot centres (window ±3°)', () => {
    expect(WHEEL_WINDOW_DEG).toBe(3)
    for (const holder of ['alWheel', 'materialWheel'] as const)
      for (let k = 0; k <= 6; k++)
        for (let seed = 0; seed < 200; seed++) {
          const off = drawZeroOffset(seed, 'NaCl').target
          expect(wheelSlot(holder, 100 * k + off)).toBeCloseTo(k, 9)
        }
  })
})

describe('tasks need a calibrated zero', () => {
  const run = (a: Apparatus) => {
    ;[a.limitLo, a.limitHi, a.dt] = [20, 250, 10]
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFE_S + OK_S)
    markExported(a)
  }
  test('lambda-three-orders: an uncalibrated scan does not count, a calibrated one does', () => {
    const a = new Apparatus(mulberry32(1234), undefined, 4)
    applyInitial(a, lambda3.initial)
    a.press('HV')
    a.tick(SAFE_S + OK_S + 0.1)
    a.u = 350
    a.i = 100
    optimise(a)
    a.press('HV') // off again; the scan switches it on itself
    expect(zeroOk(a.zeroOffset)).toBe(false)
    a.press('COUPLED')
    run(a)
    expect(lambda3.success(a)).toBe(false)
    expect(a.lastScan!.zero).toEqual(a.zeroOffset)
  })
  test('after calibrating (residual within tolerance) the same scan counts', () => {
    const a = new Apparatus(mulberry32(1234), undefined, 4)
    applyInitial(a, lambda3.initial)
    a.press('HV')
    a.tick(SAFE_S + OK_S + 0.1)
    optimise(a)
    expect(a.calibrate()).toBe(true)
    a.press('HV')
    a.press('COUPLED')
    run(a)
    expect(Math.abs(a.zeroOffset.target)).toBeLessThanOrEqual(ZERO_TOLERANCE_TENTHS.target)
    expect(lambda3.success(a)).toBe(true)
  })
  test('an aligned bench (teacher) counts without calibrating', () => {
    const a = new Apparatus(mulberry32(1234))
    applyInitial(a, lambda3.initial)
    run(a)
    expect(lambda3.success(a)).toBe(true)
  })
})
