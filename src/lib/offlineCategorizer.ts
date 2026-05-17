import { lookupKnownSite } from './knownSites'

export interface OfflineResult {
  category: string   // matched to user's actual category list
  confidence: 'high' | 'low'
}

interface Signal {
  category: string
  strength: number
}

function getPath(url: string): string {
  try { return new URL(url).pathname.toLowerCase() } catch { return '' }
}

function analyzeUrl(url: string, domain: string): Signal[] {
  const signals: Signal[] = []
  const path = getPath(url)

  if (domain.endsWith('.edu') || /\.ac\.[a-z]{2}$/.test(domain)) {
    signals.push({ category: 'School', strength: 3 })
  }

  const sub = domain.split('.')[0].toLowerCase()

  if (/^(mail|inbox|webmail|post)$/.test(sub)) {
    signals.push({ category: 'Personal', strength: 3 })
  }
  if (/^(docs|developer|api|devdocs|dev|reference|sdk)$/.test(sub)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (/^(shop|store|cart|buy)$/.test(sub)) {
    signals.push({ category: 'Personal', strength: 2 })
  }
  if (/^(dashboard|console|admin|app|portal|panel|manage|control)$/.test(sub)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (/^(learn|academy|courses?|tutorial|classroom|training|school)$/.test(sub)) {
    signals.push({ category: 'School', strength: 2 })
  }
  if (/^(news|press|media|blog)$/.test(sub)) {
    signals.push({ category: 'Personal', strength: 1 })
  }
  if (/^(play|games?|gaming)$/.test(sub)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }
  if (/^(music|radio|podcasts?)$/.test(sub)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }

  if (/\/(watch|stream|episode|anime|film|movies?|shows?|playlist|trailer)\b/.test(path)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }
  if (/\/(cart|checkout|order|purchase|buy|products?|items?|listing)\b/.test(path)) {
    signals.push({ category: 'Personal', strength: 2 })
  }
  if (/\/(docs?|api|reference|guides?|manuals?|sdk|swagger)\b/.test(path)) {
    signals.push({ category: 'Work', strength: 1 })
  }
  if (/\/(learn|courses?|tutorials?|lessons?|quiz|exam|lectures?|classes?|module)\b/.test(path)) {
    signals.push({ category: 'School', strength: 2 })
  }
  if (/\/(news|articles?|stories?|posts?|blogs?|press|headlines?)\b/.test(path)) {
    signals.push({ category: 'Personal', strength: 1 })
  }
  if (/\/(dashboard|console|admin|panel|manage|analytics)\b/.test(path)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (/\/(repo|pull|issues?|commit|pipeline|deploy|release|workflow)\b/.test(path)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (/\/(games?|play|arcade|casino|poker|chess|puzzle)\b/.test(path)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }
  if (/\/(music|playlist|album|artist|track|songs?|radio)\b/.test(path)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }
  if (/\/(login|signin|sign-in|signup|sign-up|register|auth|oauth|sso)\b/.test(path)) {
    signals.push({ category: 'Personal', strength: 1 })
  }
  if (/\/(settings?|account|profile|preferences?|billing)\b/.test(path)) {
    signals.push({ category: 'Personal', strength: 1 })
  }

  return signals
}

function analyzeTitle(title: string): Signal[] {
  if (!title) return []
  const signals: Signal[] = []
  const t = title.toLowerCase()

  if (/\b(your cart|shopping cart|checkout|place order|order confirmation|items? in bag)\b/.test(t)) {
    signals.push({ category: 'Personal', strength: 3 })
  }
  if (/\b(track(ing)? (order|package)|delivery|shipment)\b/.test(t)) {
    signals.push({ category: 'Personal', strength: 2 })
  }

  if (/\b(pull request|code review|issue #?\d+|sprint|standup|deploy|ci\/cd|pipeline)\b/.test(t)) {
    signals.push({ category: 'Work', strength: 3 })
  }
  if (/\b(dashboard|control panel|admin panel|management|analytics|metrics)\b/.test(t)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (/\b(api (docs?|reference)|getting started|sdk|documentation)\b/.test(t)) {
    signals.push({ category: 'Work', strength: 2 })
  }

  if (/\b(tutorial|how[- ]to|step[- ]by[- ]step|course:|lesson \d+|chapter \d+|lecture|homework|assignment)\b/.test(t)) {
    signals.push({ category: 'School', strength: 2 })
  }
  if (/\b(quiz|exam|test|revision|flashcards?|study guide)\b/.test(t)) {
    signals.push({ category: 'School', strength: 2 })
  }

  if (/\b(watch .+online|episode \d+|season \d+|now streaming|now playing|full (episode|movie))\b/.test(t)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }
  if (/\b(score|live (match|game|stream)|highlights?|fixtures?)\b/.test(t)) {
    signals.push({ category: 'Entertainment', strength: 1 })
  }
  if (/\b(game over|high score|achievement|level \d+)\b/.test(t)) {
    signals.push({ category: 'Entertainment', strength: 2 })
  }

  return signals
}

function resolveCategory(canonical: string, categoryNames: string[]): string | null {
  const lower = canonical.toLowerCase()
  return (
    categoryNames.find(c => c.toLowerCase() === lower) ??
    categoryNames.find(c => c.toLowerCase().includes(lower)) ??
    categoryNames.find(c => lower.includes(c.toLowerCase())) ??
    null
  )
}

export function offlineCategorize(url: string, title: string, categoryNames: string[]): OfflineResult {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '')
    const known = lookupKnownSite(domain)
    if (known) {
      const resolved = resolveCategory(known, categoryNames) ?? categoryNames[0]
      return { category: resolved, confidence: 'high' }
    }
  } catch { /* invalid URL — fall through */ }

  let domain = ''
  try { domain = new URL(url).hostname.replace(/^www\./, '') } catch { /* ok */ }

  const signals = [...analyzeUrl(url, domain), ...analyzeTitle(title)]

  if (signals.length === 0) {
    return { category: categoryNames[0], confidence: 'low' }
  }

  const scores: Record<string, number> = {}
  for (const { category, strength } of signals) {
    scores[category] = (scores[category] ?? 0) + strength
  }

  const [[topCanonical, topScore]] = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const resolved = resolveCategory(topCanonical, categoryNames) ?? categoryNames[0]
  const confidence = topScore >= 3 ? 'high' : 'low'

  return { category: resolved, confidence }
}
