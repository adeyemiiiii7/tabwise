type StorageItems = Record<string, unknown>
type StorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void

let store: StorageItems = {}
const changeListeners: StorageChangeListener[] = []

function emitChanges(changes: Record<string, chrome.storage.StorageChange>): void {
  for (const listener of changeListeners) listener(changes, 'local')
}

const storageLocal = {
  async get(keys?: string | string[]): Promise<StorageItems> {
    if (keys === undefined) return { ...store }
    const wanted = typeof keys === 'string' ? [keys] : keys
    const result: StorageItems = {}
    for (const key of wanted) {
      if (key in store) result[key] = store[key]
    }
    return result
  },
  async set(items: StorageItems): Promise<void> {
    const changes: Record<string, chrome.storage.StorageChange> = {}
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: store[key], newValue: value }
      store[key] = value
    }
    emitChanges(changes)
  },
  async remove(keys: string | string[]): Promise<void> {
    const wanted = typeof keys === 'string' ? [keys] : keys
    const changes: Record<string, chrome.storage.StorageChange> = {}
    for (const key of wanted) {
      changes[key] = { oldValue: store[key], newValue: undefined }
      delete store[key]
    }
    emitChanges(changes)
  },
  async clear(): Promise<void> {
    const changes: Record<string, chrome.storage.StorageChange> = {}
    for (const key of Object.keys(store)) {
      changes[key] = { oldValue: store[key], newValue: undefined }
    }
    store = {}
    emitChanges(changes)
  },
}

const chromeMock = {
  storage: {
    local: storageLocal,
    onChanged: {
      addListener(listener: StorageChangeListener): void {
        changeListeners.push(listener)
      },
    },
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
  },
}

globalThis.chrome = chromeMock as unknown as typeof chrome

export function resetChromeStorage(): void {
  const changes: Record<string, chrome.storage.StorageChange> = {}
  for (const key of Object.keys(store)) {
    changes[key] = { oldValue: store[key], newValue: undefined }
  }
  store = {}
  emitChanges(changes)
}

export function readRawStorage(): StorageItems {
  return { ...store }
}
