import { Settings, ScreenTimeData, TabRecord, DEFAULT_SETTINGS } from '../types'

// Serializes read-modify-write cycles within this JS context. Concurrent tab events
// (session restore, link bursts) would otherwise read the same snapshot and the last
// write would silently drop the others' changes.
let writeQueue: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation)
  writeQueue = run.then(() => undefined, () => undefined)
  return run
}

let cachedSettings: Settings | null = null

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) cachedSettings = null
})

export async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings
  const result = await chrome.storage.local.get('settings')
  cachedSettings = (result.settings as Settings | undefined) ?? DEFAULT_SETTINGS
  return cachedSettings
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

export async function getScreenTime(): Promise<ScreenTimeData> {
  const result = await chrome.storage.local.get('screentime')
  return (result.screentime as ScreenTimeData | undefined) ?? {}
}

export async function updateScreenTime(
  mutate: (data: ScreenTimeData) => ScreenTimeData,
  activeState?: { url: string | null; startedAt: number | null },
): Promise<void> {
  await enqueueWrite(async () => {
    const data = await getScreenTime()
    await chrome.storage.local.set({
      screentime: mutate(data),
      ...(activeState === undefined ? {} : { screentimeActive: activeState }),
    })
  })
}

export async function getTabRecords(): Promise<TabRecord[]> {
  const result = await chrome.storage.local.get('tabs')
  return (result.tabs as TabRecord[] | undefined) ?? []
}

export async function updateTabRecords(mutate: (records: TabRecord[]) => TabRecord[]): Promise<void> {
  await enqueueWrite(async () => {
    const records = await getTabRecords()
    await chrome.storage.local.set({ tabs: mutate(records) })
  })
}

export async function getLearnedSites(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get('learnedSites')
  return (result.learnedSites as Record<string, string> | undefined) ?? {}
}

export async function saveLearnedSite(domain: string, category: string): Promise<void> {
  await enqueueWrite(async () => {
    const current = await getLearnedSites()
    await chrome.storage.local.set({ learnedSites: { ...current, [domain]: category } })
  })
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear()
  cachedSettings = null
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
  await enqueueWrite(async () => {
    const current = await getSiteMemoryHints()
    await chrome.storage.local.set({ siteMemoryHints: { ...current, [domain]: hint } })
  })
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

export async function getStaleTabIds(): Promise<number[]> {
  const result = await chrome.storage.local.get('staleTabIds')
  return (result.staleTabIds as number[] | undefined) ?? []
}

export async function saveStaleTabIds(tabIds: number[]): Promise<void> {
  await chrome.storage.local.set({ staleTabIds: tabIds })
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isQuotaBlockedToday(block: QuotaBlock): boolean {
  return localDateKey(new Date(block.blockedAt)) === localDateKey(new Date())
}
