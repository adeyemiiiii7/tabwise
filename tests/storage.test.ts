import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetChromeStorage } from './setup'
import {
  getSettings,
  getTabRecords,
  updateTabRecords,
  updateScreenTime,
  getScreenTime,
  getLearnedSites,
  saveLearnedSite,
} from '../src/lib/storage'
import { TabRecord, DEFAULT_SETTINGS, Settings } from '../src/types'

function makeRecord(tabId: number): TabRecord {
  return {
    tabId,
    url: `https://site${tabId}.com/`,
    title: `Site ${tabId}`,
    domain: `site${tabId}.com`,
    category: 'Work',
    lastVisited: Date.now(),
  }
}

beforeEach(() => {
  resetChromeStorage()
})

describe('write serialization', () => {
  it('does not lose concurrent tab record updates', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        updateTabRecords(records => [...records, makeRecord(i)])
      )
    )
    const records = await getTabRecords()
    expect(records).toHaveLength(10)
  })

  it('does not lose concurrent screen time accumulations', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        updateScreenTime(data => {
          const day = { ...data['2026-07-23'] }
          day['github.com'] = (day['github.com'] ?? 0) + 5
          return { ...data, '2026-07-23': day }
        })
      )
    )
    const data = await getScreenTime()
    expect(data['2026-07-23']['github.com']).toBe(100)
  })

  it('does not lose concurrent learned site saves', async () => {
    await Promise.all([
      saveLearnedSite('a.com', 'Work'),
      saveLearnedSite('b.com', 'Personal'),
      saveLearnedSite('c.com', 'School'),
    ])
    const learned = await getLearnedSites()
    expect(learned).toEqual({ 'a.com': 'Work', 'b.com': 'Personal', 'c.com': 'School' })
  })

  it('keeps the queue alive after a failing operation', async () => {
    await expect(
      updateTabRecords(() => { throw new Error('boom') })
    ).rejects.toThrow('boom')
    await updateTabRecords(records => [...records, makeRecord(1)])
    expect(await getTabRecords()).toHaveLength(1)
  })
})

describe('settings cache', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('serves repeat reads from cache without hitting storage', async () => {
    const stored: Settings = { ...DEFAULT_SETTINGS, apiKey: 'k1' }
    await chrome.storage.local.set({ settings: stored })
    await getSettings()
    const getSpy = vi.spyOn(chrome.storage.local, 'get')
    expect(await getSettings()).toEqual(stored)
    expect(getSpy).not.toHaveBeenCalled()
    getSpy.mockRestore()
  })

  it('invalidates the cache when settings change in storage', async () => {
    await getSettings()
    const updated: Settings = { ...DEFAULT_SETTINGS, apiKey: 'fresh' }
    await chrome.storage.local.set({ settings: updated })
    expect(await getSettings()).toEqual(updated)
  })
})
