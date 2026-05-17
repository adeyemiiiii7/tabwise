import { getScreenTime, saveScreenTime } from './storage'
import { getDomain } from './tabs'

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

let activeUrl: string | null = null
let activeStart: number | null = null

export async function startTracking(url: string): Promise<void> {
  if (!url.startsWith('http')) return
  await flushCurrent()
  activeUrl = url
  activeStart = Date.now()
}

export async function flushCurrent(): Promise<void> {
  if (activeStart === null || !activeUrl) return

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

export async function pauseTracking(): Promise<void> {
  await flushCurrent()
  activeUrl = null
  activeStart = null
}

export function getActiveTime(): { domain: string | null; elapsed: number } {
  if (activeStart === null || !activeUrl) return { domain: null, elapsed: 0 }
  return {
    domain: getDomain(activeUrl),
    elapsed: Math.floor((Date.now() - activeStart) / 1000),
  }
}
