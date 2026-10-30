// The arms stall where the counter or the crystal holder would meet the experiment chamber (apparatus/collision.ts).
import { describe, expect, test } from 'vitest'
import { Apparatus, SAFE_S, OK_S } from '../src/apparatus/apparatus'
import { armGeometry, armLimits, sensorCollides } from '../src/apparatus/collision'
import { mulberry32 } from '../src/physics/detector'

const S2 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('armLimits', () => {
  test('the sensor limit never grows with s2 (a longer arm hits sooner)', () => {
    for (const s1 of [4, 5, 6, 8]) {
      let last = Infinity
      for (const s2 of S2) {
        const { sensorMax } = armLimits(s1, s2)
        expect(sensorMax).toBeLessThanOrEqual(last)
        last = sensorMax
      }
    }
  })

  test('default set-up (s1 = 5): the limit is below 170° for every s2 and the counter is free there but touches one step later', () => {
    for (const s2 of S2) {
      const { sensorMin, sensorMax } = armLimits(5, s2)
      expect(sensorMax).toBeLessThan(1700)
      expect(sensorMax).toBeGreaterThan(900) // 90° stays reachable (the energy detector, the specular range)
      expect(sensorCollides(5, s2, sensorMax / 10)).toBe(false)
      expect(sensorCollides(5, s2, (sensorMax + 1) / 10)).toBe(true)
      expect(sensorMin).toBe(-100) // floor and ceiling are far
      expect(sensorCollides(5, s2, sensorMin / 10)).toBe(false)
    }
  })

  test('the target arm is free at the default s1, and limited by the collimator at a very short s1', () => {
    expect(armLimits(5, 5)).toMatchObject({ targetMin: -3600, targetMax: 3600 })
    const short = armLimits(2, 5)
    expect(short.targetMax).toBeLessThan(3600)
    expect(short.targetMin).toBeGreaterThan(-3600)
  })

  test('the attenuation set-up measures to the absorber window: s1 and s2 shift by refCm and no target limit applies', () => {
    expect(armLimits(5, 5, 2.5).targetMax).toBe(3600)
    expect(armGeometry(5, 5, 2.5)).toEqual({ axisX: armGeometry(2.5, 7.5).axisX, s2Len: 7.5 })
  })
})

describe('Apparatus stalls at the limit', () => {
  const dev = () => {
    const a = new Apparatus(mulberry32(7))
    a.setGeometry({ s1Cm: 5, s2Cm: 5 })
    return a
  }
  const LIM = armLimits(5, 5)

  test('SENSOR by hand', () => {
    const a = dev()
    a.press('SENSOR')
    a.adjust(100_000)
    expect(a.sensor).toBe(LIM.sensorMax)
    a.adjust(-100_000)
    expect(a.sensor).toBe(LIM.sensorMin)
  })

  test('COUPLED by hand: both arms stall together at 2:1', () => {
    const a = dev()
    a.press('COUPLED')
    a.adjust(100_000)
    expect(a.target).toBe(Math.floor(LIM.sensorMax / 2))
    expect(a.sensor).toBe(2 * a.target)
    expect(a.sensor).toBeLessThanOrEqual(LIM.sensorMax)
  })

  test('a distance change re-clamps arms that now sit inside the wall', () => {
    const a = new Apparatus(mulberry32(7))
    a.press('SENSOR')
    a.adjust(1700)
    expect(a.sensor).toBe(1700) // no geometry: the plain range
    a.setGeometry({ s1Cm: 5, s2Cm: 12 })
    expect(a.sensor).toBe(armLimits(5, 12).sensorMax)
    a.setGeometry(null)
    expect(a.armRange('SENSOR')).toEqual([-100, 1700])
  })

  const scan = (a: Apparatus, mode: 'SENSOR' | 'COUPLED', hi: number) => {
    a.press(mode)
    a.press('LIMITS')
    a.press('LIMITS')
    a.adjust(hi) // the upper limit, from 0
    a.press('DBETA')
    a.adjust(99) // 10.0° steps
    a.press('DT')
    a.press('U')
    a.adjust(100)
    a.press('I')
    a.adjust(50)
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFE_S + OK_S + 1)
    a.tick(1)
  }

  test('a SENSOR auto-scan past the limit keeps trying but the arm stays stuck', () => {
    const a = dev()
    scan(a, 'SENSOR', 1700) // up to 170°
    expect(a.phase).toBe('idle')
    expect(a.replay.length).toBe(18) // every step of the programme ran
    expect(a.sensor).toBe(LIM.sensorMax)
  })

  test('a COUPLED auto-scan stalls both arms', () => {
    const a = dev()
    scan(a, 'COUPLED', 850) // target up to 85°
    expect(a.replay.length).toBe(9)
    expect(a.sensor).toBe(2 * a.target)
    expect(a.target).toBe(Math.floor(LIM.sensorMax / 2))
  })
})
