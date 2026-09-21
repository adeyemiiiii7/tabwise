import { startTracking, pauseTracking, resumeTracking, getScreenTimeSnapshot } from './screentime'

const ALARM_NAME = 'screentime-checkpoint'
const IDLE_SECONDS = 60

export function setupScreenTimeTracking() {
  let initialized = false
  let revision = 0
  let pending: Promise<void> = Promise.resolve()

  function refresh(): Promise<void> {
    const requested = ++revision
    const run = pending.then(async () => {
      if (requested !== revision) return
      let url: string | null = null
      try {
        const [win, idle] = await Promise.all([
          chrome.windows.getLastFocused(),
          chrome.idle.queryState(IDLE_SECONDS),
        ])
        if (win.focused && win.type === 'normal' && win.state !== 'minimized' && idle !== 'locked') {
          const [tab] = await chrome.tabs.query({ active: true, windowId: win.id })
          if (tab && !tab.discarded && (idle === 'active' || (tab.audible && !tab.mutedInfo?.muted))) {
            url = tab.url ?? null
          }
        }
      } catch { /* No accessible foreground window: stop counting. */ }
      if (requested !== revision) return
      if (!initialized) {
        await resumeTracking(url)
        initialized = true
      }
      if (url) await startTracking(url)
      else await pauseTracking()
    })
    pending = run.catch(err => console.error('[Tabwise] Screen time update failed:', err))
    return pending
  }

  chrome.tabs.onActivated.addListener(() => { void refresh() })
  chrome.tabs.onRemoved.addListener(() => { void refresh() })
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.active && (change.url !== undefined || change.audible !== undefined
        || change.mutedInfo !== undefined || change.discarded !== undefined || change.status === 'complete')) {
      void refresh()
    }
  })
  chrome.windows.onFocusChanged.addListener(() => { void refresh() })
  chrome.idle.setDetectionInterval(IDLE_SECONDS)
  chrome.idle.onStateChanged.addListener(() => { void refresh() })
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) void refresh()
  })
  // Alarms survive worker suspension. Only create when missing, so frequent
  // worker starts do not continually postpone the next checkpoint.
  void chrome.alarms.get(ALARM_NAME).then(alarm => {
    if (!alarm) return chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
  }).catch(err => console.error('[Tabwise] Screen time alarm failed:', err))
  void refresh()

  return {
    refresh,
    async snapshot() {
      await refresh()
      return getScreenTimeSnapshot()
    },
  }
}
