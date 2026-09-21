import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { resetChromeStorage } from './setup'
import { setupScreenTimeTracking } from '../src/lib/trackingEvents'
import { pauseTracking, getActiveTime } from '../src/lib/screentime'

function event() {
  const listeners: ((...args: any[]) => void)[] = []
  return {
    addListener: (listener: (...args: any[]) => void) => listeners.push(listener),
    emit: (...args: any[]) => listeners.forEach(listener => listener(...args)),
  }
}

const nativeChrome = globalThis.chrome
let browser: ReturnType<typeof makeBrowser>
let win: { id: number; focused: boolean; type: string; state: string }
let tab: { id: number; active: boolean; url: string; audible: boolean; discarded: boolean; mutedInfo: { muted: boolean } }
let idle: string

function makeBrowser() {
  return {
    ...nativeChrome,
    windows: { getLastFocused: vi.fn(async () => ({ ...win })), onFocusChanged: event() },
    tabs: {
      query: vi.fn(async () => [{ ...tab }]),
      onActivated: event(), onRemoved: event(), onUpdated: event(),
    },
    idle: { queryState: vi.fn(async () => idle), setDetectionInterval: vi.fn(), onStateChanged: event() },
    alarms: { get: vi.fn(async () => undefined), create: vi.fn(async () => {}), onAlarm: event() },
  }
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-23T10:00:00'))
  await pauseTracking()
  resetChromeStorage()
  win = { id: 1, focused: true, type: 'normal', state: 'normal' }
  tab = { id: 1, active: true, url: 'https://github.com', audible: false, discarded: false, mutedInfo: { muted: false } }
  idle = 'active'
  browser = makeBrowser()
  vi.stubGlobal('chrome', browser)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('attributes same-tab navigation to the new domain', async () => {
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  vi.advanceTimersByTime(20_000)
  tab.url = 'https://example.com'
  browser.tabs.onUpdated.emit(1, { url: tab.url }, tab)
  await vi.advanceTimersByTimeAsync(0)
  expect(getActiveTime().domain).toBe('example.com')
  vi.advanceTimersByTime(10_000)
  const data = await tracking.snapshot()
  expect(data['2026-07-23']['github.com']).toBe(20)
  expect(data['2026-07-23']['example.com']).toBeCloseTo(10, 0)
})

it('never starts counting merely because a background tab activates', async () => {
  win.focused = false
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  browser.tabs.onActivated.emit({ tabId: 2, windowId: 2 })
  vi.advanceTimersByTime(30_000)
  expect(await tracking.snapshot()).toEqual({})
  expect(getActiveTime().domain).toBeNull()
})

it('stops counting idle playback when it becomes silent', async () => {
  idle = 'idle'
  tab.audible = true
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  vi.advanceTimersByTime(30_000)
  tab.audible = false
  browser.tabs.onUpdated.emit(1, { audible: false }, tab)
  await vi.advanceTimersByTimeAsync(0)
  expect(getActiveTime().domain).toBeNull()
  vi.advanceTimersByTime(30_000)
  expect((await tracking.snapshot())['2026-07-23']['github.com']).toBe(30)
})

it.each(['locked', 'idle'])('does not restart tracking while %s', async state => {
  idle = state
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  vi.advanceTimersByTime(30_000)
  expect(await tracking.snapshot()).toEqual({})
})

it('ignores stale focus-query results after focus is lost', async () => {
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  let finish!: (value: typeof win) => void
  browser.windows.getLastFocused.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = tracking.refresh()
  await Promise.resolve()
  win.focused = false
  const second = tracking.refresh()
  finish({ ...win, focused: true })
  await Promise.all([first, second])
  expect(getActiveTime().domain).toBeNull()
})

it('checkpoints through a browser alarm', async () => {
  const tracking = setupScreenTimeTracking()
  await tracking.refresh()
  expect(browser.alarms.create).toHaveBeenCalledWith('screentime-checkpoint', { periodInMinutes: 0.5 })
  vi.advanceTimersByTime(30_000)
  browser.alarms.onAlarm.emit({ name: 'screentime-checkpoint' })
  await vi.advanceTimersByTimeAsync(0)
  expect(getActiveTime().elapsed).toBe(0)
})
