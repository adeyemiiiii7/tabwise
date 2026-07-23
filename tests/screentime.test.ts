import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetChromeStorage } from './setup'
import { startTracking, flushCurrent, pauseTracking, getActiveTime } from '../src/lib/screentime'
import { getScreenTime } from '../src/lib/storage'

const TODAY = '2026-07-23'

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  await pauseTracking()
  resetChromeStorage()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('screen time tracking', () => {
  it('records elapsed seconds for the active domain under today', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(40_000)
    await flushCurrent()
    const data = await getScreenTime()
    expect(data[TODAY]['github.com']).toBe(40)
  })

  it('accumulates across multiple flushes', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(30_000)
    await flushCurrent()
    vi.advanceTimersByTime(30_000)
    await flushCurrent()
    const data = await getScreenTime()
    expect(data[TODAY]['github.com']).toBe(60)
  })

  it('discards stretches longer than the session gap cap (sleep/frozen worker)', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(6 * 60_000)
    await flushCurrent()
    const data = await getScreenTime()
    expect(data[TODAY]).toBeUndefined()
  })

  it('flushes on pause and stops the active clock', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(25_000)
    await pauseTracking()
    const data = await getScreenTime()
    expect(data[TODAY]['github.com']).toBe(25)
    expect(getActiveTime()).toEqual({ domain: null, elapsed: 0 })
  })

  it('flushes the previous site when switching to a non-http url', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(20_000)
    await startTracking('about:blank')
    const data = await getScreenTime()
    expect(data[TODAY]['github.com']).toBe(20)
    expect(getActiveTime()).toEqual({ domain: null, elapsed: 0 })
  })

  it('reports live elapsed time without persisting it', async () => {
    await startTracking('https://github.com/foo')
    vi.advanceTimersByTime(12_000)
    expect(getActiveTime()).toEqual({ domain: 'github.com', elapsed: 12 })
    expect(await getScreenTime()).toEqual({})
  })
})
