// The Explore lock: derived from the experiment's lab core list and the tasks finished on this device.
import { beforeEach, describe, expect, test } from 'vitest'
import { clearProgress, completedIds, lockState, markCompleted } from '../src/pedagogy/progress'
import { exploreLock, labCoreIds } from '../src/pedagogy/card'
import { setExperiment } from '../src/pedagogy/experiment'
import { getMode } from '../src/pedagogy/mode'

beforeEach(() => clearProgress(['bragg', 'attenuation']))

describe('lockState', () => {
  test('locked until every lab id is completed', () => {
    expect(lockState(['a', 'b', 'c'], new Set(['a']))).toEqual({ locked: true, done: 1, total: 3 })
    expect(lockState(['a', 'b', 'c'], new Set(['a', 'b', 'c', 'x']))).toEqual({ locked: false, done: 3, total: 3 })
  })
  test('teacher bypass and an empty list never lock', () => {
    expect(lockState(['a'], new Set(), true).locked).toBe(false)
    expect(lockState([], new Set()).locked).toBe(false)
  })
})

describe('completion store', () => {
  test('per experiment, idempotent', () => {
    expect(markCompleted('bragg', 'x')).toBe(true)
    expect(markCompleted('bragg', 'x')).toBe(false)
    expect([...completedIds('bragg')]).toEqual(['x'])
    expect(completedIds('attenuation').size).toBe(0)
  })
})

describe('core lab list', () => {
  test('derived from the tasks', () => {
    expect(labCoreIds('bragg')).toEqual(['lambda-three-orders'])
    expect(labCoreIds('attenuation').sort()).toEqual(['attenuation-material', 'attenuation-thickness', 'background'])
  })
  test('Explore unlocks only after the last lab task of the current experiment', () => {
    setExperiment('attenuation')
    expect(exploreLock()).toEqual({ locked: true, done: 0, total: 3 })
    markCompleted('attenuation', 'background')
    markCompleted('attenuation', 'attenuation-thickness')
    expect(exploreLock().locked).toBe(true)
    markCompleted('attenuation', 'attenuation-material')
    expect(exploreLock().locked).toBe(false)
    setExperiment('bragg')
    expect(exploreLock().locked).toBe(true)
  })
  test('the app starts in Lab', () => {
    expect(getMode()).toBe('lab')
  })
})
