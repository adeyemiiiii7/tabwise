import { Category } from '../types'

type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'

// Arc's sidebar-based tab UI does not implement chrome.tabs.group — skip grouping there.
const isArc = navigator.userAgent.includes('Arc/')

function groupTitle(category: Category): string {
  return category.emoji ? `${category.emoji} ${category.name}` : category.name
}

// Keyed `${windowId}:${categoryName}`. Lives for the service worker session only — rebuilt on demand when stale.
const groupCache = new Map<string, number>()

function cacheKey(windowId: number, categoryName: string): string {
  return `${windowId}:${categoryName}`
}

// Browser tab-strip mutations must be serialized across categories in a window.
const groupQueues = new Map<string, Promise<void>>()

function enqueue(key: string, op: () => Promise<void>): Promise<void> {
  const prev = groupQueues.get(key) ?? Promise.resolve()
  const next = prev.then(op, op).finally(() => {
    if (groupQueues.get(key) === next) groupQueues.delete(key)
  })
  groupQueues.set(key, next)
  return next
}

async function tabInWindow(tabId: number, windowId: number): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.get(tabId)
  if (tab.windowId !== windowId) throw new Error('Tab moved to another window; grouping cancelled')
  return tab
}

async function groupTab(tabId: number, groupId: number, windowId: number): Promise<number> {
  // A queued categorization may finish after the user drags the tab or group.
  const [tab, group] = await Promise.all([
    tabInWindow(tabId, windowId),
    chrome.tabGroups.get(groupId),
  ])
  if (group.windowId !== tab.windowId) throw new Error('Group moved to another window; grouping cancelled')
  return new Promise((resolve, reject) => {
    chrome.tabs.group({ tabIds: [tabId], groupId }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(id)
    })
  })
}

async function createGroup(tabId: number, windowId: number): Promise<number> {
  await tabInWindow(tabId, windowId)
  return new Promise((resolve, reject) => {
    // The API defaults to the current window, NOT the tab's window.
    chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(id)
    })
  })
}

async function doMove(tabId: number, windowId: number, category: Category): Promise<void> {
  if (isArc) return
  const currentTab = await tabInWindow(tabId, windowId)
  const key = cacheKey(windowId, category.name)
  const matches = (group: chrome.tabGroups.TabGroup) => group.windowId === windowId &&
    (group.title === groupTitle(category) || group.title === category.name)

  // Guard against onCreated + onUpdated double-processing the same tab.
  if (currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    const currentGroup = await chrome.tabGroups.get(currentTab.groupId).catch(() => null)
    if (currentGroup && matches(currentGroup)) {
      groupCache.set(key, currentGroup.id)
      return
    }
  }

  const cached = groupCache.get(key)
  if (cached !== undefined) {
    const group = await chrome.tabGroups.get(cached).catch(() => null)
    if (group && matches(group)) {
      await groupTab(tabId, cached, windowId)
      return
    }
    groupCache.delete(key)
  }

  // Match by both title and window, including when two windows use the same category.
  const allGroups = await chrome.tabGroups.query({})
  const match = allGroups.find(matches)
  if (match) {
    await groupTab(tabId, match.id, windowId)
    groupCache.set(key, match.id)
    return
  }

  const groupId = await createGroup(tabId, windowId)
  await chrome.tabGroups.update(groupId, {
    title: groupTitle(category),
    color: colorFromHex(category.color),
  })
  groupCache.set(key, groupId)
}

export function moveTabToCategory(tabId: number, windowId: number, category: Category): Promise<void> {
  return enqueue(String(windowId), () => doMove(tabId, windowId, category))
}

// Pre-register a group ID under a new category name before the browser group is renamed.
// Call this in SYNC_GROUPS BEFORE chrome.tabGroups.update so concurrent handleTab calls
// find the existing group instead of creating a duplicate.
export function preCacheGroupRename(windowId: number, oldName: string, newName: string, groupId: number): void {
  groupCache.delete(cacheKey(windowId, oldName))
  groupCache.set(cacheKey(windowId, newName), groupId)
}

// Clears cached group IDs for a window (call when a group is known to be gone)
export function invalidateGroupCache(windowId?: number): void {
  if (windowId === undefined) {
    groupCache.clear()
  } else {
    for (const k of groupCache.keys()) {
      if (k.startsWith(`${windowId}:`)) groupCache.delete(k)
    }
  }
}

export function moveGroupToNewWindow(groupId: number, sourceWindowId: number): Promise<void> {
  return enqueue(String(sourceWindowId), async () => {
    const group = await chrome.tabGroups.get(groupId)
    if (group.windowId !== sourceWindowId) throw new Error('Group has moved to another window')
    const tabs = await chrome.tabs.query({ windowId: sourceWindowId, groupId })
    const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined)
    if (tabIds.length === 0) throw new Error('Group has no tabs')

    let newWindowId: number | undefined
    try {
      const newWindow = await chrome.windows.create({ tabId: tabIds[0], focused: false })
      newWindowId = newWindow?.id
      if (newWindowId === undefined) throw new Error('Could not create window')

      if (tabIds.length > 1) {
        await chrome.tabs.move(tabIds.slice(1) as [number, ...number[]], { windowId: newWindowId, index: -1 })
      }

      const newTabs = await chrome.tabs.query({ windowId: newWindowId })
      const newTabIds = newTabs.filter(t => t.id !== undefined && tabIds.includes(t.id)).map(t => t.id!)
      if (newTabIds.length === 0) throw new Error('Moved tabs no longer available')

      const newGroupId = await new Promise<number>((resolve, reject) => {
        chrome.tabs.group({
          tabIds: newTabIds as [number, ...number[]],
          createProperties: { windowId: newWindowId },
        }, id => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else resolve(id)
        })
      })
      await chrome.tabGroups.update(newGroupId, { title: group.title, color: group.color })
    } finally {
      invalidateGroupCache(sourceWindowId)
      if (newWindowId !== undefined) invalidateGroupCache(newWindowId)
    }
  })
}

export function colorFromHex(hex: string): TabGroupColor {
  const colorMap: Record<string, TabGroupColor> = {
    '#4A90D9': 'blue',
    '#7ED321': 'green',
    '#F5A623': 'orange',
    '#D0021B': 'red',
    '#9B59B6': 'purple',
    '#1ABC9C': 'cyan',
    '#E91E63': 'pink',
  }
  return colorMap[hex] ?? 'grey'
}
