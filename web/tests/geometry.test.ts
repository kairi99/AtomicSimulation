// s1, s2 matter: the collimator and counter distances set the resolution and the intensity (port of braggsim.scan geometry).
import { describe, expect, test } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { mulberry32 } from '../src/physics/detector'
import { DEFAULT, angularSigmaDeg, crystalFactor, directBeamFactor, directRate, expectedRate } from '../src/physics/scan'

function running() {
  const a = new Apparatus(mulberry32(1234))
  a.press('U')
  a.adjust(150)
  a.press('I')
  a.adjust(100)
  a.press('HV')
  a.tick(SAFE_S + OK_S + 0.2)
  return a
}

describe('geometry in the physics port', () => {
  test('reference geometry is the fitted σ and factors of 1', () => {
    expect(angularSigmaDeg(5, 6)).toBe(DEFAULT.sigma_deg)
    expect(crystalFactor(6)).toBe(1)
    expect(directBeamFactor(5, 6)).toBe(1)
    expect(directBeamFactor(5, 5, 5, 5)).toBe(1)
  })

  test('closer counter: broader and taller than the reference; farther: sharper and lower', () => {
    const peak = (s1: number, s2: number) => Math.max(...expectedRate([7.24], 35, 1, DEFAULT, undefined, [], undefined, s1, s2))
    expect(angularSigmaDeg(5, 2)).toBeGreaterThan(angularSigmaDeg(5, 6))
    expect(angularSigmaDeg(5, 12)).toBeLessThan(angularSigmaDeg(5, 6))
    expect(peak(5, 2)).toBeGreaterThan(peak(5, 6))
    expect(peak(5, 6)).toBeGreaterThan(peak(5, 12))
    expect(directRate(21, 0.05, [], DEFAULT, 0, 2, 2)).toBeGreaterThan(directRate(21, 0.05))
  })

  test('nonsense distances throw', () => {
    expect(() => expectedRate([7.2], 35, 1, DEFAULT, undefined, [], undefined, 0, 6)).toThrow(RangeError)
    expect(() => directRate(21, 0.05, [], DEFAULT, 0, 5, -1)).toThrow(RangeError)
  })
})

describe('geometry on the Apparatus', () => {
  test('the reference distances give today’s rate (no geometry = reference); another s2 changes it', () => {
    const rate = (g: { s1Cm: number; s2Cm: number } | null) => {
      const a = running()
      a.setGeometry(g)
      a.press('ZERO')
      return a.specularRate()
    }
    expect(rate({ s1Cm: 5, s2Cm: 6 })).toBe(rate(null))
    expect(rate({ s1Cm: 5, s2Cm: 12 })).not.toBe(rate(null))
  })
})
