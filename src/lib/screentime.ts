import { getScreenTime, updateScreenTime } from './storage'
import { getDomain, isValidTab } from './tabs'
import { localDateKey, localDayStart } from './dates'

let activeUrl: string | null = null
let activeStart: number | null = null
let queue: Promise<unknown> = Promise.resolve()

// Ignore long gaps caused by sleep or a suspended worker.
const MAX_SESSION_GAP_SECONDS = 5 * 60

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation)
  queue = next.catch(() => {})
  return next
}

async function commit(now: number, nextUrl: string | null): Promise<void> {
  const domain = activeUrl ? getDomain(activeUrl) : null
  const start = activeStart
  const elapsed = start === null ? 0 : (now - start) / 1000
  const nextStart = nextUrl ? now : null
  // Save the totals and their checkpoint together, so a worker restart cannot
  // count the same interval again. Keep fractions to avoid losing rapid visits.
  await updateScreenTime(data => {
    if (!domain || start === null || elapsed <= 0 || elapsed > MAX_SESSION_GAP_SECONDS) return data
    const updated = { ...data }
    let cursor = start
    while (cursor < now) {
      const date = new Date(cursor)
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
      const end = Math.min(now, midnight)
      const key = localDateKey(date)
      const day = { ...updated[key] }
      day[domain] = (day[domain] ?? 0) + (end - cursor) / 1000
      updated[key] = day
      cursor = end
    }
    return updated
  }, { url: nextUrl, startedAt: nextStart })
  activeUrl = nextUrl
  activeStart = nextStart
}

export function startTracking(url: string): Promise<void> {
  const now = Date.now()
  return enqueue(() => commit(now, isValidTab(url) ? url : null))
}

export function flushCurrent(): Promise<void> {
  const now = Date.now()
  return enqueue(async () => {
    if (activeStart !== null && activeUrl) await commit(now, activeUrl)
  })
}

export function pauseTracking(): Promise<void> {
  const now = Date.now()
  return enqueue(() => commit(now, null))
}

// Only recover a checkpoint after checking the actual focused tab and idle state.
export function resumeTracking(currentUrl: string | null): Promise<void> {
  return enqueue(async () => {
    const result = await chrome.storage.local.get('screentimeActive')
    const state = result.screentimeActive as { url?: string; startedAt?: number } | undefined
    activeUrl = currentUrl && isValidTab(currentUrl) ? currentUrl : null
    const now = Date.now()
    activeStart = activeUrl ? now : null
    if (activeUrl && state?.url === activeUrl && typeof state.startedAt === 'number'
        && state.startedAt <= now && now - state.startedAt <= MAX_SESSION_GAP_SECONDS * 1000) {
      activeStart = state.startedAt
    }
  })
}

export function getActiveTime(): { domain: string | null; elapsed: number } {
  if (activeStart === null || !activeUrl) return { domain: null, elapsed: 0 }
  const now = Date.now()
  const gap = (now - activeStart) / 1000
  return {
    domain: getDomain(activeUrl),
    elapsed: gap < 0 || gap > MAX_SESSION_GAP_SECONDS ? 0
      : Math.floor((now - Math.max(activeStart, localDayStart())) / 1000),
  }
}

// The UI reads one flushed snapshot instead of racing stored totals against a
// separate live-time message while an alarm is writing those same seconds.
export function getScreenTimeSnapshot() {
  const now = Date.now()
  return enqueue(async () => {
    if (activeUrl && activeStart !== null) await commit(now, activeUrl)
    return getScreenTime()
  })
}
