import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { resetChromeStorage } from './setup'
import { readScreenTime } from '../src/lib/screenTimeClient'

const originalChrome = globalThis.chrome
const saved = { '2026-07-23': { 'github.com': 30 } }
const sendMessage = vi.fn()

beforeEach(async () => {
  resetChromeStorage()
  await chrome.storage.local.set({ screentime: saved })
  sendMessage.mockReset()
  vi.stubGlobal('chrome', { ...originalChrome, runtime: { sendMessage } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('uses the worker’s coherent snapshot instead of stale saved totals', async () => {
  const snapshot = { '2026-07-23': { 'github.com': 40 } }
  sendMessage.mockResolvedValue(snapshot)
  expect(await readScreenTime()).toEqual(snapshot)
})

it('keeps saved statistics available if the worker fails', async () => {
  sendMessage.mockRejectedValue(new Error('Worker unavailable'))
  expect(await readScreenTime()).toEqual(saved)
})

it('does not leave the popup waiting indefinitely for a worker response', async () => {
  vi.useFakeTimers()
  sendMessage.mockReturnValue(new Promise(() => {}))
  const result = readScreenTime()
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toEqual(saved)
})
