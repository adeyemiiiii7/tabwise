import { getSettings, getLearnedSites, saveLearnedSite } from '../lib/storage'
import { getProvider } from '../lib/ai'
import { QuotaExceededError } from '../lib/ai'
import { isValidTab, tabToRecord, getDomain } from '../lib/tabs'
import { moveTabToCategory, moveGroupToNewWindow } from '../lib/groups'
import { startTracking, flushCurrent, pauseTracking } from '../lib/screentime'
import { setupAlarm, onAlarm } from '../lib/scheduler'
import { getTabRecords, saveTabRecords } from '../lib/storage'
import { getQuotaBlock, setQuotaBlock, clearQuotaBlock, isQuotaBlockedToday } from '../lib/storage'
import { matchCategory } from '../lib/categorizer'
import { lookupKnownSite } from '../lib/knownSites'
import { buildRAGContext, recordAPICall } from '../lib/rag'
import { offlineCategorize } from '../lib/offlineCategorizer'

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

// Debounce: skip handleTab if we already processed this tab+URL recently.
// Prevents onCreated (3s delay) and onUpdated (on load) from double-processing
// the same tab, and stops SPA navigation from re-grouping on every route change.
const lastHandled = new Map<number, string>() // tabId → last URL processed

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings()
  if (!settings.onboardingComplete) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
  setupAlarm(settings.inactivityThresholdHours)
})

async function handleTab(tab: chrome.tabs.Tab): Promise<void> {
  const url = tab.url ?? ''
  const title = tab.title ?? ''
  if (!isValidTab(url) || !tab.id || !tab.windowId) return

  // Skip if we already processed this exact tab+URL — handles onCreated/onUpdated
  // double-firing and SPA route changes within the same site
  if (lastHandled.get(tab.id) === url) return
  lastHandled.set(tab.id, url)

  try {
    const win = await chrome.windows.get(tab.windowId)
    if (win.type !== 'normal') return
  } catch { return }

  const settings = await getSettings()
  if (!settings.apiKey || !settings.onboardingComplete) return

  const domain = getDomain(url)
  const categoryNames = settings.categories.map(c => c.name)
  const learned = await getLearnedSites()

  // Tier 1: User's saved picks — silent, always win, no API needed
  if (learned[domain] && categoryNames.includes(learned[domain])) {
    const category = matchCategory(learned[domain], settings.categories)
    await moveTabToCategory(tab.id, tab.windowId, category)
    await updateRecord(tab, category.name)
    return
  }

  // Check if AI is quota-blocked for today
  const quotaBlock = await getQuotaBlock()
  if (quotaBlock && isQuotaBlockedToday(quotaBlock)) {
    // Smart offline system — keeps organising without any API call
    const result = offlineCategorize(url, title, categoryNames)
    const category = matchCategory(result.category, settings.categories)
    await moveTabToCategory(tab.id, tab.windowId, category)
    await updateRecord(tab, category.name)
    // High confidence → confirm (auto-dismisses); low → ask (user teaches the system)
    sendToast(tab.id, domain, category.name, categoryNames, result.confidence === 'high' ? 'confirm' : 'ask')
    return
  }

  // Tier 2: AI + RAG — all systems working together
  const ragContext = await getRAGContext(settings)
  const provider = getProvider(settings.provider, settings.apiKey)

  let categoryName: string | null = null
  let aiOk = false

  try {
    const result = await provider.categorize(url, title, categoryNames, ragContext.systemPrompt)
    categoryName = result.category
    aiOk = true
    await recordAPICall(result.inputTokens, result.outputTokens)
    // AI recovered — clear any stale quota block from a previous day
    if (quotaBlock) await clearQuotaBlock()
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      await handleQuotaExceeded(err.provider)
      // Smart offline categorization for this tab
      const result = offlineCategorize(url, title, categoryNames)
      const category = matchCategory(result.category, settings.categories)
      await moveTabToCategory(tab.id, tab.windowId, category)
      await updateRecord(tab, category.name)
      sendToast(tab.id, domain, category.name, categoryNames, result.confidence === 'high' ? 'confirm' : 'ask')
      return
    }
    // Other errors (network, bad key): log + emergency known-site lookup
    console.error('[Tabwise] AI categorization failed — check your API key:', err)
    await recordAPICall(0, 0)
    const known = lookupKnownSite(domain)
    if (known && categoryNames.includes(known)) categoryName = known
  }

  if (!categoryName || !categoryNames.includes(categoryName)) {
    categoryName = categoryNames[0]
  }

  const category = matchCategory(categoryName, settings.categories)
  await moveTabToCategory(tab.id, tab.windowId, category)
  await updateRecord(tab, category.name)
  const toastMode = aiOk ? 'confirm' : 'ask'
  sendToast(tab.id, domain, category.name, categoryNames, toastMode)
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
  category: string,
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
    if (tab.url) await startTracking(tabId, tab.url)
  } catch { /* tab gone */ }
})

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) pauseTracking()
})

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

  if (message.type === 'REORGANIZE_ALL') {
    ;(async () => {
      const settings = await getSettings()
      if (!settings.apiKey || !settings.onboardingComplete) {
        sendResponse({ success: false, count: 0 }); return
      }
      const tabs = await chrome.tabs.query({})
      const validTabs = tabs.filter(t => t.url && isValidTab(t.url) && t.id && t.windowId)
      const categoryNames = settings.categories.map(c => c.name)
      const learned = await getLearnedSites()
      const quotaBlock = await getQuotaBlock()
      const inQuotaMode = !!(quotaBlock && isQuotaBlockedToday(quotaBlock))

      let ragContext: Awaited<ReturnType<typeof buildRAGContext>> | null = null
      let provider = inQuotaMode ? null : getProvider(settings.provider, settings.apiKey)
      if (!inQuotaMode) ragContext = await getRAGContext(settings)

      let count = 0
      const records = await getTabRecords()
      const updatedRecords = [...records]

      for (const tab of validTabs) {
        try {
          const domain = getDomain(tab.url!)
          let categoryName: string | null = null

          if (learned[domain] && categoryNames.includes(learned[domain])) {
            categoryName = learned[domain]
          } else if (inQuotaMode) {
            const result = offlineCategorize(tab.url!, tab.title ?? '', categoryNames)
            categoryName = result.category
          } else {
            try {
              const result = await provider!.categorize(
                tab.url!, tab.title ?? '', categoryNames, ragContext!.systemPrompt
              )
              categoryName = result.category
              await recordAPICall(result.inputTokens, result.outputTokens)
            } catch (err) {
              if (err instanceof QuotaExceededError) {
                await handleQuotaExceeded(err.provider)
                const result = offlineCategorize(tab.url!, tab.title ?? '', categoryNames)
                categoryName = result.category
              } else {
                console.error('[Tabwise] REORGANIZE AI failed for', tab.url, err)
                await recordAPICall(0, 0)
                const known = lookupKnownSite(domain)
                if (known && categoryNames.includes(known)) categoryName = known
              }
            }
          }

          if (!categoryName || !categoryNames.includes(categoryName)) {
            categoryName = categoryNames[0]
          }

          const category = matchCategory(categoryName, settings.categories)
          await moveTabToCategory(tab.id!, tab.windowId!, category)
          const record = tabToRecord(tab, category.name)
          const idx = updatedRecords.findIndex(r => r.tabId === tab.id)
          if (idx >= 0) updatedRecords[idx] = record
          else updatedRecords.push(record)
          count++
        } catch { /* tab disappeared mid-loop */ }
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
