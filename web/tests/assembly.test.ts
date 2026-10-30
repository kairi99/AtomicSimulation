import { describe, expect, test } from 'vitest'
import { Assembly, EXPERIMENTS, partsFor, sameSetup, stepsFor, zonesOf, type Part, type Zone } from '../src/apparatus/assembly'

const ok = { ok: true }
function run(a: Assembly) {
  for (let s = a.current(); s && s.id !== 'door'; s = a.current()) {
    if (s.part) expect(a.place(s.part, s.zone!)).toEqual(ok)
    else {
      expect(a.setDistance(s.distance!.which, s.distance!.targetCm)).toBe(true)
      expect(a.commitDistance(s.distance!.which)).toBe(true)
    }
  }
}
/** Up to and including the door, then the ZERO key. */
function finish(a: Assembly) {
  run(a)
  a.setDoor(true)
  expect(a.current()?.id).toBe('zero')
  a.notifyZero()
}
const ids = (e: 'bragg' | 'attenuation') => stepsFor(e).map((s) => s.id)

describe('step sequences', () => {
  test('bragg', () => {
    expect(ids('bragg')).toEqual(['collimator', 's1', 'counter', 'counterCable', 's2', 'naclCrystal', 'door', 'zero'])
  })
  test('the goniometer and its ribbon cable are permanently installed: no step, part or zone for them', () => {
    for (const e of EXPERIMENTS) {
      expect(ids(e)).not.toContain('goniometer')
      expect(ids(e)).not.toContain('ribbonCable')
      expect(partsFor(e) as readonly string[]).not.toContain('goniometer')
      expect(partsFor(e) as readonly string[]).not.toContain('ribbonCable')
      expect(zonesOf(e) as readonly string[]).not.toContain('guideRods')
      expect(zonesOf(e) as readonly string[]).not.toContain('ribbonSocket')
      expect(stepsFor(e)).toHaveLength(e === 'bragg' ? 8 : 9)
    }
  })
  test('attenuation', () => {
    expect(ids('attenuation')).toEqual(['collimator', 'counter', 'counterCable', 'targetStage', 'absorbersI', 's1', 's2', 'door', 'zero'])
  })
  test('tray order is a fixed shuffle with the distractors mixed in', () => {
    for (const e of ['bragg', 'attenuation'] as const) {
      const inOrder = stepsFor(e).flatMap((s) => (s.part ? [s.part] : []))
      const tray = partsFor(e)
      expect(partsFor(e)).toEqual(tray) // deterministic
      expect(tray).toHaveLength(inOrder.length + 3)
      expect(inOrder.every((p) => tray.includes(p))).toBe(true)
      expect(tray.slice(0, inOrder.length)).not.toEqual(inOrder) // the sequence is not given away
      expect(tray.slice(-3).some((p) => inOrder.includes(p))).toBe(true) // distractors are not all last
    }
  })
})

describe('initial state', () => {
  test('chamber empty, stage on holder for attenuation', () => {
    const b = new Assembly('bragg')
    expect(b.mounted('collimator')).toBe(false)
    expect(new Assembly('attenuation').mounted('targetStage')).toBe(true)
    expect(b.mounted('targetStage')).toBe(true) // Bragg keeps the stage: the crystal lies on it
    expect(b.distance('s1')).toBe(9)
    expect(b.setup()).toBeNull()
  })
})

describe('place', () => {
  test('notYet, wrongZone, alreadyPlaced, wrongPart', () => {
    const a = new Assembly('bragg')
    expect(a.place('counter', 'sensorSeat')).toEqual({ ok: false, reason: 'notYet' })
    expect(a.place('collimator', 'sensorSeat')).toEqual({ ok: false, reason: 'wrongZone' })
    expect(a.place('collimator', 'collimatorMount')).toEqual(ok)
    expect(a.mounted('collimator')).toBe(true)
    expect(a.place('collimator', 'collimatorMount')).toEqual({ ok: false, reason: 'alreadyPlaced' })
    for (const p of ['absorbersI', 'absorbersII', 'zrFilter'] as Part[]) expect(a.place(p, 'targetHolder')).toEqual({ ok: false, reason: 'wrongPart' })
    expect(a.index()).toBe(1)
  })
  test('attenuation distractors', () => {
    const a = new Assembly('attenuation')
    for (const p of ['naclCrystal', 'absorbersII', 'zrFilter'] as Part[]) expect(a.place(p, 'targetHolder')).toEqual({ ok: false, reason: 'wrongPart' })
  })
  test('the stage leaves the device', () => {
    const a = new Assembly('attenuation')
    run(a)
    expect(a.mounted('targetStage')).toBe(false)
    expect(a.mounted('absorbersI')).toBe(true)
  })
  test('zonesFor shows only the current step', () => {
    const a = new Assembly('bragg')
    expect(a.zonesFor('collimator')).toEqual(['collimatorMount'])
    expect(a.zonesFor('counter')).toEqual([])
  })
  test('door must be open to move parts', () => {
    const a = new Assembly('bragg')
    a.setDoor(true)
    expect(a.place('collimator', 'collimatorMount')).toEqual({ ok: false, reason: 'doorClosed' })
    a.setDoor(false)
    expect(a.place('collimator', 'collimatorMount')).toEqual(ok)
  })
})

describe('distances', () => {
  test('tolerance and clamp', () => {
    const a = new Assembly('bragg')
    a.place('collimator', 'collimatorMount')
    expect(a.current()?.id).toBe('s1')
    expect(a.setDistance('s2', 6)).toBe(false) // not the current step: refused
    expect(a.distance('s2')).toBe(9)
    expect(a.setDistance('s1', 5.6)).toBe(false)
    expect(a.setDistance('s1', 4.4)).toBe(false)
    expect(a.setDistance('s1', 5.4)).toBe(true)
    expect(a.current()?.id).toBe('s1') // in tolerance, but nothing completes until released
    expect(a.commitDistance('s2')).toBe(false)
    expect(a.commitDistance('s1')).toBe(true)
    expect(a.current()?.id).toBe('counter')
    expect(a.setDistance('s1', 9)).toBe(false) // done: locked
    expect(a.distance('s1')).toBe(5.4)
  })
  test('a value passing through the tolerance band mid-drag does not complete the step', () => {
    const a = new Assembly('bragg')
    a.place('collimator', 'collimatorMount')
    for (const cm of [8, 6, 5, 4, 2]) a.setDistance('s1', cm) // dragged across the band 4.5 to 5.5
    expect(a.current()?.id).toBe('s1')
    expect(a.commitDistance('s1')).toBe(false) // released at 2.0: out of tolerance
    a.setDistance('s1', 5.2)
    expect(a.commitDistance('s1')).toBe(true)
  })
  test('clamp to the slider range', () => {
    const a = new Assembly('bragg')
    a.place('collimator', 'collimatorMount')
    a.setDistance('s1', 99)
    expect(a.distance('s1')).toBe(12)
  })
  test('distances are locked once the assembly is done', () => {
    const a = new Assembly('bragg')
    finish(a)
    expect(a.done()).toBe(true)
    expect(a.setDistance('s1', 11)).toBe(false)
    expect(a.setDistance('s2', 11)).toBe(false)
    expect([a.distance('s1'), a.distance('s2')]).toEqual([5, 6])
    expect(a.done()).toBe(true)
  })
})

describe('door gate, done, onChange', () => {
  test('door closes last step, then setup', () => {
    const a = new Assembly('bragg')
    let n = 0
    a.onChange(() => n++)
    run(a)
    expect(n).toBeGreaterThan(5)
    expect(a.done()).toBe(false)
    expect(a.setupReady()).toBe(true)
    expect(a.setup()).toEqual({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' })
    a.setDoor(true)
    expect(a.done()).toBe(false) // the last step: ZERO on the panel
    expect(a.current()?.id).toBe('zero')
    a.notifyZero()
    expect(a.done()).toBe(true)
    expect(a.current()).toBeNull()
  })
  test('ZERO counts only at the zero step', () => {
    const a = new Assembly('attenuation')
    a.notifyZero()
    run(a)
    a.notifyZero() // door still open: it is the door step
    expect(a.current()?.id).toBe('door')
    a.setDoor(true)
    expect(a.current()?.id).toBe('zero')
    expect(a.done()).toBe(false)
    a.notifyZero()
    expect(a.done()).toBe(true)
  })
  test('unsubscribe', () => {
    const a = new Assembly('bragg')
    let n = 0
    const off = a.onChange(() => n++)
    off()
    a.place('collimator', 'collimatorMount')
    expect(n).toBe(0)
  })
  test('autoComplete and reset', () => {
    const a = new Assembly('attenuation')
    a.autoComplete()
    expect(a.done()).toBe(true)
    expect(a.distance('s1')).toBe(5)
    expect(a.mounted('absorbersI')).toBe(true)
    a.reset()
    expect(a.done()).toBe(false)
    expect(a.index()).toBe(0)
    expect(a.mounted('targetStage')).toBe(true)
  })
})

describe('free swaps (attenuation)', () => {
  const done = () => {
    const a = new Assembly('attenuation')
    finish(a)
    a.setDoor(false) // opened again for the swap
    return a
  }
  test('Al wheel at the end, Zr filter in and out', () => {
    const a = done()
    expect(a.done()).toBe(true)
    expect(a.setup()).toEqual({ holder: 'alWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' })
    expect(a.zonesFor('zrFilter')).toEqual(['collimatorTip'])
    expect(a.place('zrFilter', 'collimatorTip')).toEqual(ok)
    expect(a.setup()?.collimatorFilter).toBe('Zr')
    expect(a.place('zrFilter', 'collimatorTip')).toEqual({ ok: false, reason: 'alreadyPlaced' })
    expect(a.zonesFor('zrFilter')).toEqual(['tray'])
    expect(a.place('zrFilter', 'tray')).toEqual(ok)
    expect(a.setup()?.collimatorFilter).toBeNull()
  })
  test('absorber sets swap one at a time: set II is refused while set I is on', () => {
    const a = done()
    expect(a.place('absorbersII', 'targetHolder')).toEqual({ ok: false, reason: 'setTaken' })
    expect(a.mounted('absorbersI')).toBe(true)
    expect(a.place('absorbersI', 'tray')).toEqual(ok)
    expect(a.place('absorbersII', 'targetHolder')).toEqual(ok)
    expect(a.place('absorbersI', 'targetHolder')).toEqual({ ok: false, reason: 'setTaken' })
    expect(a.place('absorbersI', 'tray')).toEqual({ ok: false, reason: 'alreadyPlaced' })
    expect(a.place('absorbersII', 'tray')).toEqual(ok)
    expect(a.place('absorbersI', 'targetHolder')).toEqual(ok)
  })
  test('absorber sets swap', () => {
    const a = done()
    a.place('absorbersI', 'tray')
    expect(a.place('absorbersII', 'targetHolder')).toEqual(ok)
    expect(a.mounted('absorbersI')).toBe(false)
    expect(a.setup()?.holder).toBe('materialWheel')
    expect(a.place('absorbersII', 'tray')).toEqual(ok)
    expect(a.setup()?.holder).toBe('empty')
    expect(a.place('absorbersI', 'collimatorTip' as Zone)).toEqual({ ok: false, reason: 'wrongZone' })
    expect(a.place('naclCrystal', 'targetHolder')).toEqual({ ok: false, reason: 'wrongPart' })
  })
  test('bragg has no swaps', () => {
    const a = new Assembly('bragg')
    a.autoComplete()
    a.setDoor(false)
    expect(a.place('absorbersI', 'targetHolder')).toEqual({ ok: false, reason: 'wrongPart' })
    expect(a.place('naclCrystal', 'targetHolder')).toEqual({ ok: false, reason: 'alreadyPlaced' })
  })
})

describe('adopt: one source of truth when the Apparatus changes from outside', () => {
  const att = () => {
    const a = new Assembly('attenuation')
    finish(a)
    a.setDoor(false)
    return a
  }
  const base = { crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' as const }
  test('a task mounting set II: the tray, the swap rules and setup() follow', () => {
    const a = att()
    let n = 0
    a.onChange(() => n++)
    a.adopt({ ...base, holder: 'materialWheel' })
    expect(n).toBe(1)
    expect([a.mounted('absorbersI'), a.mounted('absorbersII')]).toEqual([false, true])
    expect(a.setup()?.holder).toBe('materialWheel')
    expect(a.zonesFor('absorbersII')).toEqual(['tray']) // the next swap starts from set II, not set I
    expect(a.place('absorbersI', 'targetHolder')).toEqual({ ok: false, reason: 'setTaken' })
    a.adopt({ ...base, holder: 'materialWheel' }) // nothing changed: silent
    expect(n).toBe(1)
  })
  test('the filter and an empty holder follow too', () => {
    const a = att()
    a.adopt({ ...base, holder: 'empty', collimatorFilter: 'Zr' })
    expect([a.mounted('absorbersI'), a.mounted('absorbersII'), a.mounted('zrFilter')]).toEqual([false, false, true])
    expect(a.setup()).toMatchObject({ holder: 'empty', collimatorFilter: 'Zr' })
  })
  test('a setup the parts cannot express (an XRF sample) is kept, and a swap takes over again', () => {
    const a = att()
    const x = { ...base, holder: 'sample' as const, sample: 'Cu' }
    a.adopt(x)
    expect(a.setup()).toEqual(x)
    a.adopt({ ...base, holder: 'alWheel' })
    expect(a.setup()?.holder).toBe('alWheel')
    expect(a.mounted('absorbersI')).toBe(true)
  })
  test('ignored before the bench is set up', () => {
    const a = new Assembly('attenuation')
    a.adopt({ ...base, holder: 'materialWheel' })
    expect(a.mounted('absorbersII')).toBe(false)
    expect(a.setup()).toBeNull()
  })
  test('sameSetup ignores the sample unless it matters', () => {
    expect(sameSetup({ ...base, holder: 'crystal', sample: 'Cu' }, { ...base, holder: 'crystal' })).toBe(true)
    expect(sameSetup({ ...base, holder: 'alWheel' }, { ...base, holder: 'materialWheel' })).toBe(false)
  })
})

describe('doorGate (main.ts refuses to close the door otherwise)', () => {
  const base = { crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, detector: 'gm' as const }
  test('mid-assembly the door may not close', () => {
    const a = new Assembly('attenuation')
    expect(a.doorGate({ ...base, holder: 'crystal' })).toBe('notReady')
    a.place('collimator', 'collimatorMount')
    expect(a.doorGate({ ...base, holder: 'crystal' })).toBe('notReady')
  })
  test('with the parts done but the Apparatus still carrying the crystal (tables loading) it waits', () => {
    const a = new Assembly('attenuation')
    run(a)
    expect(a.doorGate({ ...base, holder: 'crystal' })).toBe('loading')
    expect(a.doorGate({ ...base, holder: 'alWheel' })).toBe('ok')
  })
  test('bragg is ready as soon as the crystal is on', () => {
    const a = new Assembly('bragg')
    run(a)
    expect(a.doorGate({ ...base, holder: 'crystal' })).toBe('ok')
  })
})
