import { getScreenTime, saveScreenTime } from './storage'
import { getDomain } from './tabs'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let activeUrl: string | null = null
let activeStart: number | null = null

// A single tracked stretch is flushed at least every 30s (interval + tab/window events),
// so a real session never has a large gap. A bigger jump means the machine slept or the
// worker was frozen — that wall-clock time was not screen time, so it must not be counted.
const MAX_SESSION_GAP_SECONDS = 5 * 60

async function persistState(): Promise<void> {
  await chrome.storage.local.set({ screentimeActive: { url: activeUrl } })
}

export async function startTracking(url: string): Promise<void> {
  if (!url.startsWith('http')) {
    await pauseTracking()
    return
  }
  await flushCurrent()
  activeUrl = url
  activeStart = Date.now()
  await persistState()
}

export async function flushCurrent(): Promise<void> {
  if (activeStart === null || !activeUrl) return

  const domain = getDomain(activeUrl)
  const elapsed = Math.floor((Date.now() - activeStart) / 1000)
  activeStart = Date.now()
  if (elapsed <= 0 || elapsed > MAX_SESSION_GAP_SECONDS) return

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
  await persistState()
}

// Called when the service worker restarts — recovers which URL was being tracked
// and resets the clock to now (avoids overcounting across SW termination gaps).
export async function resumeTracking(): Promise<void> {
  const result = await chrome.storage.local.get('screentimeActive')
  const state = result.screentimeActive as { url: string | null } | undefined
  if (state?.url) {
    activeUrl = state.url
    activeStart = Date.now()
  }
}

export function getActiveTime(): { domain: string | null; elapsed: number } {
  if (activeStart === null || !activeUrl) return { domain: null, elapsed: 0 }
  const elapsed = Math.floor((Date.now() - activeStart) / 1000)
  return {
    domain: getDomain(activeUrl),
    elapsed: elapsed > MAX_SESSION_GAP_SECONDS ? 0 : elapsed,
  }
}
