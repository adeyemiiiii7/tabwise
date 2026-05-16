import { getScreenTime, saveScreenTime } from './storage'
import { getDomain } from './tabs'

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

let activeTabId: number | null = null
let activeUrl: string | null = null
let activeStart: number | null = null

export async function startTracking(tabId: number, url: string): Promise<void> {
  if (!url.startsWith('http')) return
  await flushCurrent()
  activeTabId = tabId
  activeUrl = url
  activeStart = Date.now()
}

export async function flushCurrent(): Promise<void> {
  if (activeTabId === null || activeStart === null || !activeUrl) return

  const domain = getDomain(activeUrl)
  const elapsed = Math.floor((Date.now() - activeStart) / 1000)
  if (elapsed <= 0) return

  activeStart = Date.now()

  const data = await getScreenTime()
  const today = todayKey()
  if (!data[today]) data[today] = {}
  data[today][domain] = (data[today][domain] ?? 0) + elapsed
  await saveScreenTime(data)
}

export function pauseTracking(): void {
  activeTabId = null
  activeUrl = null
  activeStart = null
}
