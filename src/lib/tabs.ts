import { TabRecord } from '../types'

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

export function isValidTab(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export async function getAllTabs(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({})
}

export function tabToRecord(tab: chrome.tabs.Tab, category: string): TabRecord {
  const url = tab.url ?? ''
  return {
    tabId: tab.id!,
    url,
    title: tab.title ?? '',
    domain: getDomain(url),
    category,
    lastVisited: Date.now(),
    groupId: tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tab.groupId : undefined,
  }
}
