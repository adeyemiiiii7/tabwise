import { getSettings, getLearnedSites, saveLearnedSite, saveSiteMemoryHint } from '../lib/storage'
import { getProvider, QuotaExceededError } from '../lib/ai'
import { isValidTab, tabToRecord, getDomain } from '../lib/tabs'
import { moveTabToCategory, moveGroupToNewWindow, invalidateGroupCache, colorFromHex } from '../lib/groups'
import { startTracking, flushCurrent, pauseTracking, getActiveTime, resumeTracking } from '../lib/screentime'
import { setupAlarm, onAlarm } from '../lib/scheduler'
import { getTabRecords, saveTabRecords, getQuotaBlock, setQuotaBlock, clearQuotaBlock, isQuotaBlockedToday } from '../lib/storage'
import { matchCategory, CategoryNotFoundError } from '../lib/categorizer'
import { buildRAGContext, recordAPICall } from '../lib/rag'
import { offlineCategorize, NoCategoryDecisionError } from '../lib/offlineCategorizer'
import { isAmbiguous } from '../lib/knownSites'
import { PageMetadata, Category } from '../types'

let cachedRAGContext: Awaited<ReturnType<typeof buildRAGContext>> | null = null

async function getRAGContext(settings: Parameters<typeof buildRAGContext>[0]) {
  if (!cachedRAGContext) {
    cachedRAGContext = await buildRAGContext(settings)
  }
  return cachedRAGContext
}

function invalidateRAGCache() {
  cachedRAGContext = null
}

// Prevents onCreated + onUpdated from double-processing the same tab and stops SPA
// navigation from re-grouping on every route change.
const lastHandled = new Map<number, string>()

// Held during settings sync so handleTab skips and avoids creating race duplicates.
let syncLock = false

// On every SW activation: recover which URL was being tracked before SW was killed,
// then find the actual active tab and start fresh tracking from now.
;(async () => {
  await resumeTracking()
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (tab?.url) await startTracking(tab.url)
  } catch { /* no active tab yet */ }
})()

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings()
  if (!settings.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
  setupAlarm(settings.inactivityThresholdHours)
})

async function fetchPageMetadata(tabId: number): Promise<PageMetadata | null> {
  try {
    const reply = chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_METADATA' })
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
    const result = await Promise.race([reply, timeout])
    if (!result || typeof result !== 'object') return null
    return result as PageMetadata
  } catch {
    return null
  }
}

async function applyOfflineDecision(
  tabId: number,
  windowId: number,
  domain: string,
  url: string,
  title: string,
  categoryNames: string[],
  metadata: PageMetadata | null,
  categories: Category[],
  ambiguous: boolean,
  tab: chrome.tabs.Tab,
): Promise<void> {
  try {
    const result = offlineCategorize(url, title, categoryNames, metadata)
    const category = matchCategory(result.category, categories)
    await moveTabToCategory(tabId, windowId, category)
    await updateRecord(tab, category.name)
    const mode = (ambiguous || result.confidence !== 'high') ? 'ask' : 'confirm'
    sendToast(tabId, domain, category.name, categoryNames, mode)
  } catch (err) {
    if (err instanceof NoCategoryDecisionError || err instanceof CategoryNotFoundError) {
      sendToast(tabId, domain, null, categoryNames, 'ask')
      return
    }
    throw err
  }
}

async function handleTab(tab: chrome.tabs.Tab): Promise<void> {
  const url = tab.url ?? ''
  const title = tab.title ?? ''
  if (!isValidTab(url) || !tab.id || !tab.windowId) return
  if (syncLock) return

  if (lastHandled.get(tab.id) === url) return
  lastHandled.set(tab.id, url)

  try {
    const win = await chrome.windows.get(tab.windowId)
    if (win.type !== 'normal') return
  } catch { return }

  const settings = await getSettings()
  if (!settings.onboardingComplete) return

  const tabId = tab.id
  const windowId = tab.windowId
  const domain = getDomain(url)
  const categoryNames = settings.categories.map(c => c.name)
  const learned = await getLearnedSites()
  const ambiguous = isAmbiguous(domain)

  if (learned[domain] && categoryNames.includes(learned[domain])) {
    const category = matchCategory(learned[domain], settings.categories)
    await moveTabToCategory(tabId, windowId, category)
    await updateRecord(tab, category.name)
    return
  }

  const metadata = await fetchPageMetadata(tabId)

  if (!settings.apiKey || !(settings.useAI ?? true)) {
    await applyOfflineDecision(tabId, windowId, domain, url, title, categoryNames, metadata, settings.categories, ambiguous, tab)
    return
  }

  const quotaBlock = await getQuotaBlock()
  if (quotaBlock && isQuotaBlockedToday(quotaBlock)) {
    await applyOfflineDecision(tabId, windowId, domain, url, title, categoryNames, metadata, settings.categories, ambiguous, tab)
    return
  }

  const ragContext = await getRAGContext(settings)
  const provider = getProvider(settings.provider, settings.apiKey)

  try {
    const result = await provider.categorize(url, title, categoryNames, ragContext.systemPrompt)
    await recordAPICall(result.inputTokens, result.outputTokens)
    if (quotaBlock) await clearQuotaBlock()
    const category = matchCategory(result.category, settings.categories)
    await moveTabToCategory(tabId, windowId, category)
    await updateRecord(tab, category.name)
    sendToast(tabId, domain, category.name, categoryNames, ambiguous ? 'ask' : 'confirm')
    return
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await handleQuotaExceeded(err.provider)
      await applyOfflineDecision(tabId, windowId, domain, url, title, categoryNames, metadata, settings.categories, ambiguous, tab)
      return
    }
    if (err instanceof CategoryNotFoundError) {
      console.warn('[Tabwise] AI returned unmatchable category — using offline:', err.message)
      await recordAPICall(0, 0)
      await applyOfflineDecision(tabId, windowId, domain, url, title, categoryNames, metadata, settings.categories, ambiguous, tab)
      return
    }
    console.error('[Tabwise] AI categorization failed:', err)
    await recordAPICall(0, 0)
    await applyOfflineDecision(tabId, windowId, domain, url, title, categoryNames, metadata, settings.categories, ambiguous, tab)
  }
}

async function handleQuotaExceeded(providerName: string): Promise<void> {
  const existing = await getQuotaBlock()
  if (existing && isQuotaBlockedToday(existing)) return // already notified today
  await setQuotaBlock(providerName)
  chrome.notifications.create('tabwise-quota-exceeded', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/48.png'),
    title: 'Tabwise: API quota reached',
    message: `Your ${providerName} daily quota is used up. Tabwise will keep organising your tabs using smart pattern matching until your quota resets at midnight UTC. Check AI Usage in the dashboard.`,
  })
}

function sendToast(
  tabId: number,
  domain: string,
  category: string | null,
  categories: string[],
  mode: 'ask' | 'confirm'
) {
  let attempts = 0
  function attempt() {
    chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', domain, category, categories, tabId, mode })
      .catch(() => {
        if (++attempts < 3) setTimeout(attempt, 1000)
      })
  }
  attempt()
}

async function updateRecord(tab: chrome.tabs.Tab, categoryName: string) {
  const records = await getTabRecords()
  const record = tabToRecord(tab, categoryName)
  const updated = records.filter(r => r.tabId !== tab.id)
  await saveTabRecords([...updated, record])
}

function recordCategorizedTab(records: import('../types').TabRecord[], tab: chrome.tabs.Tab, categoryName: string): void {
  const record = tabToRecord(tab, categoryName)
  const idx = records.findIndex(r => r.tabId === tab.id)
  if (idx >= 0) records[idx] = record
  else records.push(record)
}

chrome.tabs.onCreated.addListener(tab => {
  setTimeout(() => {
    if (!tab.id) return
    chrome.tabs.get(tab.id, updated => {
      if (chrome.runtime.lastError) return
      handleTab(updated).catch(() => {})
    })
  }, 3000)
})

chrome.tabs.onUpdated.addListener((_, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  const url = tab.url ?? ''
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('dia://')) return
  handleTab(tab).catch(() => {})
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab.url) await startTracking(tab.url)
  } catch { /* tab gone */ }
})

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    pauseTracking().catch(() => {})
    return
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (tab?.url) await startTracking(tab.url)
  } catch { /* window gone */ }
})

setInterval(() => { flushCurrent().catch(() => {}) }, 30_000)

chrome.tabs.onRemoved.addListener(tabId => {
  lastHandled.delete(tabId)
  flushCurrent().catch(() => {})
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'INVALIDATE_CACHE') {
    invalidateRAGCache()
    sendResponse({ success: true })
    return true
  }

  if (message.type === 'GET_ACTIVE_TIME') {
    sendResponse(getActiveTime())
    return true
  }

  if (message.type === 'PAGE_MEMORY_SIGNALS') {
    saveSiteMemoryHint(message.domain, {
      heapMB: message.heapMB,
      hasVideo: message.hasVideo,
      hasCanvas: message.hasCanvas,
      recordedAt: Date.now(),
    }).catch(() => {})
    return false
  }

  if (message.type === 'REASSIGN_TAB') {
    ;(async () => {
      try {
        const settings = await getSettings()
        const category = settings.categories.find(c => c.name === message.category)
        if (!category) { sendResponse({ success: false }); return }

        const tab = await chrome.tabs.get(message.tabId)
        if (!tab.windowId) { sendResponse({ success: false }); return }

        await moveTabToCategory(message.tabId, tab.windowId, category)

        if (message.learnDomain) {
          await saveLearnedSite(message.learnDomain, category.name)
          invalidateRAGCache()
        }

        const records = await getTabRecords()
        const updated = records.map(r =>
          r.tabId === message.tabId ? { ...r, category: category.name } : r
        )
        await saveTabRecords(updated)
        sendResponse({ success: true })
      } catch { sendResponse({ success: false }) }
    })()
    return true
  }

  if (message.type === 'MOVE_GROUP_TO_WINDOW') {
    ;(async () => {
      try {
        const windows = await chrome.windows.getAll({ populate: false })
        const focused = windows.find(w => w.focused) ?? windows[0]
        if (!focused?.id) { sendResponse({ success: false }); return }
        await moveGroupToNewWindow(message.groupTitle, focused.id)
        sendResponse({ success: true })
      } catch { sendResponse({ success: false }) }
    })()
    return true
  }

  if (message.type === 'SYNC_GROUPS') {
    ;(async () => {
      syncLock = true
      try {
        const [settings, tabRecords, allTabs, allGroups] = await Promise.all([
          getSettings(),
          getTabRecords(),
          chrome.tabs.query({}),
          chrome.tabGroups.query({}),
        ])

        function catTitle(cat: { name: string; emoji?: string }) {
          return cat.emoji ? `${cat.emoji} ${cat.name}` : cat.name
        }

        for (const group of allGroups) {
          const tabsInGroup = allTabs.filter(t => t.groupId === group.id && t.url?.startsWith('http'))
          const catCount = new Map<string, number>()
          for (const tab of tabsInGroup) {
            const domain = getDomain(tab.url!)
            const rec = tabRecords.find(r => r.domain === domain) ?? tabRecords.find(r => r.tabId === tab.id)
            if (rec?.category) catCount.set(rec.category, (catCount.get(rec.category) ?? 0) + 1)
          }
          let winCat = '', winCount = 0
          for (const [cat, n] of catCount) { if (n > winCount) { winCat = cat; winCount = n } }
          const newCat = settings.categories.find(c => c.name === winCat)
          if (!newCat) continue
          await chrome.tabGroups.update(group.id, {
            title: catTitle(newCat),
            color: colorFromHex(newCat.color),
          })
        }

        invalidateGroupCache()
        const freshGroups = await chrome.tabGroups.query({})
        const freshTabs  = await chrome.tabs.query({})
        const byWindow = new Map<number, Map<string, number[]>>()
        for (const g of freshGroups) {
          if (!g.title || !g.windowId) continue
          if (!byWindow.has(g.windowId)) byWindow.set(g.windowId, new Map())
          const m = byWindow.get(g.windowId)!
          m.set(g.title, [...(m.get(g.title) ?? []), g.id])
        }
        for (const titleMap of byWindow.values()) {
          for (const [, ids] of titleMap) {
            if (ids.length <= 1) continue
            const keepId = ids[0]
            for (const dupId of ids.slice(1)) {
              const toMove = freshTabs.filter(t => t.groupId === dupId && t.id).map(t => t.id!)
              if (toMove.length > 0) {
                await chrome.tabs.group({ tabIds: toMove as [number, ...number[]], groupId: keepId })
              }
            }
          }
        }

        sendResponse({ success: true })
      } catch {
        sendResponse({ success: false })
      } finally {
        syncLock = false
      }
    })()
    return true
  }

  if (message.type === 'REORGANIZE_ALL') {
    ;(async () => {
      const settings = await getSettings()
      if (!settings.onboardingComplete) {
        sendResponse({ success: false, count: 0 }); return
      }
      const tabs = await chrome.tabs.query({})
      const validTabs = tabs.filter(t => t.url && isValidTab(t.url) && t.id && t.windowId)
      const categoryNames = settings.categories.map(c => c.name)
      const learned = await getLearnedSites()
      const quotaBlock = await getQuotaBlock()
      const inOfflineMode = !settings.apiKey || !(settings.useAI ?? true) || !!(quotaBlock && isQuotaBlockedToday(quotaBlock))

      let ragContext: Awaited<ReturnType<typeof buildRAGContext>> | null = null
      let provider = inOfflineMode ? null : getProvider(settings.provider, settings.apiKey)
      if (!inOfflineMode) ragContext = await getRAGContext(settings)

      let count = 0
      const records = await getTabRecords()
      const updatedRecords = [...records]

      for (const tab of validTabs) {
        const tabId = tab.id!
        const windowId = tab.windowId!
        const url = tab.url!
        const title = tab.title ?? ''
        const domain = getDomain(url)

        try {
          if (learned[domain] && categoryNames.includes(learned[domain])) {
            const category = matchCategory(learned[domain], settings.categories)
            await moveTabToCategory(tabId, windowId, category)
            recordCategorizedTab(updatedRecords, tab, category.name)
            count++
            continue
          }

          let metadata: PageMetadata | null = null
          let categoryName: string | null = null

          if (!inOfflineMode) {
            try {
              const result = await provider!.categorize(url, title, categoryNames, ragContext!.systemPrompt)
              categoryName = result.category
              await recordAPICall(result.inputTokens, result.outputTokens)
            } catch (err) {
              if (err instanceof QuotaExceededError) {
                await handleQuotaExceeded(err.provider)
              } else if (err instanceof CategoryNotFoundError) {
                console.warn('[Tabwise] REORGANIZE AI returned unmatchable category for', url, err.message)
                await recordAPICall(0, 0)
              } else {
                console.error('[Tabwise] REORGANIZE AI failed for', url, err)
                await recordAPICall(0, 0)
              }
            }
          }

          if (!categoryName) {
            metadata = await fetchPageMetadata(tabId)
            const result = offlineCategorize(url, title, categoryNames, metadata)
            categoryName = result.category
          }

          const category = matchCategory(categoryName, settings.categories)
          await moveTabToCategory(tabId, windowId, category)
          recordCategorizedTab(updatedRecords, tab, category.name)
          count++
        } catch (err) {
          if (err instanceof NoCategoryDecisionError || err instanceof CategoryNotFoundError) {
            // User-initiated bulk reorg: leave tab ungrouped silently; per-tab
            // toasts would spam. Single-tab path (handleTab) still prompts.
            continue
          }
          // tab disappeared mid-loop or other transient error — skip
        }
      }

      await saveTabRecords(updatedRecords)
      sendResponse({ success: true, count })
    })()
    return true
  }

  return false
})

onAlarm(async () => {
  const settings = await getSettings()
  const thresholdMs = settings.inactivityThresholdHours * 60 * 60 * 1000
  const records = await getTabRecords()
  const stale = records.filter(r => Date.now() - r.lastVisited > thresholdMs)
  if (stale.length === 0) return
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/48.png',
    title: `${stale.length} inactive tabs`,
    message: stale.map(r => getDomain(r.url)).join(', '),
    buttons: [{ title: 'Close all' }, { title: 'Ignore' }],
  })
})
