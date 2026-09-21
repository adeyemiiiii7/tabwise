import { getScreenTime } from './storage'
import type { ScreenTimeData } from '../types'

export async function readScreenTime(): Promise<ScreenTimeData> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const snapshot = await Promise.race([
      chrome.runtime.sendMessage({ type: 'GET_SCREEN_TIME' }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 3000) }),
    ])
    if (snapshot && typeof snapshot === 'object') return snapshot as ScreenTimeData
  } catch { /* Keep saved statistics available while the worker restarts. */ }
  finally { clearTimeout(timer) }
  return getScreenTime()
}
