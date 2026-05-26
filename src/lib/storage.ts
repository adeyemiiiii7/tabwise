import { Settings, ScreenTimeData, TabRecord, DEFAULT_SETTINGS } from '../types'

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings')
  return (result.settings as Settings | undefined) ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

export async function getScreenTime(): Promise<ScreenTimeData> {
  const result = await chrome.storage.local.get('screentime')
  return (result.screentime as ScreenTimeData | undefined) ?? {}
}

export async function saveScreenTime(data: ScreenTimeData): Promise<void> {
  await chrome.storage.local.set({ screentime: data })
}

export async function getTabRecords(): Promise<TabRecord[]> {
  const result = await chrome.storage.local.get('tabs')
  return (result.tabs as TabRecord[] | undefined) ?? []
}

export async function saveTabRecords(tabs: TabRecord[]): Promise<void> {
  await chrome.storage.local.set({ tabs })
}

export async function getLearnedSites(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get('learnedSites')
  return (result.learnedSites as Record<string, string> | undefined) ?? {}
}

export async function saveLearnedSite(domain: string, category: string): Promise<void> {
  const current = await getLearnedSites()
  await chrome.storage.local.set({ learnedSites: { ...current, [domain]: category } })
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear()
}

export interface SiteMemoryHint {
  heapMB: number
  hasVideo: boolean
  hasCanvas: boolean
  recordedAt: number
}

export async function getSiteMemoryHints(): Promise<Record<string, SiteMemoryHint>> {
  const result = await chrome.storage.local.get('siteMemoryHints')
  return (result.siteMemoryHints as Record<string, SiteMemoryHint> | undefined) ?? {}
}

export async function saveSiteMemoryHint(domain: string, hint: SiteMemoryHint): Promise<void> {
  const current = await getSiteMemoryHints()
  await chrome.storage.local.set({ siteMemoryHints: { ...current, [domain]: hint } })
}

export interface QuotaBlock {
  provider: string
  blockedAt: number
}

export async function getQuotaBlock(): Promise<QuotaBlock | null> {
  const result = await chrome.storage.local.get('quotaBlock')
  return (result.quotaBlock as QuotaBlock | undefined) ?? null
}

export async function setQuotaBlock(provider: string): Promise<void> {
  await chrome.storage.local.set({ quotaBlock: { provider, blockedAt: Date.now() } })
}

export async function clearQuotaBlock(): Promise<void> {
  await chrome.storage.local.remove('quotaBlock')
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isQuotaBlockedToday(block: QuotaBlock): boolean {
  return localDateKey(new Date(block.blockedAt)) === localDateKey(new Date())
}
