import { AIProvider, CategorizeResult, QuotaExceededError } from './index'

export function claudeProvider(apiKey: string): AIProvider {
  return {
    async categorize(url, title, categories, systemPrompt): Promise<CategorizeResult> {
      const system = systemPrompt
        ?? `You are a browser tab categorizer. Given a URL and page title, reply with ONLY one category name from this list: ${categories.join(', ')}. Output nothing else — not a sentence, not punctuation, just the category name.`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 20,
          system,
          messages: [{ role: 'user', content: `URL: ${url}\nTitle: ${title}\nCategory:` }],
        }),
      })

      if (response.status === 429) throw new QuotaExceededError('Claude')
      if (!response.ok) throw new Error(`Claude ${response.status}: ${await response.text()}`)

      const data = await response.json()
      return {
        category: pickCategory(data.content?.[0]?.text ?? '', categories),
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      }
    },
  }
}

function pickCategory(reply: string, categories: string[]): string {
  const clean = reply.trim().replace(/[^a-zA-Z\s]/g, '').trim().toLowerCase()
  return (
    categories.find(c => c.toLowerCase() === clean) ??
    categories.find(c => clean.includes(c.toLowerCase())) ??
    categories[0]
  )
}
