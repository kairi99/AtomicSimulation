// Every golden case in artifacts/fixtures/ must be reproduced by the port: relative 1e-9 with a
// 1e-12/s absolute floor (web-physics-port rule). A failure means the port is wrong or the artifacts are stale.
import { beforeAll, describe, expect, test } from 'vitest'
import { lineProminenceSigma, strongestLineRatePerS, twoPointCalibration } from '../src/physics/analysis'
import { deadTime } from '../src/physics/detector'
import { ABSORBERS, transmission } from '../src/physics/filters'
import { DEFAULT, coupledBetas, directRate, expectedRate, modelParams, type ModelParams } from '../src/physics/scan'
import { MODEL_VERSION, loadAbsorbers, loadCrystals } from '../src/physics/tables'
import { crystalByName } from '../src/physics/crystal'

type Case = { description?: string; function?: string; inputs: Record<string, any>; expected: Record<string, any> }
type Fixture = Case & { name: string; function: string; model_version: string; cases?: Case[] }

beforeAll(async () => {
  await loadAbsorbers()
  await loadCrystals()
})

const baseFiles = import.meta.glob<Fixture>('../../artifacts/fixtures/*.json', { eager: true, import: 'default' })
const crystalFiles = import.meta.glob<Fixture>('../../artifacts/fixtures/crystals/*.json', { eager: true, import: 'default' })
const files = { ...baseFiles, ...crystalFiles }

function expectClose(actual: ArrayLike<number>, expected: number[]) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const err = Math.abs(actual[i] - expected[i])
    if (!(err <= 1e-9 * Math.abs(expected[i]) + 1e-12))
      expect.fail(`index ${i}: got ${actual[i]}, expected ${expected[i]} (rel ${err / Math.abs(expected[i])})`)
  }
}

function run(fn: string, c: Case) {
  const x = c.inputs
  switch (fn) {
    case 'scan.expected_rate': {
      const params: ModelParams = x.params ? modelParams(x.params) : DEFAULT
      const crystal = x.crystal ? crystalByName(x.crystal) : undefined
      const rate = expectedRate(x.beta_deg, x.U_kV, x.I_mA, params, x.sensor_deg, x.filters, crystal, x.s1_cm, x.s2_cm)
      expectClose(rate, c.expected.rate_per_s)
      // The live apparatus asks for one β at a time: it must give the batch values.
      const n = x.beta_deg.length
      for (const i of [0, 1, n >> 2, n >> 1, (3 * n) >> 2, n - 2, n - 1].filter((i) => i >= 0 && i < n)) {
        const one = expectedRate([x.beta_deg[i]], x.U_kV, x.I_mA, params, x.sensor_deg && [x.sensor_deg[i]], x.filters, crystal, x.s1_cm, x.s2_cm)
        expectClose(one, [c.expected.rate_per_s[i]])
      }
      return
    }
    case 'scan.direct_rate': {
      const params: ModelParams = x.params ? modelParams(x.params) : DEFAULT
      return expectClose([directRate(x.U_kV, x.I_mA, x.filters, params, x.sensor_deg, x.s1_cm, x.s2_cm)], [c.expected.rate_per_s])
    }
    case 'scan.coupled_betas':
      return expectClose(coupledBetas(x.lo_deg, x.hi_deg, x.step_deg), c.expected.beta_deg)
    case 'filters.transmission':
      return expectClose(
        x.lambda_pm.map((l: number) => transmission(l, x.material, x.areal_density_mg_cm2)),
        c.expected.transmission,
      )
    case 'analysis.line_prominence_sigma': {
      const params: ModelParams = modelParams(x.params)
      const crystal = crystalByName(x.crystal)
      const args = [x.beta_lo_deg, x.beta_hi_deg, x.U_kV, x.I_mA] as const
      expectClose([lineProminenceSigma(...args, x.dt_s, x.filters, crystal, params)], [c.expected.sigma])
      expectClose([strongestLineRatePerS(...args, x.filters, crystal, params)], [c.expected.strongest_rate_per_s])
      return
    }
    case 'analysis.two_point_calibration': {
      const r = twoPointCalibration(x.ch1, x.E1_keV, x.ch2, x.E2_keV)
      return expectClose([r.kevPerChannel, r.offsetKeV], [c.expected.kev_per_channel, c.expected.offset_keV])
    }
    case 'rejected': // Python raised ValueError: the port must throw too
      return expect(() => run(c.function!, { ...c, expected: {} }), c.description).toThrow(RangeError)
    default:
      expect.fail(`fixture for unknown function ${fn}`)
  }
}

describe('artifacts/fixtures', () => {
  test('fixtures exist and share the tables’ model version', () => {
    expect(Object.keys(crystalFiles).length).toBe(7)
    expect(Object.keys(files).length).toBeGreaterThan(10)
    for (const f of Object.values(files)) expect(f.model_version).toBe(MODEL_VERSION)
  })
  for (const f of Object.values(files)) {
    test(`${f.name}: ${f.description ?? ''}`, () => {
      for (const c of f.cases ?? [f]) run(f.function, c)
    })
  }
  test('tube off gives exactly the dead-time-corrected background', () => {
    for (const f of Object.values(files).filter((f) => f.name.startsWith('tube_off'))) {
      const p = modelParams(f.inputs.params)
      const bg = deadTime(p.background_per_s, p.tau_s)
      const rate = expectedRate(f.inputs.beta_deg, f.inputs.U_kV, f.inputs.I_mA, p)
      expect(Array.from(rate).every((r) => r === bg)).toBe(true)
    }
  })
})

test('params must be validated: unknown keys and hand-made objects are refused', () => {
  const p = { ...modelParams(files['../../artifacts/fixtures/leaflet_35kV_1mA.json'].inputs.params) }
  expect(() => modelParams({ ...p, bogus: 1 } as ModelParams)).toThrow(TypeError)
  expect(() => expectedRate([7.2], 35, 1, { ...p, sigma_deg: 0 })).toThrow(TypeError)
  expect(expectedRate([7.2], 35, 1, undefined, null)[0]).toBe(expectedRate([7.2], 35, 1)[0])
})

test('the port knows the same absorbers as the exported table', async () => {
  const { default: t } = await import('../../artifacts/tables/mu_rho_absorbers.json')
  expect(Object.keys(t.mu_rho_cm2_g).sort()).toEqual([...ABSORBERS].sort())
})
