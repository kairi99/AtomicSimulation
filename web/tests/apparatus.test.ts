// The procedures of LD instruction sheet 554 800 §11, key by key, plus the panel's guard rails.
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus, MOTOR_DEG_PER_S, OK_S, SAFE_S, adjustMultiplier, fmtMean, wheelSlot, wrapTarget, type Key, type Setup } from '../src/apparatus/apparatus'
import { mulberry32 } from '../src/physics/detector'
import { DEFAULT, directRate, expectedRate } from '../src/physics/scan'
import { CRYSTALS, FOILS_MG_CM2, WHEELS_MG_CM2, loadAbsorbers, loadCrystals } from '../src/physics/tables'

const SAFETY_S = SAFE_S + OK_S

function device() {
  return new Apparatus(mulberry32(1234))
}

function set(a: Apparatus, key: Key, value: number) {
  a.press(key)
  a.adjust(value) // from 0, or relative for arms
}

describe('§11 a) switch on', () => {
  test('U, I, doors closed, HV ON: SAFE → OK → HV on, lamp flashes, counts appear', () => {
    const a = device()
    a.press('U')
    expect(a.display()).toMatchObject({ bottom: '5.0', bottomUnit: 'kV' }) // default 5.0 kV
    a.adjust(150)
    expect(a.display().bottom).toBe('20.0')
    set(a, 'I', 100)
    expect(a.display()).toMatchObject({ bottom: '1.00', bottomUnit: 'mA' })
    a.press('HV')
    expect(a.display()).toMatchObject({ top: 'SAFE', bottom: '', hvLamp: false })
    a.tick(SAFE_S + 0.1)
    expect(a.display()).toMatchObject({ top: 'SAFE', bottom: 'OK' })
    a.tick(OK_S)
    expect(a.hvOn && a.emitting && a.display().hvLamp).toBe(true)
    expect(a.setDoors(false)).toBe(false) // locked while X-rays can be produced
    a.press('ZERO')
    a.tick(1)
    expect(a.lastSecondCounts).toBeGreaterThan(1000) // direct beam at 2θ = 0
    a.press('I')
    a.adjust(-50) // changing I while HV is on changes the rate
    expect(a.expectedRate()).toBeCloseTo(expectedRate([0], 20, 0.5)[0], 9)
    a.press('HV')
    expect(a.hvOn).toBe(false)
    expect(a.setDoors(false)).toBe(true)
  })

  test('a door open: self-test fails, HV stays off, top display blinks', () => {
    const a = device()
    a.setDoors(false)
    a.press('HV')
    a.tick(5)
    expect(a.hvOn).toBe(false)
    expect(a.display()).toMatchObject({ blinkTop: true, alert: 'doors' })
    a.setDoors(true)
    expect(a.display()).toMatchObject({ blinkTop: false, alert: null })
  })
})

describe('§11 b) parameters', () => {
  test('ranges, steps and clamping; any key ends the edit', () => {
    const a = device()
    set(a, 'U', 10_000)
    expect(a.u).toBe(350)
    set(a, 'DT', 10_000)
    expect(a.display().bottom).toBe('9999')
    a.adjust(-20_000)
    expect(a.dt).toBe(1)
    set(a, 'DBETA', -5)
    expect(a.display()).toMatchObject({ bottom: '0.0', symbol: 'exposure' })
    a.press('SENSOR') // ends the edit: ADJUST now moves the sensor
    a.adjust(3)
    expect(a.dBeta).toBe(0)
    expect(a.sensor).toBe(3)
  })

  test('I stays exact: 100 steps of 0.01 mA are 1.00 mA and the model accepts them', () => {
    const a = device()
    a.press('I')
    for (let k = 0; k < 100; k++) a.adjust(1)
    expect(a.i).toBe(100)
    a.press('HV')
    a.tick(SAFETY_S)
    expect(() => a.expectedRate()).not.toThrow()
  })

  test('LIMITS: first press lower, second press upper; upper < lower flashes and refuses SCAN', () => {
    const a = device()
    a.press('COUPLED')
    a.press('LIMITS')
    expect(a.display().symbol).toBe('lower')
    a.adjust(100)
    a.press('LIMITS')
    expect(a.display().symbol).toBe('upper')
    a.adjust(50)
    expect(a.display().flashBottom).toBe(true)
    a.press('SCAN')
    a.tick(5)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    a.press('LIMITS')
    a.press('LIMITS')
    a.adjust(100)
    expect(a.display().flashBottom).toBe(false)
  })

  test('ADJUST responds dynamically', () => {
    expect([1, 10, 40].map(adjustMultiplier)).toEqual([1, 5, 20])
  })
})

describe('§11 c) manual positioning', () => {
  test('COUPLED: the sensor follows at twice the step from the arms at the moment of pressing', () => {
    const a = device()
    set(a, 'SENSOR', 30) // sensor 3.0°, target 0: not 2:1
    a.press('COUPLED')
    a.adjust(10)
    expect([a.target, a.sensor]).toEqual([10, 50]) // 1.0°, 5.0° — relative, as the manual warns
    a.press('ZERO')
    a.tick(1) // the motor drives both arms home
    a.adjust(72)
    expect([a.target, a.sensor]).toEqual([72, 144])
    a.adjust(10_000)
    expect(a.sensor).toBe(1700) // sensor arm limit +170°
    expect(a.target).toBe(850)
    a.press('COUPLED') // second press: top display shows the sensor angle
    expect(a.display()).toMatchObject({ top: '170.0', topUnit: '°', bottom: '85.0' })
  })

  test('the display follows ADJUST; COUPLED again toggles the top line and back', () => {
    const a = device()
    a.press('SENSOR')
    a.press('I')
    a.press('HV') // ends the I edit: ADJUST moves the sensor again
    a.tick(SAFETY_S)
    a.adjust(5)
    expect(a.display()).toMatchObject({ bottom: '0.5', bottomUnit: '°' })
    a.press('COUPLED')
    a.press('U')
    a.press('COUPLED') // back from U: shows COUPLED again, top still the rate
    expect(a.display()).toMatchObject({ topUnit: '1/s', bottomUnit: '°' })
    a.press('COUPLED')
    expect(a.display().topUnit).toBe('°')
    a.press('COUPLED')
    expect(a.display().topUnit).toBe('1/s')
  })

  test('the target arm turns without limit; the display folds it into −180° … 180°', () => {
    const a = device()
    set(a, 'TARGET', 4000)
    expect(a.target).toBe(4000)
    expect(a.display().bottom).toBe('40.0')
    a.adjust(-4050)
    expect(a.display().bottom).toBe('-5.0')
    expect([1799, 1800, -1800, -1801].map(wrapTarget)).toEqual([1799, -1800, -1800, 1799])
  })

  test('limits set for another arm are clamped when a mode is selected', () => {
    const a = device()
    a.press('TARGET')
    a.press('LIMITS')
    a.adjust(900)
    a.press('LIMITS')
    a.adjust(1000)
    a.press('COUPLED')
    expect([a.limitLo, a.limitHi]).toEqual([850, 850]) // 90°/100° → the coupled maximum 85°
  })
})

describe('§11 e) exposure timer', () => {
  test('Δβ = 0, SCAN counts Δt down with arms still; REPLAY gives the mean rate', () => {
    const a = device()
    a.press('COUPLED')
    a.adjust(72) // 1st-order Kα
    set(a, 'U', 300)
    set(a, 'I', 100)
    set(a, 'DT', 9) // 10 s
    set(a, 'DBETA', -1)
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(a.phase).toBe('exposure')
    a.tick(4)
    expect(a.display()).toMatchObject({ bottom: '6', bottomUnit: 's', symbol: 'exposure' })
    a.tick(6)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.display()).toMatchObject({ bottom: '0', bottomUnit: 's', symbol: 'exposure' }) // "when it reaches zero"
    expect([a.target, a.sensor]).toEqual([72, 144])
    a.press('REPLAY')
    const rBar = expectedRate([7.2], 35, 1)[0]
    expect(a.display().top).toMatch(/^\d{4}$|^\d{3}\.\d$/) // a mean fills the 4 digits
    const rate = Number(a.display().top)
    expect(Math.abs(rate - rBar)).toBeLessThan(5 * Math.sqrt(rBar / 10) + 1)
  })

  test('the exposure timer needs HV only: with no emission current it counts the background', () => {
    const a = device()
    set(a, 'DBETA', -1)
    a.press('SCAN')
    a.tick(SAFETY_S + 5)
    expect(a.phase).toBe('idle') // EPN P1 run 3: 0 kV / 0 mA
    expect(a.replay).toHaveLength(1)
  })
})

describe('motor-driven arms (emulator assumption: MOTOR_DEG_PER_S)', () => {
  const tenthsPerS = 10 * MOTOR_DEG_PER_S

  test('ZERO drives both arms home together, 2:1 all the way; ADJUST waits for the motor', () => {
    const a = device()
    set(a, 'COUPLED', 125) // 12.5° / 25.0°
    a.press('ZERO')
    expect(a.moving).toBe(true)
    a.tick(100 / tenthsPerS) // the faster arm (sensor) covers 10.0°
    expect(a.sensor).toBeCloseTo(150, 9)
    expect(a.target).toBeCloseTo(75, 9)
    expect(a.display().bottom).toBe('7.5')
    a.adjust(5) // ignored while the motor drives
    a.tick(1)
    expect([a.target, a.sensor, a.moving]).toEqual([0, 0, false])
  })

  test('SCAN: self-test, then arms to zero and to the lower limit with HV off, then HV on', () => {
    const a = device()
    set(a, 'COUPLED', 100) // 10° / 20°
    set(a, 'I', 100)
    a.press('LIMITS')
    a.adjust(20)
    a.press('LIMITS')
    a.adjust(30)
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect([a.phase, a.hvOn]).toEqual(['positioning', false])
    a.tick(100 / tenthsPerS) // halfway home
    expect(a.sensor).toBeCloseTo(100, 9)
    expect([a.phase, a.hvOn, a.lastSecondCounts]).toEqual(['positioning', false, 0])
    a.tick(0.5 * 200 / tenthsPerS + 40 / tenthsPerS + 0.1) // home, then out to 2.0° / 4.0°, 0.1 s counted
    expect([a.phase, a.hvOn, a.target, a.sensor]).toEqual(['scan', true, 20, 40])
    expect(a.lastScan).toMatchObject({ mode: 'COUPLED', first: 20, last: 30 })
    // 11 points of Δt = 1 s, each step after the first needs 0.2° / speed of travel first
    const travel = 2 / tenthsPerS
    a.tick(10.95 + 9 * travel - 0.1)
    expect(a.replay).toHaveLength(10) // the 11th still counts: travel time is not counting time
    a.tick(0.1 + 10 * travel)
    expect(a.replay).toHaveLength(11)
    expect([a.phase, a.hvOn]).toEqual(['idle', false])
  })

  test('instant mode: the rate meter still refreshes every real second', () => {
    const a = device()
    a.timeScale = Infinity
    set(a, 'U', 300)
    set(a, 'I', 100)
    a.press('HV')
    a.tick(SAFETY_S)
    const n = a.secondsCounted
    a.tick(1)
    expect(a.secondsCounted).toBe(n + 1)
    expect(a.lastSecondCounts).toBeGreaterThan(0)
  })

  test('RESET mid-move drives the arms home with HV off', () => {
    const a = device()
    set(a, 'COUPLED', 100)
    a.press('ZERO')
    a.tick(0.25)
    a.press('RESET')
    expect(a.moving).toBe(true)
    a.tick(2)
    expect([a.target, a.sensor, a.moving, a.hvOn]).toEqual([0, 0, false, false])
  })

  test('an exposure started while the arms travel counts from their arrival', () => {
    const a = device()
    set(a, 'COUPLED', 100) // 10° / 20°
    set(a, 'I', 100)
    set(a, 'DBETA', -1)
    a.press('ZERO') // 1 s of travel
    a.press('SCAN')
    a.tick(SAFETY_S) // the motor waits for the self-test
    a.tick(1.5) // 1 s of travel, 0.5 s counted
    expect(a.display().bottom).toBe('1') // Δt = 1 s not yet over
    a.tick(0.6)
    expect(a.replay).toEqual([{ angle: 0, rate: expect.any(Number) }])
  })

  test('HV during positioning stops the program; the arms finish their current leg only', () => {
    const a = device()
    set(a, 'COUPLED', 100)
    a.press('LIMITS')
    a.adjust(20)
    a.press('LIMITS')
    a.adjust(30)
    a.press('SCAN')
    a.tick(SAFETY_S + 0.1)
    a.press('HV')
    expect([a.phase, a.hvOn]).toEqual(['idle', false])
    a.tick(5)
    expect([a.target, a.sensor]).toEqual([0, 0])
  })
})

describe('§11 f, h) auto-scan: Bragg reflection at NaCl (leaflet settings)', () => {
  function leafletScan(timeScale: number) {
    const a = device()
    a.timeScale = timeScale
    a.press('ZERO')
    set(a, 'U', 300)
    set(a, 'I', 100)
    set(a, 'DT', 9)
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(20)
    a.press('LIMITS')
    a.adjust(250)
    a.press('SCAN')
    return a
  }

  test('instant: 231 points 2.0° → 25.0°, means within 5σ of R̄, then REPLAY browses them', () => {
    const a = leafletScan(Infinity)
    a.tick(0.016)
    expect(a.phase).toBe('safety') // the self-test runs in real time even in instant mode
    a.tick(SAFETY_S)
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.replay).toHaveLength(231)
    expect(a.replay[0].angle).toBe(20)
    expect(a.replay.at(-1)!.angle).toBe(250)
    const rBar = expectedRate(a.replay.map((p) => p.angle / 10), 35, 1)
    a.replay.forEach((p, k) => expect(Math.abs(p.rate - rBar[k])).toBeLessThan(5 * Math.sqrt(rBar[k] / 10) + 0.5))
    a.press('REPLAY')
    a.adjust(52)
    expect(a.display()).toMatchObject({ bottom: '7.2', bottomUnit: '°' })
    expect(Number(a.display().top)).toBeGreaterThan(1000) // 1st-order Kα peak
    expect([a.target, a.sensor]).toEqual([250, 500]) // REPLAY does not move the arms
    a.press('RESET')
    a.tick(0) // instant: the arms land at zero
    expect(a.replay).toHaveLength(0)
    expect([a.u, a.i, a.dt, a.dBeta, a.target, a.sensor, a.mode]).toEqual([50, 0, 1, 1, 0, 0, null])
  })

  test('real time ×100: steps every Δt, rate shown every second; SCAN again stops', () => {
    const a = leafletScan(100)
    a.tick(SAFETY_S)
    expect(a.phase).toBe('positioning')
    a.tick(0.01) // 1 s: the arms need 0.2 s to reach the lower limit, then HV comes on
    expect([a.phase, a.hvOn]).toEqual(['scan', true])
    expect([a.target, a.sensor]).toEqual([20, 40]) // arms at the lower limit
    a.tick(0.25) // 25 s more → 2 steps done (10 s each plus 0.01 s of travel)
    expect(a.replay).toHaveLength(2)
    expect(a.display().bottom).toBe('2.2')
    a.press('SCAN')
    expect(a.phase).toBe('idle')
    expect(a.hvOn).toBe(false)
    expect(a.replay).toHaveLength(2) // kept for REPLAY
  })

  test('after a COUPLED auto-scan, manual moves keep 2:1 about zero', () => {
    const a = device()
    set(a, 'SENSOR', 30) // arms off 2:1 when COUPLED is pressed
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(40)
    a.press('LIMITS')
    a.adjust(50)
    set(a, 'I', 100)
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect([a.target, a.sensor]).toEqual([50, 100])
    a.press('COUPLED') // selects COUPLED again: ADJUST moves the arms
    a.adjust(1)
    expect([a.target, a.sensor]).toEqual([51, 102])
  })

  test('HV OFF stops a running scan and keeps the data; U/I edits show during the program', () => {
    const a = leafletScan(100)
    a.tick(SAFETY_S)
    a.tick(0.25)
    a.press('I')
    expect(a.display()).toMatchObject({ bottom: '1.00', bottomUnit: 'mA' })
    a.press('HV')
    expect([a.phase, a.hvOn]).toEqual(['idle', false])
    expect(a.replay).toHaveLength(2)
  })

  test('upper < lower: SCAN refused, ADJUST corrects the flashing upper limit', () => {
    const a = device()
    a.press('COUPLED')
    a.press('LIMITS')
    a.adjust(100)
    a.press('SCAN')
    expect(a.display()).toMatchObject({ symbol: 'upper', flashBottom: true, alert: 'limits' })
    a.adjust(150)
    expect([a.limitHi, a.target, a.display().flashBottom]).toEqual([150, 0, false])
  })

  test('auto-scan needs a scan mode; SENSOR scans move only the sensor', () => {
    const a = device()
    set(a, 'I', 100)
    a.press('SCAN')
    a.tick(5)
    expect(a.phase).toBe('idle')
    expect(a.display().alert).toBe('mode') // says what is missing
    a.press('SENSOR')
    expect(a.alert).toBe(null)
    a.press('SENSOR')
    a.press('LIMITS')
    a.adjust(100)
    a.press('LIMITS')
    a.adjust(120)
    set(a, 'DBETA', 9) // 1.0°
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(a.replay.map((p) => p.angle)).toEqual([100, 110, 120])
    expect([a.target, a.sensor]).toEqual([0, 120])
  })
})

test('display caps at 9999 while the counter runs', () => {
  const a = device()
  set(a, 'U', 300)
  set(a, 'I', 100)
  a.press('HV')
  a.tick(SAFETY_S)
  a.tick(1) // arms at zero: direct beam ≈ 9200/s after dead time; force a larger count
  a.lastSecondCounts = 20_000
  expect(a.display().top).toBe('9999')
})

test('REPLAY means use as many decimals as fit the 4 digits', () => {
  expect([5.81, 58.1, 581, 5810, 9.9996, 99.996, 999.96, 0, 20_000].map(fmtMean)).toEqual(
    ['5.810', '58.10', '581.0', '5810', '10.00', '100.0', '1000', '0.000', '9999'],
  )
})

describe('setup (G1.7)', () => {
  beforeAll(loadAbsorbers)

  /** HV on at `kV`, `mA`, doors closed, with the given accessories mounted. */
  function running(kV: number, mA: number, setup: Partial<Setup> = {}) {
    const a = device()
    a.setDoors(false)
    expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null, ...setup })).toBe(true)
    a.setDoors(true)
    set(a, 'U', kV * 10 - a.u)
    set(a, 'I', mA * 100)
    a.press('HV')
    a.tick(SAFETY_S + 0.1)
    return a
  }

  test('mount needs the door open; RESET keeps the setup', () => {
    const a = device()
    const setup: Setup = { holder: 'empty', crystal: 'NaCl', collimatorFilter: 'Zr', sensorFilter: null }
    expect(a.mount(setup)).toBe(false)
    expect(a.setup.holder).toBe('crystal')
    a.setDoors(false)
    expect(a.mount(setup)).toBe(true)
    a.press('RESET')
    expect(a.setup).toMatchObject(setup)
    expect(() => a.mount({ ...setup, sensorFilter: 'Pb' })).toThrow(RangeError)
  })

  test('Al wheel in the direct beam: slot in the beam, else the frame blocks it', () => {
    const a = running(21, 0.05, { holder: 'alWheel' })
    a.press('TARGET')
    expect(a.expectedRate()).toBe(directRate(21, 0.05)) // slot 0 is open
    a.moveArm(100)
    const al = directRate(21, 0.05, [['Al', WHEELS_MG_CM2.al[1]![1]]])
    expect(a.expectedRate()).toBe(al)
    expect(al).toBeLessThan(directRate(21, 0.05))
    a.moveArm(-50)
    expect(a.expectedRate()).toBe(directRate(0, 0))
  })

  test('crystal with a Zr sensor filter', () => {
    const a = running(35, 1, { sensorFilter: 'Zr' })
    a.press('COUPLED')
    a.moveArm(72) // β = 7.2°, 2β = 14.4°
    const bare = expectedRate([7.2], 35, 1, DEFAULT, [14.4])[0]
    expect(a.expectedRate()).toBeCloseTo(expectedRate([7.2], 35, 1, DEFAULT, [14.4], [['Zr', FOILS_MG_CM2.Zr]])[0], 9)
    expect(a.expectedRate()).toBeLessThan(bare)
  })

  test('saturated: the open beam at full power paralyses a GM counter', () => {
    expect(running(35, 1, { holder: 'empty' }).saturated).toBe(true)
    expect(running(21, 0.05, { holder: 'empty' }).saturated).toBe(false)
  })

  test('EPN P1 run 3: background at 0 kV / 0 mA finishes and reads the background', () => {
    const a = device()
    set(a, 'DBETA', -1)
    set(a, 'DT', 99) // 1 → 100 s
    a.press('SCAN')
    a.tick(SAFETY_S + 101)
    expect(a.phase).toBe('idle')
    const bg = directRate(0, 0)
    expect(Math.abs(a.replay[0].rate - bg)).toBeLessThan((5 * Math.sqrt(bg / 100)))
  })

  test('P1 run 1a end to end: Al plate at 20°, 30 s exposure', () => {
    const a = running(21, 0.05, { holder: 'alWheel' })
    a.press('HV')
    a.press('TARGET')
    a.adjust(200)
    set(a, 'DBETA', -1)
    set(a, 'DT', 29)
    a.press('SCAN')
    a.tick(SAFETY_S + 31)
    expect(a.hvOn).toBe(false)
    expect(a.target).toBe(200)
    const mean = directRate(21, 0.05, [['Al', WHEELS_MG_CM2.al[2]![1]]])
    expect(Math.abs(a.replay[0].rate - mean)).toBeLessThan(5 * Math.sqrt(mean / 30))
  })

  test('target wrap and frame', () => {
    const a = running(21, 0.05, { holder: 'alWheel' })
    a.press('TARGET')
    const at = (tenths: number) => {
      a.target = tenths
      return a.expectedRate()
    }
    const slot1 = directRate(21, 0.05, [['Al', WHEELS_MG_CM2.al[1]![1]]])
    expect(at(-3500)).toBe(slot1)
    expect(at(3700)).toBe(slot1)
    expect(at(-20)).toBe(directRate(21, 0.05))
    expect(at(-50)).toBe(directRate(0, 0))
  })

  test('material plate: open slot at 0° (LD P6.3.2.1); saturation boundary', () => {
    const a = running(30, 0.02, { holder: 'materialWheel' })
    a.press('TARGET')
    a.target = 0
    expect(a.expectedRate()).toBe(directRate(30, 0.02))
    a.target = 100
    expect(a.saturated).toBe(true) // polystyrene 0.5 mm
    a.target = 200
    expect(a.saturated).toBe(false) // Al
  })

  test('empty holder off-axis follows the direct-beam profile', () => {
    const a = running(21, 0.05, { holder: 'empty' })
    a.sensor = 15
    expect(a.expectedRate()).toBe(directRate(21, 0.05, [], DEFAULT, 1.5))
    expect(a.expectedRate()).toBeLessThan(directRate(21, 0.05))
  })

  test('mount refused while HV is on; no specular beam without crystal; saturated off with HV off', () => {
    const a = running(35, 1, { holder: 'empty' })
    expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })).toBe(false)
    a.doorsClosed = false // forced: the interlock of mount() itself still refuses with HV on
    expect(a.mount({ holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })).toBe(false)
    expect(a.specularRate()).toBe(0)
    a.press('HV')
    expect(a.saturated).toBe(false)
    expect(a.expectedRate()).toBe(directRate(0, 0))
    expect(a.specularRate()).toBe(0)
  })

  test('transmittedRate: the direct beam the views draw', () => {
    expect(running(35, 1).transmittedRate()).toBe(0) // crystal: the reflected beam instead
    const off = running(35, 1, { holder: 'empty' })
    expect(off.transmittedRate()).toBeCloseTo(directRate(35, 1, [], DEFAULT, 0), 12)
    off.press('HV')
    expect(off.transmittedRate()).toBe(0)
    const a = running(35, 1, { holder: 'alWheel' })
    a.press('TARGET')
    const open = a.transmittedRate()
    expect(open).toBeCloseTo(directRate(35, 1, [], DEFAULT, 0), 12) // slot 0 is open
    a.moveArm(100)
    expect(a.transmittedRate()).toBeGreaterThan(0)
    expect(a.transmittedRate()).toBeLessThan(open)
    a.moveArm(-50)
    expect(a.transmittedRate()).toBe(0) // 5°: the frame
  })

  /** One exposure on the Al plate: TARGET at `deg`, Δβ = 0, Δt, SCAN, run to the end. */
  function expose(a: Apparatus, deg: number, dt: number, kV = 21, mA = 0.05) {
    a.press('TARGET')
    a.adjust(deg * 10 - a.target)
    set(a, 'U', kV * 10 - a.u)
    set(a, 'I', mA * 100 - a.i)
    set(a, 'DBETA', -a.dBeta)
    set(a, 'DT', dt - a.dt)
    a.press('SCAN')
    a.tick(SAFETY_S + dt + 1)
    expect(a.phase).toBe('idle')
  }

  test('P1 workflow: a series of exposures is logged with its setup, REPLAY unchanged', () => {
    const a = device()
    a.setDoors(false)
    a.mount({ holder: 'alWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    expect(a.exposureLog).toHaveLength(0)
    expose(a, 30, 20)
    expect(a.display()).toMatchObject({ bottom: '0', bottomUnit: 's' }) // "0 s" stays on show
    expect(a.exposureLog).toHaveLength(1)
    const [e] = a.exposureLog
    expect(e).toMatchObject({ target: 300, sensor: 0, slot: 3, mode: 'TARGET', u: 210, i: 5, dt: 20, changed: false })
    expect(e.setup.holder).toBe('alWheel')
    expect(wheelSlot(e.setup.holder, e.target)).toBe(3)
    a.press('REPLAY')
    expect(a.display().top).toBe(fmtMean(e.rate)) // the logged rate is what REPLAY shows
    const mean = directRate(21, 0.05, [['Al', WHEELS_MG_CM2.al[3]![1]]])
    expect(Math.abs(e.rate - mean)).toBeLessThan(5 * Math.sqrt(mean / 20))
    expose(a, 60, 20)
    expect(a.exposureLog).toHaveLength(2)
    expect(a.exposureLog[1]).toMatchObject({ target: 600, slot: 6 })
    expect(a.exposureLog[1].rate).toBeLessThan(e.rate) // slot 6 is thicker than slot 3
  })

  test('exposure log: background run, early stop, auto-scan, RESET and clearing', () => {
    const a = device()
    set(a, 'U', -a.u)
    set(a, 'DBETA', -1)
    set(a, 'DT', 99)
    a.press('SCAN') // background at 0 kV / 0 mA
    a.tick(SAFETY_S + 101)
    expect(a.exposureLog).toHaveLength(1)
    expect(a.exposureLog[0]).toMatchObject({ mode: null, u: 0, i: 0, dt: 100 })
    const bg = directRate(0, 0)
    expect(Math.abs(a.exposureLog[0].rate - bg)).toBeLessThan(5 * Math.sqrt(bg / 100))
    set(a, 'U', 50)
    set(a, 'DT', -91)
    a.press('SCAN') // stopped early: not logged
    a.tick(SAFETY_S + 3)
    a.press('SCAN')
    expect(a.exposureLog).toHaveLength(1)
    a.press('TARGET')
    set(a, 'DBETA', 5) // auto-scan, Δβ = 1.0° from limits 0 … 0: not an exposure
    a.timeScale = Infinity
    a.press('SCAN')
    a.tick(SAFETY_S)
    expect(a.exposureLog).toHaveLength(1)
    a.press('RESET')
    expect(a.exposureLog).toHaveLength(1)
    a.clearExposureLog()
    expect(a.exposureLog).toHaveLength(0)
  })

  test('exposure log flags U or I changed while counting', () => {
    const a = device()
    set(a, 'DBETA', -1)
    set(a, 'DT', 9)
    a.press('SCAN')
    a.tick(SAFETY_S + 2)
    a.press('U')
    a.adjust(10)
    a.tick(10)
    expect(a.exposureLog[0]).toMatchObject({ u: 50, changed: true })
  })

  test('changed: U edited then instant mode counts; U edited only while positioning does not', () => {
    const a = device()
    set(a, 'DBETA', -1)
    set(a, 'DT', 9)
    a.press('SCAN')
    a.tick(SAFETY_S + 2) // counting
    a.press('U')
    a.adjust(10)
    a.timeScale = Infinity
    a.tick(0)
    expect(a.exposureLog[0].changed).toBe(true)
    // auto-scan: U edited during positioning, then no change while counting
    const b = device()
    ;[b.i, b.dt, b.dBeta, b.limitLo, b.limitHi] = [10, 1, 10, 100, 120]
    b.press('COUPLED')
    b.press('SCAN')
    b.tick(SAFETY_S + 0.1)
    expect(b.phase).toBe('positioning')
    b.press('U')
    b.adjust(10)
    b.tick(30)
    expect(b.phase).toBe('idle')
    expect(b.lastScan).toMatchObject({ u: 60, changed: false })
  })

  test('SENSOR-mode exposure records both arms and the slot under the target', () => {
    const a = device()
    a.setDoors(false)
    a.mount({ holder: 'alWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    a.press('TARGET')
    a.adjust(300)
    a.press('SENSOR')
    a.adjust(5)
    set(a, 'DBETA', -1)
    a.press('SCAN')
    a.tick(SAFETY_S + 2)
    expect(a.exposureLog[0]).toMatchObject({ target: 300, sensor: 5, slot: 3, mode: 'SENSOR' })
  })
})

describe('crystal picker (C2.2)', () => {
  const base: Setup = { holder: 'crystal', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null }
  beforeAll(loadCrystals)

  function lif() {
    const a = device()
    a.setDoors(false)
    expect(a.mount({ ...base, crystal: 'LiF' })).toBe(true)
    a.setDoors(true)
    return a
  }

  test('mounting a crystal needs the door open; RESET keeps it', () => {
    const a = device()
    expect(a.mount({ ...base, crystal: 'LiF' })).toBe(false)
    expect(a.setup.crystal).toBe('NaCl')
    const b = lif()
    b.press('RESET')
    expect(b.setup.crystal).toBe('LiF')
  })

  test('unknown preset is refused', () => {
    const a = device()
    a.setDoors(false)
    expect(() => a.mount({ ...base, crystal: 'Quartz' })).toThrow(RangeError)
  })

  test('the apparatus rate follows the crystal, and NaCl is unchanged', () => {
    for (const [name, th] of [['LiF', 10], ['NaCl', 7]] as const) {
      const a = device()
      a.setDoors(false)
      a.mount({ ...base, crystal: name })
      a.setDoors(true)
      set(a, 'U', 350 - a.u)
      set(a, 'I', 100)
      a.press('COUPLED')
      a.press('HV')
      a.tick(SAFETY_S + 0.1)
      a.adjust(th * 10 * 2)
      while (a.moving) a.tick(0.5)
      const want = expectedRate([a.target / 10], a.u / 10, a.i / 100, DEFAULT, [a.sensor / 10], [], CRYSTALS[name])[0]
      expect(a.expectedRate()).toBe(want)
    }
  })

  test('LiF differs from NaCl at the same angles', () => {
    const [x, y] = [lif(), device()]
    for (const a of [x, y]) {
      set(a, 'U', 350 - a.u)
      set(a, 'I', 100)
      a.press('COUPLED')
      a.press('HV')
      a.tick(SAFETY_S + 0.1)
      a.adjust(200)
      while (a.moving) a.tick(0.5)
    }
    expect(x.expectedRate()).not.toBe(y.expectedRate())
    expect(x.crystal.d_pm).toBeCloseTo(201.35, 2)
  })
})

describe('ADJUST right after RESET/ZERO, and the ZERO counter', () => {
  beforeAll(loadAbsorbers)

  test('arms already at 0: RESET and ZERO queue no move, so ADJUST works at once (not silently ignored)', () => {
    const a = device()
    a.press('RESET')
    expect(a.moving).toBe(false)
    a.press('ZERO')
    expect(a.moving).toBe(false)
    a.press('TARGET')
    a.adjust(100)
    expect(a.target).toBe(100)
  })

  test('an exposure at 10° taken first, right after mounting the material wheel, logs slot 1 (not the open slot)', () => {
    const a = device()
    a.press('RESET')
    a.setDoors(false)
    a.mount({ holder: 'materialWheel', crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
    a.setDoors(true)
    a.press('TARGET')
    a.adjust(100)
    set(a, 'U', 300 - a.u)
    set(a, 'I', 1 - a.i)
    set(a, 'DBETA', -a.dBeta)
    set(a, 'DT', 5 - a.dt)
    a.press('SCAN')
    a.tick(SAFETY_S + 6)
    expect(a.exposureLog.at(-1)).toMatchObject({ target: 100, slot: 1 })
  })

  test('zeroPresses counts processed ZERO keys only (not during a program)', () => {
    const a = device()
    expect(a.zeroPresses).toBe(0)
    a.press('ZERO')
    expect(a.zeroPresses).toBe(1)
    a.press('HV')
    expect(a.busy).toBe(true)
    a.press('ZERO') // ignored during the self-test
    expect(a.zeroPresses).toBe(1)
  })
})
