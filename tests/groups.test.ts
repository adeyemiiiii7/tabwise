import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { moveTabToCategory, moveGroupToNewWindow, invalidateGroupCache } from '../src/lib/groups'

const originalChrome = globalThis.chrome
const school = { id: 'school', name: 'School', color: '#F5A623' }
const work = { id: 'work', name: 'Work', color: '#4A90D9' }
type Tab = { id: number; windowId: number; groupId: number }
type Group = { id: number; windowId: number; title?: string; color: string }
type GroupOptions = { tabIds: number[]; groupId?: number; createProperties?: { windowId?: number } }
let tabs: Map<number, Tab>
let groups: Map<number, Group>
let focusedWindow: number
let browser: ReturnType<typeof makeBrowser>

function makeBrowser() {
  let nextId = 10
  return {
    ...originalChrome,
    runtime: { lastError: undefined as { message: string } | undefined },
    windows: {
      create: vi.fn(async ({ tabId }: { tabId: number; focused: boolean }) => {
        Object.assign(tabs.get(tabId)!, { windowId: 3, groupId: -1 })
        return { id: 3 }
      }),
    },
    tabs: {
      get: vi.fn(async (id: number) => {
        const tab = tabs.get(id)
        if (!tab) throw new Error('Tab not found')
        return { ...tab }
      }),
      query: vi.fn(async ({ windowId, groupId }: { windowId: number; groupId?: number }) =>
        [...tabs.values()].filter(t => t.windowId === windowId && (groupId === undefined || t.groupId === groupId))
          .map(t => ({ ...t }))),
      move: vi.fn(async (ids: number[], { windowId }: { windowId: number; index: number }) => {
        for (const id of ids) Object.assign(tabs.get(id)!, { windowId, groupId: -1 })
      }),
      group: vi.fn((options: GroupOptions, callback: (id: number) => void) => {
        const id = options.groupId ?? nextId++
        // Model the browser default, so omitting windowId actually moves tabs
        // to the focused window instead of passing a call-shape-only test.
        const windowId = options.groupId === undefined
          ? options.createProperties?.windowId ?? focusedWindow
          : groups.get(id)!.windowId
        groups.set(id, groups.get(id) ?? { id, windowId, color: 'grey' })
        for (const tabId of options.tabIds) Object.assign(tabs.get(tabId)!, { windowId, groupId: id })
        callback(id)
      }),
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      query: vi.fn(async () => [...groups.values()].map(g => ({ ...g }))),
      get: vi.fn(async (id: number) => {
        const group = groups.get(id)
        if (!group) throw new Error('Group not found')
        return { ...group }
      }),
      update: vi.fn(async (id: number, update: { title?: string; color: string }) => {
        Object.assign(groups.get(id)!, update)
      }),
    },
  }
}

beforeEach(() => {
  invalidateGroupCache()
  tabs = new Map([
    [1, { id: 1, windowId: 1, groupId: -1 }],
    [2, { id: 2, windowId: 1, groupId: -1 }],
    [3, { id: 3, windowId: 2, groupId: -1 }],
  ])
  groups = new Map()
  focusedWindow = 2
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
  groups.get(tabs.get(1)!.groupId)!.windowId = 2
  tabs.get(1)!.windowId = 2
  await moveTabToCategory(2, 1, school)
  expect(tabs.get(2)!.windowId).toBe(1)
  expect(tabs.get(2)!.groupId).not.toBe(tabs.get(1)!.groupId)
})

it('keeps two single-tab windows separate when the background tab is organized', async () => {
  tabs.delete(2)
  await moveTabToCategory(1, 1, school)
  expect(tabs.get(1)!.windowId).toBe(1)
  expect(tabs.get(3)!.windowId).toBe(2)
  expect(groups.get(tabs.get(1)!.groupId)!.windowId).toBe(1)
})

it('creates separate groups for the same category in two windows', async () => {
  await Promise.all([moveTabToCategory(1, 1, school), moveTabToCategory(3, 2, school)])
  expect(tabs.get(1)!.windowId).toBe(1)
  expect(tabs.get(3)!.windowId).toBe(2)
  expect(tabs.get(1)!.groupId).not.toBe(tabs.get(3)!.groupId)
})

it('uses an existing category group only in the tab’s own window', async () => {
  groups.set(20, { id: 20, windowId: 2, title: 'School', color: 'orange' })
  groups.set(21, { id: 21, windowId: 1, title: 'School', color: 'orange' })
  await moveTabToCategory(1, 1, school)
  expect(tabs.get(1)).toMatchObject({ windowId: 1, groupId: 21 })
})

it('cancels a delayed categorization if the tab was dragged to another window', async () => {
  tabs.get(1)!.windowId = 2
  await expect(moveTabToCategory(1, 1, school)).rejects.toThrow('Tab moved')
  expect(browser.tabs.group).not.toHaveBeenCalled()
  expect(tabs.get(1)!.windowId).toBe(2)
})

it('rechecks the tab after an asynchronous group lookup', async () => {
  browser.tabGroups.query.mockImplementationOnce(async () => {
    tabs.get(1)!.windowId = 2
    return []
  })
  await expect(moveTabToCategory(1, 1, school)).rejects.toThrow('Tab moved')
  expect(browser.tabs.group).not.toHaveBeenCalled()
})

it('does not follow an existing group that moved during lookup', async () => {
  groups.set(20, { id: 20, windowId: 1, title: 'School', color: 'orange' })
  browser.tabGroups.query.mockImplementationOnce(async () => {
    const snapshot = { ...groups.get(20)! }
    groups.get(20)!.windowId = 2
    return [snapshot]
  })
  await expect(moveTabToCategory(1, 1, school)).rejects.toThrow('Group moved')
  expect(browser.tabs.group).not.toHaveBeenCalled()
  expect(tabs.get(1)!.windowId).toBe(1)
})

it('keeps explicitly moved tabs in the newly created unfocused window', async () => {
  groups.set(20, { id: 20, windowId: 1, title: 'School', color: 'orange' })
  tabs.get(1)!.groupId = 20
  tabs.get(2)!.groupId = 20
  await moveGroupToNewWindow(20, 1)
  expect(browser.windows.create).toHaveBeenCalledWith({ tabId: 1, focused: false })
  expect(tabs.get(1)!.windowId).toBe(3)
  expect(tabs.get(2)!.windowId).toBe(3)
  expect(tabs.get(3)!.windowId).toBe(2)
  expect(tabs.get(1)!.groupId).toBe(tabs.get(2)!.groupId)
  expect(groups.get(tabs.get(1)!.groupId)).toMatchObject({ windowId: 3, title: 'School', color: 'orange' })
})

it('rejects a stale New window request instead of moving a different group', async () => {
  groups.set(20, { id: 20, windowId: 2, title: 'School', color: 'orange' })
  await expect(moveGroupToNewWindow(20, 1)).rejects.toThrow('Group has moved')
  expect(browser.windows.create).not.toHaveBeenCalled()
})
