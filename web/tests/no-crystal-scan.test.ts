// Without a crystal on the holder a scan is the direct beam (Gaussian in the sensor angle) times the wheel slot, never Bragg peaks.
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus, type Setup } from '../src/apparatus/apparatus'
import { D_NACL_PM, MO_KA_PM, MO_KB_PM } from '../src/physics/constants'
import { thetaFromLambda } from '../src/physics/crystal'
import { mulberry32 } from '../src/physics/detector'
import { DEFAULT, directRate } from '../src/physics/scan'
import { loadAbsorbers } from '../src/physics/tables'
import { scanD, showsBraggOverlays } from '../src/views/spectrum'

const setup = (holder: Setup['holder']): Setup => ({
  holder,
  crystal: 'NaCl',
  collimatorFilter: null,
  sensorFilter: null,
  detector: 'gm',
})

/** COUPLED instant scan 0° … 30° at 35 kV, 0.05 mA with the given holder mounted. */
function scan(holder: Setup['holder']) {
  const a = new Apparatus(mulberry32(7))
  a.setDoors(false)
  expect(a.mount(setup(holder))).toBe(true)
  a.setDoors(true)
  a.timeScale = Infinity
  a.press('ZERO')
  a.press('U')
  a.adjust(300)
  a.press('I')
  a.adjust(5)
  a.press('DT')
  a.adjust(9)
  a.press('COUPLED')
  a.press('LIMITS')
  a.adjust(0)
  a.press('LIMITS')
  a.adjust(300)
  a.press('SCAN')
  a.tick(0.016)
  a.tick(100)
  return a
}

const near = (a: Apparatus, deg: number) => a.replay.filter((p) => Math.abs(p.angle / 10 - deg) <= 0.5).map((p) => p.rate)

describe('scan consistent with the mounted holder', () => {
  beforeAll(loadAbsorbers)

  test.each(['empty', 'alWheel'] as const)('%s: direct-beam bump near 0°, background elsewhere, no Bragg peaks', (holder) => {
    const a = scan(holder)
    expect(a.replay.length).toBeGreaterThan(100)
    const bg = DEFAULT.background_per_s
    const lines = [1, 2, 3].flatMap((n) => [MO_KA_PM, MO_KB_PM].map((l) => thetaFromLambda(l, n, D_NACL_PM))).filter((t) => t <= 30)
    for (const th of lines) for (const r of near(a, th)) expect(r).toBeLessThan(bg * 3 + 5)
    const at0 = a.replay.find((p) => p.angle === 0)!.rate
    expect(at0).toBeGreaterThan(100 * bg)
    for (const p of a.replay.filter((q) => q.angle / 10 > 2 * 2)) expect(p.rate).toBeLessThan(bg * 3 + 5)
  })

  test('alWheel: the bump is scaled by the slot in the beam at the target angle (open slot at 0°)', () => {
    const a = scan('alWheel')
    const r0 = a.replay.find((p) => p.angle === 0)!.rate
    expect(Math.abs(r0 - directRate(35, 0.05, [], DEFAULT, 0)) / r0).toBeLessThan(0.1)
  })

  test('crystal still gives the Bragg spectrum', () => {
    const a = scan('crystal')
    const th = thetaFromLambda(MO_KA_PM, 1, D_NACL_PM)
    expect(Math.max(...near(a, th))).toBeGreaterThan(50 * DEFAULT.background_per_s)
  })

  test('Bragg overlays only with a crystal', () => {
    expect(showsBraggOverlays(setup('crystal'))).toBe(true)
    for (const h of ['empty', 'alWheel', 'materialWheel', 'sample'] as const) expect(showsBraggOverlays(setup(h))).toBe(false)
    expect(scanD(setup('empty'))).toBeCloseTo(D_NACL_PM, 6)
  })
})
