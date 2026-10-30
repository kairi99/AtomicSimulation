import { describe, expect, it, vi } from 'vitest'

// Regression: points measured during a scan must be drawn as they arrive, not only on a log/linear toggle.
// uPlot.setData(data, false) neither redraws nor refreshes the visible index window of a plot built while empty, and
// setScale to an unchanged range is a no-op: the data stayed invisible until a log/linear toggle rebuilt the plot.
// So every new point must go through setData with scale reset (the default), which commits a redraw.
const calls = vi.hoisted(() => ({ setData: [] as unknown[] }))
vi.mock('uplot', () => {
  class FakeUPlot {
    static pxRatio = 1
    ctx = { canvas: {} }
    setData(_d: unknown, resetScales?: boolean) {
      calls.setData.push(resetScales)
    }
    setScale() {}
    setSize() {}
    destroy() {}
  }
  return { default: FakeUPlot }
})

vi.mock('../src/views/canvas', () => ({
  palette: new Proxy({}, { get: () => '12px/14px sans-serif' }),
  paletteVersion: 1,
  scaledFont: (f: string) => f,
}))

const el = (): unknown => {
  const target: Record<string, unknown> = { dataset: {}, clientWidth: 400, clientHeight: 300, hidden: false, disabled: false, textContent: '' }
  const self: unknown = new Proxy(target, {
    get: (o, k) => (k in o ? o[k as string] : k === 'firstElementChild' || k === 'lastElementChild' || k === 'querySelector' ? (k === 'querySelector' ? () => self : self) : () => self),
    set: (o, k, v) => ((o[k as string] = v), true),
  })
  return self
}

describe('spectrum view, live data', () => {
  it('draws the plot for every new point, without a scale change', async () => {
    vi.stubGlobal('document', { addEventListener() {}, documentElement: {}, createElement: () => el(), querySelector: () => null })
    vi.stubGlobal('window', { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) })
    vi.stubGlobal('ResizeObserver', class { observe() {} })
    const { mountSpectrum } = await import('../src/views/spectrum')
    const scan = { first: 0, last: 100, mode: 'COUPLED', setup: { holder: 'crystal' }, changed: false, dt: 1, i: 1, u: 300 }
    const a = { lastScan: scan, replay: [] as { angle: number; rate: number }[], exposureLog: [], phase: 'scan', busy: true }
    const root = el() as HTMLElement
    const v = mountSpectrum(root, a as never)
    v.render()
    const base = calls.setData.length
    for (let i = 1; i <= 3; i++) {
      a.replay.push({ angle: i * 10, rate: 5 }) // below yMax: no rescale
      v.render()
      expect(calls.setData).toHaveLength(base + i)
      expect(calls.setData.at(-1)).not.toBe(false)
    }
    v.render() // nothing new: no redraw
    expect(calls.setData).toHaveLength(base + 3)
  })
})
