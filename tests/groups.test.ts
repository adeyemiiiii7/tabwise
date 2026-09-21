import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { moveTabToCategory, invalidateGroupCache } from '../src/lib/groups'

const originalChrome = globalThis.chrome
const school = { id: 'school', name: 'School', color: '#F5A623' }
const work = { id: 'work', name: 'Work', color: '#4A90D9' }
let browser: ReturnType<typeof makeBrowser>

function makeBrowser() {
  let nextId = 10
  return {
    ...originalChrome,
    runtime: { lastError: undefined as { message: string } | undefined },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, windowId: 1, groupId: -1 })),
      group: vi.fn((_options: unknown, callback: (id: number) => void) => { callback(nextId++) }),
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      query: vi.fn(async () => []),
      get: vi.fn(async (id: number) => ({ id, windowId: 1 })),
      update: vi.fn(async () => {}),
    },
  }
}

beforeEach(() => {
  invalidateGroupCache()
  browser = makeBrowser()
  vi.stubGlobal('chrome', browser)
})
afterEach(() => vi.unstubAllGlobals())

it('serializes group mutations even for different categories in the same window', async () => {
  let release!: () => void
  browser.tabGroups.update.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const first = moveTabToCategory(1, 1, school)
  const second = moveTabToCategory(2, 1, work)
  await vi.waitFor(() => expect(browser.tabGroups.update).toHaveBeenCalledOnce())
  expect(browser.tabs.group).toHaveBeenCalledOnce()
  release()
  await Promise.all([first, second])
  expect(browser.tabs.group).toHaveBeenCalledTimes(2)
})

it('reports browser grouping failures and continues processing subsequent tabs', async () => {
  browser.tabs.group.mockImplementationOnce((_options, callback) => {
    browser.runtime.lastError = { message: 'Tabs cannot be edited right now' }
    callback(-1)
    browser.runtime.lastError = undefined
  })
  await expect(moveTabToCategory(1, 1, school)).rejects.toThrow('Tabs cannot be edited')
  await expect(moveTabToCategory(2, 1, work)).resolves.toBeUndefined()
  expect(browser.tabGroups.update).toHaveBeenCalledOnce()
})

it('does not reuse a cached group that has moved to a different window', async () => {
  await moveTabToCategory(1, 1, school)
  browser.tabGroups.get.mockResolvedValueOnce({ id: 10, windowId: 2 })
  await moveTabToCategory(2, 1, school)
  expect(browser.tabs.group).toHaveBeenLastCalledWith({ tabIds: [2] }, expect.any(Function))
})
