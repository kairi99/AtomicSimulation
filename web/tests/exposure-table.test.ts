// The absorber window in the beam and the raw-data exposure table (views/exposure-table.ts).
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus } from '../src/apparatus/apparatus'
import { setLang } from '../src/i18n'
import { loadAbsorbers } from '../src/physics/tables'
import { exposureTableHtml, windowLabel } from '../src/views/exposure-table'

;(globalThis as any).document ??= { documentElement: {} } // setLang writes <html lang>
const bench = (holder: 'alWheel' | 'materialWheel' | 'crystal') => {
  const a = new Apparatus()
  a.setDoors(false)
  a.mount({ holder, crystal: 'NaCl', collimatorFilter: null, sensorFilter: null })
  a.setDoors(true)
  a.press('TARGET')
  return a
}

describe('windowLabel', () => {
  beforeAll(async () => {
    await loadAbsorbers()
    setLang('es')
  })
  test('open slot, a window, and the frame between windows', () => {
    const a = bench('alWheel')
    expect(windowLabel(a)).toBe('Ventana: abierta (sin absorbente)') // 0°
    a.adjust(100)
    expect(windowLabel(a)).toBe('Ventana: Al 0.5 mm') // 10°
    a.adjust(100)
    expect(windowLabel(a)).toBe('Ventana: Al 1.0 mm') // 20°
    a.adjust(-150)
    expect(windowLabel(a)).toBe('Marco (entre ventanas)') // 5°
  })
  test('material set names its material; no plate, no label', () => {
    const a = bench('materialWheel')
    a.adjust(100)
    expect(windowLabel(a)).toBe('Ventana: Poliestireno 0.5 mm')
    expect(windowLabel(bench('crystal'))).toBe('')
  })
  test('English wording', () => {
    setLang('en')
    const a = bench('alWheel')
    a.adjust(200)
    expect(windowLabel(a)).toBe('Window: Al 1.0 mm')
    a.adjust(-150)
    expect(windowLabel(a)).toBe('Frame (between windows)')
    setLang('es')
  })
})

describe('exposureTableHtml', () => {
  beforeAll(loadAbsorbers)
  test('lists the raw data of each exposure and no derived quantity', () => {
    const a = bench('alWheel')
    a.timeScale = Infinity
    ;[a.u, a.i, a.dt, a.dBeta] = [300, 2, 4, 0]
    a.adjust(100)
    a.press('SCAN')
    a.tick(2)
    a.press('SCAN')
    a.tick(2)
    expect(a.exposureLog.length).toBeGreaterThan(0)
    const html = exposureTableHtml(a.exposureLog)
    expect(html).toContain('<th scope="row">1</th>')
    expect(html).toContain('>Al<')
    expect(html).toContain('>0.5<') // thickness in mm
    expect(html).toContain('>30.0<') // U in kV
    expect(html).toContain('>0.02<') // I in mA
    expect(html.split('<tbody>')[0]).not.toMatch(/>(T|ln T|μ[^<]*)</) // no derived column: the evaluation is the student's
    expect((html.match(/<tr>/g) ?? []).length).toBe(a.exposureLog.length + 1)
  })
})
