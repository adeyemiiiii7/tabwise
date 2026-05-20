import { AIProvider, CategorizeResult, QuotaExceededError } from './index'
import { findCategoryName } from '../categorizer'

export function openAIProvider(apiKey: string): AIProvider {
  return {
    async categorize(url, title, categories, systemPrompt): Promise<CategorizeResult> {
      const system = systemPrompt
        ?? `You are a browser tab categorizer. Given a URL and page title, reply with ONLY one category name from this list: ${categories.join(', ')}. Output nothing else — not a sentence, not punctuation, just the category name.`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `URL: ${url}\nTitle: ${title}\nCategory:` },
          ],
          max_tokens: 20,
          temperature: 0,
        }),
      })

      if (response.status === 429) throw new QuotaExceededError('OpenAI')
      if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`)

      const data = await response.json()
      const raw = data.choices?.[0]?.message?.content
      if (typeof raw !== 'string') throw new Error('OpenAI returned no text content')
      const clean = raw.trim().replace(/[^a-zA-Z\s]/g, '').trim()
      return {
        category: findCategoryName(clean, categories),
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      }
    },
  }
}
