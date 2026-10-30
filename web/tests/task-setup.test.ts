// Q1.7: the bench a task starts from, the setup checks of the Bragg tasks, the card's locks, and the
// retry of a failed table load. The card is driven through a stub root (the tests run without a DOM).
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { Apparatus, OK_S, SAFE_S } from '../src/apparatus/apparatus'
import { markExported } from '../src/pedagogy/csv'
import { setMode } from '../src/pedagogy/mode'
import { markCompleted } from '../src/pedagogy/progress'
import { crystalAllowed, crystalPicker } from '../src/views/setup'
import { mountLearn } from '../src/pedagogy/card'
import { applyInitial, lockedCrystal, setActiveTask } from '../src/pedagogy/task'
import { task as background } from '../src/pedagogy/tasks/background'
import { task as lif } from '../src/pedagogy/tasks/lif-kalpha-angle'
import { task as kalpha } from '../src/pedagogy/tasks/kalpha-third-order'
import { task as lambda3 } from '../src/pedagogy/tasks/lambda-three-orders'
import { task as threshold } from '../src/pedagogy/tasks/line-threshold'
import { task as moseley } from '../src/pedagogy/tasks/moseley-k-edges'
import { mulberry32 } from '../src/physics/detector'
import { task as attThickness } from '../src/pedagogy/tasks/attenuation-thickness'
import { loadAbsorbers, loadCrystals, retryableOnce } from '../src/physics/tables'
import type { Key } from '../src/apparatus/apparatus'

const SAFETY_S = SAFE_S + OK_S
beforeAll(async () => {
  markCompleted('bragg', 'lambda-three-orders') // Explore tasks start only once the experiment's lab tasks are done
  await loadAbsorbers()
  await loadCrystals()
})

/** Mount `setup` on the open-door bench and close the doors again. */
function mounted(a: Apparatus, set: Partial<Apparatus['setup']>) {
  a.setDoors(false)
  expect(a.mount({ ...a.setup, ...set })).toBe(true)
  a.setDoors(true)
}
function scan(a: Apparatus) {
  a.timeScale = Infinity
  a.press('SCAN')
  a.tick(SAFETY_S)
  a.tick(1e6)
}

describe('applyInitial mounts a known setup', () => {
  test('a leftover foil does not survive into the next task', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { sensorFilter: 'In', collimatorFilter: 'Ag' })
    applyInitial(a, background.initial, background.crystal)
    expect(a.setup.sensorFilter).toBeNull()
    expect(a.setup.collimatorFilter).toBeNull()
    expect(a.doorsClosed).toBe(true)
  })

  test('a task that names no holder keeps the wheel; one that names it mounts it', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { holder: 'materialWheel', sensorFilter: 'Zr' })
    applyInitial(a, background.initial, background.crystal)
    expect(a.setup).toMatchObject({ holder: 'materialWheel', sensorFilter: null })
    applyInitial(a, kalpha.initial, kalpha.crystal, kalpha.holder)
    expect(a.setup.holder).toBe('crystal')
  })

  test('a task with a free crystal picker keeps the crystal on the holder (Start over on LiF)', () => {
    const a = new Apparatus(mulberry32(1))
    mounted(a, { crystal: 'LiF' })
    applyInitial(a, moseley.initial, moseley.crystal, moseley.holder, moseley.crystalLocked !== false)
    expect(a.setup.crystal).toBe('LiF')
    applyInitial(a, kalpha.initial, kalpha.crystal, kalpha.holder, true)
    expect(a.setup.crystal).toBe('NaCl')
  })
})

describe('the Bragg tasks check the setup of the scan', () => {
  test('lambda-three-orders: a scan with the holder empty or on LiF does not count', () => {
    const run = (set: Partial<Apparatus['setup']>) => {
      const a = new Apparatus(mulberry32(1234))
      applyInitial(a, lambda3.initial)
      mounted(a, set)
      ;[a.limitLo, a.limitHi, a.dt] = [20, 250, 10]
      scan(a)
      markExported(a)
      return lambda3.success(a)
    }
    expect(run({})).toBe(true)
    expect(run({ holder: 'empty' })).toBe(false)
    expect(run({ crystal: 'LiF' })).toBe(false)
    expect(() => run({ sensorFilter: 'Zr' })).not.toThrow() // the scan's filter goes into the expected rate
  })

  test('line-threshold and kalpha-third-order need the NaCl crystal on the holder', () => {
    const a = new Apparatus(mulberry32(1234))
    applyInitial(a, threshold.initial)
    mounted(a, { holder: 'empty' })
    scan(a)
    expect(threshold.success(a)).toBe(false)
    const b = new Apparatus(mulberry32(1234))
    applyInitial(b, kalpha.initial)
    b.press('HV')
    b.tick(SAFETY_S + 0.1)
    b.moveArm(222)
    expect(kalpha.success(b)).toBe(true)
    const c = new Apparatus(mulberry32(1234))
    applyInitial(c, kalpha.initial)
    mounted(c, { holder: 'empty' })
    c.press('HV')
    c.tick(SAFETY_S + 0.1)
    c.moveArm(222)
    expect(kalpha.success(c)).toBe(false)
  })
})

describe('the task card', () => {
  const stubRoot = () => {
    const h: Record<string, (e: unknown) => void> = {}
    const root = { innerHTML: '', addEventListener: (k: string, f: (e: unknown) => void) => void (h[k] = f), querySelector: () => ({ disabled: false, focus() {} }) }
    const click = (data: Record<string, string>) => h.click({ target: { closest: () => ({ dataset: data }) } })
    return { root: root as unknown as HTMLElement, h, click }
  }
  vi.stubGlobal('location', { search: '' })

  test('starting keeps the exposure log; the locks hold until the act step succeeds', () => {
    const a = new Apparatus(mulberry32(1234))
    const clear = vi.spyOn(a, 'clearExposureLog')
    const focus: (Key[] | null)[] = []
    const { root, h, click } = stubRoot()
    const learn = mountLearn(root, a, { onMode() {}, onFocus: (k) => focus.push(k), onAct() {} })
    click({ task: 'kalpha-third-order' })
    expect(clear).not.toHaveBeenCalled()
    expect(lockedCrystal()).toBe('NaCl')
    expect(focus.at(-1)).toEqual(kalpha.controls)
    h.input({ target: { dataset: { predict: '' }, value: '22.2' } })
    click({ commit: '' })
    learn.sheetClosed() // mid-act: nothing is released
    expect(lockedCrystal()).toBe('NaCl')
    a.press('HV')
    a.tick(SAFETY_S + 0.1)
    a.moveArm(222)
    expect(learn.render()).toBe(true)
    expect(lockedCrystal()).toBeNull()
    expect(focus.at(-1)).toBeNull()
    click({ restart: '' })
    expect(clear).not.toHaveBeenCalled()
    expect(lockedCrystal()).toBe('NaCl') // a restart takes the locks up again
    learn.sheetClosed() // at predict: released
    expect(lockedCrystal()).toBeNull()
    setActiveTask(null)
  })
})

describe('Q1.8: the task lock and the act-step watermark', () => {
  const stubRoot = () => {
    const h: Record<string, (e: unknown) => void> = {}
    const root = { innerHTML: '', addEventListener: (k: string, f: (e: unknown) => void) => void (h[k] = f), querySelector: () => ({ disabled: false, focus() {} }) }
    return { root: root as unknown as HTMLElement, h, click: (data: Record<string, string>) => h.click({ target: { closest: () => ({ dataset: data }) } }) }
  }
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  const hooks = { onMode() {}, onFocus() {}, onAct() {} }

  test('crystalPicker: off only while the locked crystal is mounted; otherwise it offers the way back', () => {
    const all = ['NaCl', 'LiF', 'Si']
    expect(crystalPicker(null, 'Si', all)).toEqual({ disabled: false, ids: all })
    expect(crystalPicker('LiF', 'LiF', all)).toEqual({ disabled: true, ids: all })
    expect(crystalPicker('LiF', 'NaCl', all)).toEqual({ disabled: false, ids: ['NaCl', 'LiF'] })
    expect(crystalAllowed('LiF', 'NaCl')).toBe(false)
    expect(crystalAllowed('LiF', 'LiF')).toBe(true)
    expect(crystalAllowed(null, 'NaCl')).toBe(true)
  })

  test('a NaCl mounted while the sheet was closed at predict does not deadlock lif-kalpha-angle', () => {
    setMode('explore')
    const a = new Apparatus(mulberry32(1234))
    const { root, h, click } = stubRoot()
    const learn = mountLearn(root, a, hooks)
    click({ task: 'lif-kalpha-angle' })
    learn.sheetClosed() // step 0: the lock is released
    expect(lockedCrystal()).toBeNull()
    mounted(a, { crystal: 'NaCl' })
    h.input({ target: { dataset: { predict: '' }, value: '10.2' } })
    click({ commit: '' }) // the lock is back, with NaCl on the holder
    expect(lockedCrystal()).toBe('LiF')
    const picker = crystalPicker(lockedCrystal(), a.setup.crystal, ['NaCl', 'LiF'])
    expect(picker.disabled).toBe(false)
    expect(picker.ids).toContain('LiF')
    expect(crystalAllowed(lockedCrystal(), 'LiF')).toBe(true)
    mounted(a, { crystal: 'LiF' }) // what the picker's change handler does
    expect(a.setup.crystal).toBe('LiF')
    expect(crystalPicker(lockedCrystal(), a.setup.crystal, ['NaCl', 'LiF']).disabled).toBe(true)
    ;[a.limitLo, a.limitHi, a.dt] = [85, 125, 10]
    a.dBeta = 1
    scan(a)
    expect(lif.success(a)).toBe(true)
    expect(learn.render()).toBe(true)
    setActiveTask(null)
  })

  /** A 100 s exposure with the tube off, as the background task asks. */
  const background100 = (a: Apparatus) => {
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S + 101)
  }
  test('a restarted background task counts only the exposures taken since its act step opened', () => {
    setMode('explore') // the stub document takes the mode switches
    const a = new Apparatus(mulberry32(1234))
    const { root, click } = stubRoot()
    const learn = mountLearn(root, a, hooks)
    click({ task: 'background' })
    click({ choice: '1' })
    click({ commit: '' })
    background100(a)
    expect(a.exposureLog).toHaveLength(1)
    expect(learn.render()).toBe(true)
    click({ restart: '' })
    click({ choice: '1' })
    click({ commit: '' }) // act step again, with the old exposure in the log
    expect(background.success(a)).toBe(true) // the log alone would pass it ...
    expect(learn.render()).toBe(false) // ... the card does not
    expect((root as unknown as { innerHTML: string }).innerHTML).toContain('exposición anterior') // the act step says what it ignores
    background100(a)
    expect(a.exposureLog).toHaveLength(2)
    expect(learn.render()).toBe(true)
    setActiveTask(null)
    setMode('explore')
  })

  test('the thickness task counts only the new exposures too (progress and success take the watermark)', () => {
    const a = new Apparatus(mulberry32(1))
    applyInitial(a, attThickness.initial, attThickness.crystal, 'alWheel')
    expect(attThickness.progress!(a, a.exposureLog.length).every((x) => !x.done)).toBe(true)
  })

  test('starting a task while a measurement runs asks first; cancel keeps everything', () => {
    const a = new Apparatus(mulberry32(1234))
    applyInitial(a, background.initial)
    a.press('SCAN') // a 100 s background exposure
    a.tick(SAFETY_S + 1)
    expect(a.busy).toBe(true)
    const ask = vi.fn(() => false)
    vi.stubGlobal('window', { confirm: ask })
    const { root, click } = stubRoot()
    mountLearn(root, a, hooks)
    click({ task: 'kalpha-third-order' })
    expect(ask).toHaveBeenCalledOnce()
    expect(a.busy).toBe(true)
    expect(lockedCrystal()).toBeNull() // nothing was prepared
    vi.unstubAllGlobals()
    vi.stubGlobal('location', { search: '' })
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
  })

  test('after start(moseley) a foil mounts through the tray and a scan carries it', () => {
    const a = new Apparatus(mulberry32(1234))
    const { root, click } = stubRoot()
    mountLearn(root, a, hooks)
    click({ task: 'moseley-k-edges' })
    expect(lockedCrystal()).toBeNull() // the picker is free here
    a.setDoors(false)
    expect(a.mount({ ...a.setup, sensorFilter: 'Zr' })).toBe(true)
    a.setDoors(true)
    scan(a)
    expect(a.lastScan?.setup.sensorFilter).toBe('Zr')
    setActiveTask(null)
  })
})

describe('retryableOnce', () => {
  test('a rejected load is forgotten so a retry runs again; a success runs once', async () => {
    let calls = 0
    const load = retryableOnce(async () => {
      if (++calls === 1) throw new Error('offline')
    })
    await expect(load()).rejects.toThrow('offline')
    await load()
    await load()
    expect(calls).toBe(2)
  })
})
