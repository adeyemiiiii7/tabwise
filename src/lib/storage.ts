import { Settings, ScreenTimeData, TabRecord, DEFAULT_SETTINGS } from '../types'

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings')
  return result.settings ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

export async function getScreenTime(): Promise<ScreenTimeData> {
  const result = await chrome.storage.local.get('screentime')
  return result.screentime ?? {}
}

export async function saveScreenTime(data: ScreenTimeData): Promise<void> {
  await chrome.storage.local.set({ screentime: data })
}

export async function getTabRecords(): Promise<TabRecord[]> {
  const result = await chrome.storage.local.get('tabs')
  return result.tabs ?? []
}

export async function saveTabRecords(tabs: TabRecord[]): Promise<void> {
  await chrome.storage.local.set({ tabs })
}

// Learned sites: domain → category name, saved from user picks
export async function getLearnedSites(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get('learnedSites')
  return result.learnedSites ?? {}
}

export async function saveLearnedSite(domain: string, category: string): Promise<void> {
  const current = await getLearnedSites()
  await chrome.storage.local.set({ learnedSites: { ...current, [domain]: category } })
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear()
}

export interface QuotaBlock {
  provider: string
  blockedAt: number
}

export async function getQuotaBlock(): Promise<QuotaBlock | null> {
  const result = await chrome.storage.local.get('quotaBlock')
  return (result.quotaBlock as QuotaBlock) ?? null
}

export async function setQuotaBlock(provider: string): Promise<void> {
  await chrome.storage.local.set({ quotaBlock: { provider, blockedAt: Date.now() } })
}

export async function clearQuotaBlock(): Promise<void> {
  await chrome.storage.local.remove('quotaBlock')
}

// Returns true if the quota was blocked today (UTC date match)
export function isQuotaBlockedToday(block: QuotaBlock): boolean {
  const blockedDate = new Date(block.blockedAt).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  return blockedDate === today
}
