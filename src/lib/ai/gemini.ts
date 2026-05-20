import { AIProvider, CategorizeResult, QuotaExceededError } from './index'
import { findCategoryName } from '../categorizer'

export function geminiProvider(apiKey: string): AIProvider {
  return {
    async categorize(url, title, categories, systemPrompt): Promise<CategorizeResult> {
      const system = systemPrompt
        ?? `You are a browser tab categorizer. Given a URL and page title, reply with ONLY one category name from this list: ${categories.join(', ')}. Output nothing else — not a sentence, not punctuation, just the category name.`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: `URL: ${url}\nTitle: ${title}\nCategory:` }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 20 },
          }),
        }
      )

      if (response.status === 429) throw new QuotaExceededError('Gemini')
      if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`)

      const data = await response.json()
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof raw !== 'string') throw new Error('Gemini returned no text content')
      const clean = raw.trim().replace(/[^a-zA-Z\s]/g, '').trim()
      return {
        category: findCategoryName(clean, categories),
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      }
    },
  }
}
