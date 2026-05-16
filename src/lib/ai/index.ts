import { AIProviderName } from '../../types'
import { openAIProvider } from './openai'
import { claudeProvider } from './claude'
import { geminiProvider } from './gemini'

export interface CategorizeResult {
  category: string
  inputTokens: number
  outputTokens: number
}

export interface AIProvider {
  categorize(url: string, title: string, categories: string[], systemPrompt?: string): Promise<CategorizeResult>
}

export class QuotaExceededError extends Error {
  constructor(public provider: string) {
    super(`${provider} daily API quota exceeded. Tabwise will use smart categorization until quota resets.`)
    this.name = 'QuotaExceededError'
  }
}

export function getProvider(name: AIProviderName, apiKey: string): AIProvider {
  switch (name) {
    case 'openai': return openAIProvider(apiKey)
    case 'claude': return claudeProvider(apiKey)
    case 'gemini': return geminiProvider(apiKey)
  }
}
