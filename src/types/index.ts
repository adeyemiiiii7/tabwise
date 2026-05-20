export type AIProviderName = 'openai' | 'claude' | 'gemini'

export interface Category {
  id: string
  name: string
  color: string
  emoji?: string
}

export interface TabRecord {
  tabId: number
  url: string
  title: string
  domain: string
  category: string
  lastVisited: number
  groupId?: number
}

export interface ScreenTimeEntry {
  [domain: string]: number
}

export interface ScreenTimeData {
  [date: string]: ScreenTimeEntry // date = "YYYY-MM-DD"
}

export interface Settings {
  provider: AIProviderName
  apiKey: string
  useAI: boolean
  categories: Category[]
  autoMode: boolean
  inactivityThresholdHours: number
  onboardingComplete: boolean
}

export interface StorageData {
  settings: Settings
  screentime: ScreenTimeData
  tabs: TabRecord[]
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'work', name: 'Work', color: '#4A90D9' },
  { id: 'personal', name: 'Personal', color: '#7ED321' },
  { id: 'school', name: 'School', color: '#F5A623' },
  { id: 'entertainment', name: 'Entertainment', color: '#D0021B' },
]

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  useAI: true,
  categories: DEFAULT_CATEGORIES,
  autoMode: false,
  inactivityThresholdHours: 24,
  onboardingComplete: false,
}
