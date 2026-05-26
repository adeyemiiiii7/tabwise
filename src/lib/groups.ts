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

// Serialises mutations per window+category to prevent concurrent handleTab calls from creating duplicate groups.
const groupQueues = new Map<string, Promise<void>>()

function enqueue(key: string, op: () => Promise<void>): Promise<void> {
  const prev = groupQueues.get(key) ?? Promise.resolve()
  const next = prev.then(op, op) // keep the queue draining even if op throws
  groupQueues.set(key, next)
  return next
}

async function tabExists(tabId: number): Promise<boolean> {
  try { await chrome.tabs.get(tabId); return true } catch { return false }
}

function groupTab(tabId: number, groupId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.group({ tabIds: [tabId], groupId }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(id)
    })
  })
}

function createGroup(tabId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.group({ tabIds: [tabId] }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(id)
    })
  })
}

async function doMove(tabId: number, windowId: number, category: Category): Promise<void> {
  if (isArc) return
  if (!await tabExists(tabId)) return

  const key = cacheKey(windowId, category.name)

  // Guard against onCreated + onUpdated double-processing the same tab.
  try {
    const currentTab = await chrome.tabs.get(tabId)
    if (currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      const currentGroup = await chrome.tabGroups.get(currentTab.groupId)
      if (currentGroup.title === groupTitle(category) || currentGroup.title === category.name) {
        groupCache.set(key, currentGroup.id) // keep cache warm
        return
      }
    }
  } catch { /* tab or group gone — proceed normally */ }

  const cached = groupCache.get(key)
  if (cached !== undefined) {
    try {
      await chrome.tabGroups.get(cached)
      await groupTab(tabId, cached)
      return
    } catch {
      groupCache.delete(key) // stale — fall through
    }
  }

  // 2. Query ALL groups (no windowId filter — more reliable across browser builds)
  //    then match by title + windowId manually.
  const allGroups = await chrome.tabGroups.query({})
  const expectedTitle = groupTitle(category)
  const match = allGroups.find(g =>
    g.windowId === windowId &&
    (g.title === expectedTitle || g.title === category.name)
  )

  if (match) {
    try {
      await groupTab(tabId, match.id)
      groupCache.set(key, match.id)
      return
    } catch {
      groupCache.delete(key)
      // Group dissolved between query and add — fall through to create
    }
  }

  if (!await tabExists(tabId)) return

  const groupId = await createGroup(tabId)
  await chrome.tabGroups.update(groupId, {
    title: groupTitle(category),
    color: colorFromHex(category.color),
  })
  groupCache.set(key, groupId)
}

export function moveTabToCategory(tabId: number, windowId: number, category: Category): Promise<void> {
  const key = cacheKey(windowId, category.name)
  return enqueue(key, () => doMove(tabId, windowId, category).catch(err => {
    if (err instanceof Error && err.message.includes('Tab not found')) return
    console.error('[Tabwise] moveTabToCategory failed:', err)
  }))
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

export async function moveGroupToNewWindow(groupTitle: string, sourceWindowId: number): Promise<void> {
  try {
    const groups = await chrome.tabGroups.query({ windowId: sourceWindowId, title: groupTitle })
    if (groups.length === 0) return

    const groupId = groups[0].id
    const groupColor = groups[0].color as TabGroupColor
    const tabs = await chrome.tabs.query({ windowId: sourceWindowId, groupId })
    if (tabs.length === 0) return

    const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined)
    if (tabIds.length === 0) return

    const newWindow = await chrome.windows.create({ tabId: tabIds[0], focused: false })
    const newWindowId = newWindow?.id
    if (!newWindowId) return

    if (tabIds.length > 1) {
      await chrome.tabs.move(tabIds.slice(1) as [number, ...number[]], { windowId: newWindowId, index: -1 })
    }

    const newTabs = await chrome.tabs.query({ windowId: newWindowId })
    const newTabIds = newTabs.map(t => t.id).filter((id): id is number => id !== undefined)
    if (newTabIds.length === 0) return

    const newGroupId = await new Promise<number>((resolve, reject) => {
      chrome.tabs.group({ tabIds: newTabIds as [number, ...number[]] }, id => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve(id)
      })
    })
    await chrome.tabGroups.update(newGroupId, { title: groupTitle, color: groupColor })

    // Invalidate cache for both windows since group IDs changed
    invalidateGroupCache(sourceWindowId)
    invalidateGroupCache(newWindowId)
  } catch {
    // Window or tab disappeared — ignore
  }
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
