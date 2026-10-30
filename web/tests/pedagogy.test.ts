// Guided tasks: their success conditions on real apparatus runs, the CSV export, and the lab-mode leak guard.
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus, ENERGY_SENSOR, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { clearExports, exportedScans, exposureCsv, markExported, replayCsv } from '../src/pedagogy/csv'
import { en } from '../src/pedagogy/i18n/en'
import { es } from '../src/pedagogy/i18n/es'
import { TASKS } from '../src/pedagogy/card'
import { applyInitial, lockedCrystal, setActiveTask, type GuidedTask } from '../src/pedagogy/task'
import { task as attMaterial } from '../src/pedagogy/tasks/attenuation-material'
import { task as attThickness } from '../src/pedagogy/tasks/attenuation-thickness'
import { task as background } from '../src/pedagogy/tasks/background'
import { task as kalpha } from '../src/pedagogy/tasks/kalpha-third-order'
import { task as lif } from '../src/pedagogy/tasks/lif-kalpha-angle'
import { task as lambda3 } from '../src/pedagogy/tasks/lambda-three-orders'
import { task as threshold } from '../src/pedagogy/tasks/line-threshold'
import { task as moseley } from '../src/pedagogy/tasks/moseley-k-edges'
import { mulberry32 } from '../src/physics/detector'
import { loadAbsorbers, loadCrystals, loadXrfSample } from '../src/physics/tables'
import { task as xrfBrass } from '../src/pedagogy/tasks/xrf-brass'
import { task as xrfCalibration } from '../src/pedagogy/tasks/xrf-calibration'
import { task as xrfCoin } from '../src/pedagogy/tasks/xrf-coin'
import { kevPerChannel } from '../src/physics/detector'

const SAFETY_S = SAFE_S + OK_S

function started(task: GuidedTask) {
  const a = new Apparatus(mulberry32(1234))
  applyInitial(a, task.initial)
  return a
}

/** The bench as the card prepares it (a non-NaCl crystal needs its table first). */
async function startedOn(task: GuidedTask) {
  if (task.crystal && task.crystal !== 'NaCl') await loadCrystals()
  const a = new Apparatus(mulberry32(1234))
  applyInitial(a, task.initial, task.crystal)
  return a
}

/** Run a whole auto-scan at once. */
function scan(a: Apparatus) {
  a.timeScale = Infinity
  a.press('SCAN')
  a.tick(SAFETY_S)
  expect(a.busy).toBe(false)
}

describe('crystal of a task', () => {
  test('every task declares its crystal; only the Moseley task leaves the picker free', () => {
    for (const t of TASKS) expect(t.crystal, t.id).toBeDefined()
    expect(TASKS.filter((t) => t.crystalLocked === false).map((t) => t.id)).toEqual(['moseley-k-edges', 'forge-kalpha-10deg', 'forge-si-222', 'forge-kcl-111', 'forge-doublet'])
    expect(lif.crystal).toBe('LiF')
  })

  test('the picker is locked to the active task\'s crystal, and free after it or in the Moseley task', () => {
    expect(lockedCrystal()).toBeNull()
    setActiveTask(kalpha)
    expect(lockedCrystal()).toBe('NaCl')
    setActiveTask(lif)
    expect(lockedCrystal()).toBe('LiF')
    setActiveTask(moseley)
    expect(lockedCrystal()).toBeNull()
    setActiveTask(null)
    expect(lockedCrystal()).toBeNull()
  })

  test('applyInitial puts the crystal on with the doors closed, and leaves them closed', async () => {
    const a = await startedOn(lif)
    expect(a.setup.crystal).toBe('LiF')
    expect(a.doorsClosed).toBe(true)
    expect(a.mount({ ...a.setup, crystal: 'NaCl' })).toBe(false) // the student still needs the doors open
    applyInitial(a, kalpha.initial, kalpha.crystal) // the next task starts on NaCl again
    expect(a.setup.crystal).toBe('NaCl')
  })

  test('a task started on an unsafe bench ends idle, HV off, doors closed, with its crystal and no replay', async () => {
    await loadCrystals()
    const dirty: [string, (a: Apparatus) => void][] = [
      ['HV on', (a) => { a.press('HV'); a.tick(SAFETY_S) }],
      ['self-test', (a) => a.press('HV')],
      ['positioning', (a) => { a.press('COUPLED'); a.adjust(300); a.press('SCAN') }],
      ['mid-scan', (a) => { a.press('COUPLED'); a.adjust(72); a.press('SCAN'); a.tick(SAFETY_S + 3) }],
    ]
    for (const [name, prepare] of dirty) {
      const a = new Apparatus(mulberry32(1))
      ;[a.u, a.i, a.dt, a.dBeta] = [210, 5, 4, 1]
      prepare(a)
      applyInitial(a, lif.initial, lif.crystal, lif.holder)
      expect(a.busy, name).toBe(false)
      expect(a.hvOn, name).toBe(false)
      expect(a.doorsClosed, name).toBe(true)
      expect(a.setup.crystal, name).toBe('LiF')
      expect(a.replay, name).toHaveLength(0)
    }
  })

  test('the Bragg tasks put the crystal holder back; the attenuation tasks leave their wheel', async () => {
    expect(TASKS.filter((t) => t.holder === 'crystal').map((t) => t.id).sort()).toEqual(
      ['forge-doublet', 'forge-kalpha-10deg', 'forge-kcl-111', 'forge-si-222', 'kalpha-third-order', 'lambda-three-orders', 'lif-kalpha-angle', 'line-threshold', 'moseley-k-edges'])
    expect(attThickness.holder).toBeUndefined()
    expect(attMaterial.holder).toBeUndefined()
    expect(background.holder).toBeUndefined()
    await loadAbsorbers()
    const a = new Apparatus(mulberry32(1))
    a.setDoors(false)
    a.mount({ ...a.setup, holder: 'alWheel' })
    a.setDoors(true)
    applyInitial(a, kalpha.initial, kalpha.crystal, kalpha.holder)
    expect(a.setup.holder).toBe('crystal')
    expect(a.doorsClosed).toBe(true)
  })

  test('the attenuation tasks keep the plate wheel the student mounted', async () => {
    await loadAbsorbers()
    const a = new Apparatus(mulberry32(1))
    a.setDoors(false)
    a.mount({ ...a.setup, holder: 'alWheel' })
    a.setDoors(true)
    applyInitial(a, attThickness.initial, attThickness.crystal)
    expect(a.setup.holder).toBe('alWheel')
  })
})

describe('lif-kalpha-angle', () => {
  /** A COUPLED scan on `crystal` from lo to hi (0.1°), Δβ 0.1°. */
  const run = async (crystal: string, lo: number, hi: number, dBeta = 1) => {
    const a = await startedOn(lif)
    a.setDoors(false)
    expect(a.mount({ ...a.setup, crystal })).toBe(true)
    a.setDoors(true)
    ;[a.dBeta, a.limitLo, a.limitHi] = [dBeta, lo, hi]
    scan(a)
    return a
  }

  test('no scan yet: not met', async () => expect(lif.success(await startedOn(lif))).toBe(false))
  test('LiF scan around θ = 10.17°: met', async () => expect(lif.success(await run('LiF', 90, 115))).toBe(true))
  test('a NaCl scan over the same angles: not met', async () => expect(lif.success(await run('NaCl', 90, 115))).toBe(false))
  test('the NaCl angle 7.24° on LiF: not met (the misconception)', async () => expect(lif.success(await run('LiF', 62, 82))).toBe(false))
  test('a window that stops short of the line: not met', async () => expect(lif.success(await run('LiF', 90, 103))).toBe(false))
  test('Δβ = 0.3° is too coarse', async () => expect(lif.success(await run('LiF', 90, 115, 3))).toBe(false))
})

describe('kalpha-third-order', () => {
  test.each([
    [222, true], // θ₃ = 22.21°
    [217, false], // 3 × 7.24°: the misconception
    [221, false],
  ])('crystal at %i × 0.1° with HV on: %s', (target, met) => {
    const a = started(kalpha)
    expect(kalpha.success(a)).toBe(false)
    a.press('HV')
    a.tick(SAFETY_S + 0.1) // and RESET's drive home
    a.moveArm(target) // COUPLED from zero: the sensor follows at 2β
    expect(a.sensor).toBe(2 * target)
    expect(kalpha.success(a)).toBe(met)
  })

  test('HV off: not met, even on the angle', () => {
    const a = started(kalpha)
    a.tick(0.1)
    a.moveArm(222)
    expect(kalpha.success(a)).toBe(false)
  })
})

describe('line-threshold', () => {
  test.each([
    [350, false], // lines on
    [190, true], // no lines, λmin = 65.3 pm < λ(Kα): continuum still at the Kα angle
    [170, false], // λmin = 72.9 pm > λ(Kα): nothing at all reaches the Kα angle
  ])('scan 5–9° at U = %i × 0.1 kV: %s', (u, met) => {
    const a = started(threshold)
    a.u = u
    scan(a)
    expect(threshold.success(a)).toBe(met)
  })

  test('no emission current: the scan waits, not met', () => {
    const a = started(threshold)
    ;[a.u, a.i, a.timeScale] = [190, 0, Infinity]
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(threshold.success(a)).toBe(false)
  })

  test('Δt = 1 s at 35 kV is not enough for 3rd-order Kβ', () => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi] = [20, 250]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })

  test('U lowered only mid-scan: not met', () => {
    const a = started(threshold)
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S + 3) // a few points counted at 35 kV
    expect(a.replay.length).toBeGreaterThan(0)
    a.u = 190
    a.tick(SAFETY_S)
    expect(a.busy).toBe(false)
    expect(threshold.success(a)).toBe(false)
  })

  test('scan still positioning: not met, no stored points needed', () => {
    const a = started(threshold)
    a.press('SCAN')
    a.tick(0.1)
    expect(a.replay).toHaveLength(0)
    expect(threshold.success(a)).toBe(false)
  })
})

describe('lambda-three-orders', () => {
  // Δt = 10 s as in the leaflet: at 1 s, 3rd-order Kβ stands only 4.6σ above its background.
  const leaflet = (lo: number) => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt] = [lo, 250, 10]
    scan(a)
    return a
  }

  test('2–25° at Δβ = 0.1°, Δt = 10 s: met only once the CSV is exported', () => {
    const a = leaflet(20)
    expect(lambda3.success(a)).toBe(false)
    markExported(a)
    expect(lambda3.success(a)).toBe(true)
  })

  test.each([60, 65])('%i × 0.1° to 25° cuts the window of 1st-order Kβ', (lo) => {
    const a = leaflet(lo)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })

  test.each([
    [2, true],
    [3, false], // coarser than braggsim.analysis.MAX_STEP_DEG
  ])('Δβ = %i × 0.1°: %s', (dBeta, met) => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt, a.dBeta] = [20, 250, 10, dBeta]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(met)
  })

  test('21 kV: 3rd-order lines too weak to find', () => {
    const a = started(lambda3)
    ;[a.limitLo, a.limitHi, a.dt, a.u] = [20, 250, 10, 210]
    scan(a)
    markExported(a)
    expect(lambda3.success(a)).toBe(false)
  })
})

test('replayCsv: header with the scan settings, one row per stored value', () => {
  const a = started(threshold)
  expect(replayCsv(a)).toBeNull()
  scan(a)
  const lines = replayCsv(a, new Date(0))!.trimEnd().split('\n')
  expect(lines.slice(0, 5)).toEqual([
    '# Bragg reflection, simulated LD X-ray apparatus 554 800 (not measured data)',
    '# 1970-01-01T00:00:00.000Z',
    '# setup: holder crystal (NaCl); collimator filter none; sensor filter none',
    '# mode COUPLED; at the start: U = 35.0 kV, I = 1.00 mA, dt = 1 s',
    'beta_deg,rate_per_s',
  ])
  expect(lines).toHaveLength(5 + 41) // 5.0 … 9.0° in 0.1° steps
  expect(lines[5]).toMatch(/^5\.0,\d+(\.\d+)?$/)
  expect(lines.at(-1)).toMatch(/^9\.0,/)
})

describe('moseley-k-edges', { timeout: 30_000 }, () => {
  beforeAll(loadAbsorbers)

  type Run = { u?: number; i?: number; dt?: number; dBeta?: number; lo?: number; hi?: number }
  /** One exported scan with `foil` mounted in the sensor slot (doors open to mount, then closed). */
  const exportScan = (a: Apparatus, foil: string | null, { u = 350, i = 100, dt = 5, dBeta = 1, lo = 37, hi = 75 }: Run = {}) => {
    a.setDoors(false)
    expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: foil })).toBe(true)
    a.setDoors(true)
    ;[a.u, a.i, a.dt, a.dBeta, a.limitLo, a.limitHi] = [u, i, dt, dBeta, lo, hi]
    scan(a)
    markExported(a)
  }
  const session = (run: Run = {}, foils: (string | null)[] = [null, 'Zr', 'Mo', 'Ag', 'In']) => {
    const a = started(moseley)
    for (const f of foils) exportScan(a, f, run)
    return a
  }

  test('open scan and four foils at the P5 settings: met', () => {
    expect(moseley.success(session())).toBe(true)
  })

  test('one foil missing: not met', () => {
    expect(moseley.success(session({}, [null, 'Zr', 'Mo', 'Ag']))).toBe(false)
    expect(moseley.success(session({}, ['Zr', 'Mo', 'Ag', 'In']))).toBe(false)
  })

  test('Δβ = 0.2° is too coarse', () => expect(moseley.success(session({ dBeta: 2 }))).toBe(false))
  test('a window that starts above the EPN 3.7° is refused', () => expect(moseley.success(session({ lo: 40 }))).toBe(false))

  test('one scan at another U: not met; repeating it at the common U: met', () => {
    const a = session({}, [null, 'Zr', 'Mo', 'Ag'])
    exportScan(a, 'In', { u: 300 })
    expect(moseley.success(a)).toBe(false)
    exportScan(a, 'In')
    expect(moseley.success(a)).toBe(true)
  })

  test('Δt = 1 s at 0.05 mA: the edges do not stand out; the same scans at 1 mA do', () => {
    expect(moseley.success(session({ dt: 1, i: 5 }))).toBe(false)
    expect(moseley.success(session({ dt: 1, i: 100 }))).toBe(true)
  })

  test('at 25 kV no continuum reaches the short-λ side of the Ag and In edges', () => {
    const a = session({ u: 250 })
    expect(moseley.success(a)).toBe(false)
    expect(moseley.progress!(a).filter((p) => p.done).map((p) => p.key)).toEqual(['open', 'Zr', 'Mo'])
  })

  test('a scan stopped early covers only the angles it stored', () => {
    const a = session({}, [null, 'Zr', 'Mo', 'Ag'])
    a.setDoors(false)
    a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: 'In' })
    a.setDoors(true)
    a.timeScale = 1
    a.press('SCAN')
    a.tick(SAFETY_S + 60) // a few points of 5 s, then STOP
    a.press('SCAN')
    expect(a.replay.length).toBeGreaterThan(0)
    expect(a.replay.at(-1)!.angle).toBeLessThan(75)
    markExported(a)
    expect(exportedScans(a).at(-1)!.last).toBe(a.replay.at(-1)!.angle)
    expect(moseley.success(a)).toBe(false)
  })

  test('a foil mounted before the export does not relabel the scan', () => {
    const a = started(moseley)
    exportScan(a, 'Zr')
    a.setDoors(false)
    a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: 'In' })
    expect(replayCsv(a)).toContain('sensor filter Zr')
    markExported(a)
    expect(exportedScans(a).at(-1)!.setup.sensorFilter).toBe('Zr')
  })

  test('CSV header names the filter; the record carries the step', () => {
    const a = started(moseley)
    exportScan(a, 'Ag')
    expect(replayCsv(a, new Date(0))).toContain('# setup: holder crystal (NaCl); collimator filter none; sensor filter Ag\n')
    expect(exportedScans(a)[0]).toMatchObject({ mode: 'COUPLED', first: 37, last: 75, step: 1, u: 350, i: 100, dt: 5, changed: false })
  })

  describe('LiF variant', () => {
    beforeAll(loadCrystals)
    const exportOn = (a: Apparatus, crystal: string, foil: string | null, lo: number, hi: number) => {
      a.setDoors(false)
      expect(a.mount({ holder: 'crystal', crystal, collimatorFilter: null, sensorFilter: foil })).toBe(true)
      a.setDoors(true)
      ;[a.u, a.i, a.dt, a.dBeta, a.limitLo, a.limitHi] = [350, 100, 5, 1, lo, hi]
      scan(a)
      markExported(a)
    }
    const FOILS = [null, 'Zr', 'Mo', 'Ag', 'In']
    const lifSession = (lo = 60, hi = 103, crystals = FOILS.map(() => 'LiF')) => {
      const a = started(moseley)
      FOILS.forEach((f, k) => exportOn(a, crystals[k], f, lo, hi))
      return a
    }

    test('five LiF scans over the LiF edges: met', () => expect(moseley.success(lifSession())).toBe(true))
    test('the NaCl window on LiF misses the Zr edge: not met', () => expect(moseley.success(lifSession(37, 75))).toBe(false))
    test('a LiF window that starts above the In edge: not met', () => expect(moseley.success(lifSession(64, 103))).toBe(false))
    test('a mixed NaCl/LiF group: not met', () => {
      const a = lifSession(37, 103, ['LiF', 'LiF', 'LiF', 'NaCl', 'NaCl']) // wide enough for both crystals
      expect(moseley.success(a)).toBe(false)
    })
    test('NaCl scans still pass on their own window', () => {
      const a = started(moseley)
      FOILS.forEach((f) => exportOn(a, 'NaCl', f, 37, 75))
      expect(moseley.success(a)).toBe(true)
    })
  })

  test('progress follows the exports; clearExports starts over', () => {
    const a = started(moseley)
    const done = () => moseley.progress!(a).filter((p) => p.done).map((p) => p.key)
    expect(done()).toEqual([])
    exportScan(a, null)
    exportScan(a, 'Zr')
    expect(done()).toEqual(['open', 'Zr'])
    expect(moseley.progress!(a).map((p) => p.key)).toEqual(['open', 'Zr', 'Mo', 'Ag', 'In'])
    clearExports(a)
    expect(done()).toEqual([])
  })
})

describe('attenuation tasks (EPN Práctica 1)', () => {
  beforeAll(loadAbsorbers)

  /** One exposure with TARGET at `deg`, Δβ = 0 (mount the plates first). */
  function expose(a: Apparatus, deg: number, dt: number, kV: number, mA: number) {
    a.press('TARGET')
    a.adjust(deg * 10 - a.target)
    for (const [k, v] of [['U', kV * 10 - a.u], ['I', mA * 100 - a.i], ['DBETA', -a.dBeta], ['DT', dt - a.dt]] as const) {
      a.press(k)
      a.adjust(v)
    }
    a.press('SCAN')
    a.tick(SAFETY_S + dt + 1)
    expect(a.phase).toBe('idle')
  }
  const mounted = (task: GuidedTask, holder: 'alWheel' | 'materialWheel') => {
    const a = started(task)
    a.setDoors(false)
    a.mount({ holder, crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    return a
  }
  const done = (task: GuidedTask, a: Apparatus) => task.progress!(a).filter((p) => p.done).length

  describe('attenuation-thickness', () => {
    test('all seven slots at 21 kV, 0.05 mA, 30 s: met', () => {
      const a = mounted(attThickness, 'alWheel')
      for (let k = 0; k <= 5; k++) expose(a, 10 * k, 30, 21, 0.05)
      expect(attThickness.success(a)).toBe(false) // slot 6 missing
      expect(done(attThickness, a)).toBe(6)
      expose(a, 60, 30, 21, 0.05)
      expect(attThickness.success(a)).toBe(true)
      expect(done(attThickness, a)).toBe(7)
    })

    test('Δt = 1 s: beam hardening is not resolvable', () => {
      const a = mounted(attThickness, 'alWheel')
      for (let k = 0; k <= 6; k++) expose(a, 10 * k, 1, 21, 0.05)
      expect(attThickness.success(a)).toBe(false)
      expect(done(attThickness, a)).toBe(7)
    })

    test('a slot taken at another current: not met until repeated at the common one', () => {
      const a = mounted(attThickness, 'alWheel')
      for (let k = 0; k <= 5; k++) expose(a, 10 * k, 30, 21, 0.05)
      expose(a, 60, 30, 21, 0.1)
      expect(attThickness.success(a)).toBe(false)
      expose(a, 60, 30, 21, 0.05)
      expect(attThickness.success(a)).toBe(true)
    })

    test('a current that saturates the counter: not met', () => {
      const a = mounted(attThickness, 'alWheel')
      for (let k = 0; k <= 6; k++) expose(a, 10 * k, 30, 21, 0.5)
      expect(attThickness.success(a)).toBe(false)
    })

    test('the frame between slots is no slot', () => {
      const a = mounted(attThickness, 'alWheel')
      for (let k = 0; k <= 5; k++) expose(a, 10 * k, 30, 21, 0.05)
      expose(a, 65, 30, 21, 0.05)
      expect(attThickness.success(a)).toBe(false)
    })
  })

  describe('attenuation-material', () => {
    test('0.01 mA for the light slots and the open beam, 0.02/1 mA for the rest: met', () => {
      const a = mounted(attMaterial, 'materialWheel')
      expose(a, 10, 30, 30, 0.01) // polystyrene: the first exposure right after mounting is not at 0° (it once logged the open slot)
      expose(a, 20, 30, 30, 0.02) // Al
      for (let k = 3; k <= 6; k++) expose(a, 10 * k, 30, 30, 1)
      expose(a, 0, 30, 30, 1) // open beam, saturated
      expect(attMaterial.success(a)).toBe(false)
      expect(done(attMaterial, a)).toBe(6)
      expose(a, 0, 30, 30, 0.05) // 0.05 mA saturates the open beam (0.02 mA, the guide's setting, does not)
      expect(attMaterial.success(a)).toBe(false)
      expose(a, 0, 30, 30, 0.01)
      expect(attMaterial.success(a)).toBe(true)
    })

    test('a heavy plate at 0.02 mA and 1 s stays in the background: not met', () => {
      const a = mounted(attMaterial, 'materialWheel')
      expose(a, 10, 30, 30, 0.01)
      expose(a, 20, 30, 30, 0.02)
      for (let k = 3; k <= 6; k++) expose(a, 10 * k, 1, 30, 0.02)
      expose(a, 0, 30, 30, 0.01) // open
      expect(attMaterial.success(a)).toBe(false)
      expect(done(attMaterial, a)).toBe(3)
    })

    test('a filter mounted for one slot: not met (one common set of filters)', () => {
      const a = mounted(attMaterial, 'materialWheel')
      expose(a, 10, 30, 30, 0.01)
      expose(a, 20, 30, 30, 0.02)
      for (let k = 3; k <= 5; k++) expose(a, 10 * k, 30, 30, 1)
      expose(a, 0, 30, 30, 0.01) // open
      a.setDoors(false)
      a.mount({ holder: 'materialWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: 'Zr' })
      a.setDoors(true)
      expose(a, 60, 30, 30, 1)
      expect(attMaterial.success(a)).toBe(false)
    })

    test('another U: not met', () => {
      const a = mounted(attMaterial, 'materialWheel')
      for (let k = 0; k <= 6; k++) expose(a, 10 * k, 30, 25, 0.01)
      expect(attMaterial.success(a)).toBe(false)
    })
  })

  describe('background', () => {
    const run = (dt: number, kV: number, mA: number) => {
      const a = started(background)
      expose(a, 0, dt, kV, mA)
      return a
    }
    test('100 s at 0 kV: met; 50 s: not', () => {
      expect(background.success(run(50, 0, 0))).toBe(false)
      expect(background.success(run(100, 0, 0))).toBe(true)
    })
    test('100 s with the tube on: not met; with 0 mA: met', () => {
      expect(background.success(run(100, 21, 0.05))).toBe(false)
      expect(background.success(run(100, 21, 0))).toBe(true)
    })
  })
})

test('lab tasks never state an expected angle or wavelength (teacher notes aside)', () => {
  const LEAKS = ['7.2', '14.6', '22.2', '71', '63', '6.4', '12.9', '19.6']
  for (const dict of [es, en]) {
    for (const t of [lambda3]) {
      const { teacher: _, ...student } = dict.task[t.id as keyof typeof dict.task]
      const text = JSON.stringify(student)
      for (const leak of LEAKS) expect(text, `${t.id}: "${leak}"`).not.toContain(leak)
    }
    // Moseley: the edge angles (≈ 7.02°, 6.31°, 4.94°, 4.51°), λ_K (≈ 68.9, 62.0, 48.6, 44.4 pm) and edge keV.
    const { teacher: _, ...student } = dict.task[moseley.id as keyof typeof dict.task]
    const text = JSON.stringify(student)
    for (const leak of ['7.0', '6.3', '4.9', '4.5', '68', '62.0', '48', '44', '17.9', '25.5', '27.9'])
      expect(text, `${moseley.id}: "${leak}"`).not.toContain(leak)
    // The LiF variant's edges (6.3, 6.9, 8.9, 9.8°) and windows (6.0–10.2°, 5.2–10.5°) stay in the teacher note: the
    // student text names the crystal and its d (201.35 pm), never an angle of LiF.
    for (const leak of ['6.9', '8.9', '9.8', '10.2', '6.0°', '5.2', '10.5'])
      expect(text, `${moseley.id}: "${leak}"`).not.toContain(leak)
    // XRF: the calibration channels and channel width stay in the teacher note; the coin task never names Fe before the observation.
    for (const t of [xrfCalibration, xrfBrass, xrfCoin]) {
      const { teacher: _x, explain: _y, ...st } = dict.task[t.id as keyof typeof dict.task]
      const txt = JSON.stringify(st)
      for (const leak of ['103', '135', '0.078']) expect(txt, `${t.id}: "${leak}"`).not.toContain(leak)
    }
    expect((dict.task['xrf-coin'] as { actHelp: string }).actHelp).not.toContain('Fe')
    // Attenuation: T, μ/ρ and rates are in the teacher notes only; the observation does not give the answer.
    for (const t of [attThickness, attMaterial, background]) {
      const { teacher: _t, explain: _e, ...student } = dict.task[t.id as keyof typeof dict.task]
      const text = JSON.stringify(student)
      for (const leak of ['0.98', '0.62', '6.9', '5.4', '5.11', '6.1', '3.3', '4.8', '17.5', '18.0', '19.6', '6.4', '5.3', '5.7', '6.5', '2400', '1400'])
        for (const v of [leak, leak.replace('.', ',')]) expect(text, `${t.id}: "${v}"`).not.toContain(v)
      expect(text, t.id).not.toMatch(/\b0[.,]2\b/)
    }
  }
})

describe('exposureCsv', () => {
  beforeAll(loadAbsorbers)

  test('header, one row per exposure, null when the log is empty', () => {
    const a = new Apparatus(mulberry32(1234))
    expect(exposureCsv(a)).toBeNull()
    a.setDoors(false)
    a.mount({ holder: 'alWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: 'Zr' })
    a.setDoors(true)
    a.timeScale = Infinity
    a.press('TARGET')
    a.adjust(200)
    ;[a.u, a.i, a.dt, a.dBeta] = [210, 5, 4, 0]
    a.press('SCAN')
    a.tick(SAFETY_S)
    a.adjust(0)
    a.press('TARGET')
    a.adjust(-150) // 5°: the frame blocks the beam
    a.press('SCAN')
    a.tick(SAFETY_S)
    const lines = exposureCsv(a, new Date(0))!.trimEnd().split('\n')
    expect(lines.slice(0, 2)).toEqual([
      '# Exposure series, simulated LD X-ray apparatus 554 800 (not measured data)',
      '# 1970-01-01T00:00:00.000Z',
    ])
    expect(lines[3]).toBe('# rate_per_s is the mean rate over dt, as REPLAY shows it (counts / dt); set is the absorber set on the holder (I = Al, II = materials); thickness_mm and areal_density_mg_cm2 are those of the absorber in the beam')
    expect(lines[4]).toBe('target_deg,sensor_deg,mode,holder,set,crystal,slot,absorber,thickness_mm,areal_density_mg_cm2,collimator_filter,sensor_filter,U_kV,I_mA,dt_s,changed,counts,rate_per_s')
    expect(lines).toHaveLength(5 + 2)
    expect(lines[5]).toMatch(/^20\.0,0\.0,TARGET,alWheel,I,,2,Al,1,269\.89,,Zr,21\.0,0\.05,4,0,\d+,\d+(\.\d+)?$/)
    expect(lines[6]).toMatch(/^5\.0,0\.0,TARGET,alWheel,I,,,frame,,,,Zr,21\.0,0\.05,4,0,\d+,\d+(\.\d+)?$/)
  })

  test('open slot, no plate, and a COUPLED crystal exposure with both angles', () => {
    const a = new Apparatus(mulberry32(1))
    a.setDoors(false)
    a.mount({ holder: 'alWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    a.timeScale = Infinity
    ;[a.u, a.i, a.dt, a.dBeta] = [210, 5, 4, 0]
    a.press('SCAN')
    a.tick(SAFETY_S)
    a.setDoors(false)
    a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    a.press('COUPLED')
    a.adjust(72)
    a.press('SCAN')
    a.tick(SAFETY_S)
    const lines = exposureCsv(a, new Date(0))!.trimEnd().split('\n')
    expect(lines[5]).toMatch(/^0\.0,0\.0,,alWheel,I,,0,none,0,0,,,21\.0,/)
    expect(lines[6]).toMatch(/^7\.2,14\.4,COUPLED,crystal,,NaCl,,,,,,,21\.0,0\.05,4,0,/)
    expect(lines.join('\n')).not.toContain('# crystal:')
  })

  test('the material set (II) reports its own thickness and the collimator Zr filter is named', () => {
    const a = new Apparatus(mulberry32(5))
    a.setDoors(false)
    a.mount({ holder: 'materialWheel', crystal: 'NaCl', collimatorFilter: 'Zr', sensorFilter: null })
    a.setDoors(true)
    a.timeScale = Infinity
    a.press('TARGET')
    a.adjust(300) // 30°: slot 3, Fe
    ;[a.u, a.i, a.dt, a.dBeta] = [300, 100, 4, 0]
    a.press('SCAN')
    a.tick(SAFETY_S)
    const lines = exposureCsv(a, new Date(0))!.trimEnd().split('\n')
    const head = lines[4].split(',')
    const row = lines[5].split(',')
    const col = (n: string) => row[head.indexOf(n)]
    expect(col('set')).toBe('II')
    expect(col('slot')).toBe('3')
    expect(col('absorber')).toBe('Fe')
    expect(col('thickness_mm')).toBe('0.5')
    expect(col('areal_density_mg_cm2')).toBe('393.7')
    expect(col('collimator_filter')).toBe('Zr')
    expect(col('sensor_filter')).toBe('')
    expect(row).toHaveLength(head.length)
  })
})

describe('XRF tasks (EPN Práctica 6)', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    for (const n of ['Cu', 'Zn', 'Pb', 'CuZn39Pb3', 'centavo2003']) await loadXrfSample(n)
  })

  type Run = { target?: number; hv?: boolean; preset?: number; u?: number; midChange?: boolean }
  /** The guide's bench (sensor to 90°, energy detector, target) and one finished MCA run of `sample`. */
  const bench = () => {
    const a = new Apparatus(mulberry32(7))
    a.press('SENSOR')
    a.adjust(ENERGY_SENSOR)
    return a
  }
  function measure(a: Apparatus, sample: string, { target = 450, hv = true, preset = 180, u = 350, midChange = false }: Run = {}) {
    if (a.hvOn) a.press('HV')
    a.setDoors(false)
    expect(a.mount({ holder: 'sample', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'energy', sample })).toBe(true)
    a.setDoors(true)
    a.press('TARGET')
    a.adjust(target - a.target)
    a.press('U')
    a.adjust(u - a.u)
    a.press('I')
    a.adjust(100 - a.i)
    if (hv) {
      a.press('HV')
      a.tick(SAFETY_S + 0.1)
    }
    a.mca.set({ presetS: preset })
    a.mca.clear()
    a.mca.start()
    if (midChange) {
      a.tick(3)
      a.press('U')
      a.adjust(-10)
    }
    a.timeScale = Infinity
    a.tick(1)
    a.timeScale = 1
    expect(a.mca.running).toBe(false)
  }
  /** The two-point calibration of the guide (or `Pb` energy off by `dE` keV). */
  const calibrate = (a: Apparatus, ePb = 10.56, e1 = 8.04) => {
    const w = kevPerChannel(a.mca.settings.nChannels, a.mca.settings.gain)
    const [c1, c2] = [8.041 / w, 10.541 / w]
    const m = (ePb - e1) / (c2 - c1)
    a.mca.calibration = { kevPerChannel: m, offsetKeV: e1 - m * c1 }
  }

  test('the XRF tasks are in the list, in lab mode, and keep the detector where the bench is prepared', () => {
    expect(TASKS.map((t) => t.id).slice(-7, -4)).toEqual(['xrf-calibration', 'xrf-brass', 'xrf-coin'])
    expect([xrfCalibration.keepDetector, xrfBrass.keepDetector, xrfCoin.keepDetector]).toEqual([undefined, true, true])
    for (const t of [xrfCalibration, xrfBrass, xrfCoin]) expect(t.mode).toBe('lab')
  })

  test('xrf-calibration: Cu and Pb runs at 45° and a calibration within one channel', () => {
    const a = bench()
    expect(xrfCalibration.success(a)).toBe(false)
    measure(a, 'Cu')
    expect(xrfCalibration.progress!(a).map((p) => p.done)).toEqual([true, false, false])
    measure(a, 'Pb')
    expect(xrfCalibration.success(a)).toBe(false) // no calibration yet
    calibrate(a, 10.56)
    expect(xrfCalibration.success(a)).toBe(true)
    expect(xrfCalibration.progress!(a).every((p) => p.done)).toBe(true)
    calibrate(a, 10.56 + 0.2) // Pb Lα off by more than a 0.078 keV channel
    expect(xrfCalibration.success(a)).toBe(false)
  })

  test('xrf-calibration: fails with target off 45°, a changed run, HV off or a missing Pb', () => {
    for (const bad of [{ target: 440 }, { midChange: true }, { hv: false }] as Run[]) {
      const a = bench()
      measure(a, 'Cu')
      measure(a, 'Pb', bad)
      calibrate(a)
      expect(xrfCalibration.success(a), JSON.stringify(bad)).toBe(false)
    }
    const a = bench()
    measure(a, 'Cu')
    calibrate(a)
    expect(xrfCalibration.success(a)).toBe(false)
  })

  test('xrf-calibration and xrf-coin: runs before `from` do not count', () => {
    const a = bench()
    measure(a, 'Cu')
    measure(a, 'Pb')
    calibrate(a)
    expect(xrfCalibration.success(a, 0)).toBe(true)
    expect(xrfCalibration.success(a, a.mcaLog.length)).toBe(false)
    measure(a, 'centavo2003')
    expect(xrfCoin.success(a, 2)).toBe(true)
    expect(xrfCoin.success(a, 3)).toBe(false)
  })

  test('xrf-brass: earlier standards count, an earlier brass does not', () => {
    const a = bench()
    for (const s of ['Cu', 'Zn', 'Pb']) measure(a, s)
    const from = a.mcaLog.length
    measure(a, 'CuZn39Pb3')
    expect(xrfBrass.success(a, from)).toBe(true)
    expect(xrfBrass.success(a, from + 1)).toBe(false)
    expect(xrfBrass.progress!(a, from + 1).map((p) => p.done)).toEqual([true, true, true, false])
    const b = bench()
    measure(b, 'CuZn39Pb3')
    const f = b.mcaLog.length
    for (const s of ['Cu', 'Zn', 'Pb']) measure(b, s)
    expect(xrfBrass.success(b, f)).toBe(false)
  })

  test('xrf-calibration: changing channels or gain wipes the calibration and the old runs stop counting', () => {
    const a = bench()
    measure(a, 'Cu')
    measure(a, 'Pb')
    calibrate(a)
    a.mca.set({ gain: -3 })
    expect(xrfCalibration.success(a)).toBe(false)
  })

  test('xrf-brass: three standards and the brass at one beam', () => {
    const a = bench()
    for (const s of ['Cu', 'Zn', 'Pb']) measure(a, s)
    expect(xrfBrass.success(a)).toBe(false)
    measure(a, 'CuZn39Pb3')
    expect(xrfBrass.success(a)).toBe(true)
    expect(xrfBrass.progress!(a).every((p) => p.done)).toBe(true)
  })

  test('xrf-brass: fails with a missing standard, a 60 s brass, target off 45°, a changed run, HV off or another beam', () => {
    const cases: [string, (a: Apparatus) => void][] = [
      ['missing Zn', (a) => { for (const s of ['Cu', 'Pb', 'CuZn39Pb3']) measure(a, s) }],
      ['brass 60 s', (a) => { for (const s of ['Cu', 'Zn', 'Pb']) measure(a, s); measure(a, 'CuZn39Pb3', { preset: 60 }) }],
      ['Zn at 44°', (a) => { measure(a, 'Cu'); measure(a, 'Zn', { target: 440 }); measure(a, 'Pb'); measure(a, 'CuZn39Pb3') }],
      ['changed Pb', (a) => { measure(a, 'Cu'); measure(a, 'Zn'); measure(a, 'Pb', { midChange: true }); measure(a, 'CuZn39Pb3') }],
      ['Cu without HV', (a) => { measure(a, 'Cu', { hv: false }); measure(a, 'Zn'); measure(a, 'Pb'); measure(a, 'CuZn39Pb3') }],
      ['brass at 30 kV', (a) => { for (const s of ['Cu', 'Zn', 'Pb']) measure(a, s); measure(a, 'CuZn39Pb3', { u: 300 }) }],
    ]
    for (const [name, run] of cases) {
      const a = bench()
      run(a)
      expect(xrfBrass.success(a), name).toBe(false)
    }
  })

  test('xrf-coin: the coin at 45° shows Cu and Fe; fails off 45°, changed, HV off or another sample', () => {
    const a = bench()
    measure(a, 'centavo2003')
    expect(xrfCoin.success(a)).toBe(true)
    for (const [name, run] of [['target', { target: 440 }], ['changed', { midChange: true }], ['no HV', { hv: false }]] as [string, Run][]) {
      const b = bench()
      measure(b, 'centavo2003', run)
      expect(xrfCoin.success(b), name).toBe(false)
    }
    const c = bench()
    measure(c, 'Cu')
    expect(xrfCoin.success(c)).toBe(false)
  })
})
