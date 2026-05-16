import { AIProvider, CategorizeResult, QuotaExceededError } from './index'

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
      return {
        category: pickCategory(data.choices?.[0]?.message?.content ?? '', categories),
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
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
