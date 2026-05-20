import { PageMetadata } from '../types'
import { lookupKnownSite } from './knownSites'
import { CategoryNotFoundError } from './categorizer'

export interface OfflineResult {
  category: string   // matched to user's actual category list
  confidence: 'high' | 'low'
}

export class NoCategoryDecisionError extends Error {
  constructor(public reason: 'no-signals' | 'invalid-url') {
    super(`Offline categorizer could not decide: ${reason}`)
    this.name = 'NoCategoryDecisionError'
  }
}

interface Signal {
  category: string
  strength: number
}

type SignalSource = 'url' | 'title' | 'metadata'

function getPath(url: string): string {
  try { return new URL(url).pathname.toLowerCase() } catch { return '' }
}

function analyzeUrl(url: string, domain: string): Signal[] {
  const signals: Signal[] = []
  const path = getPath(url)

  if (domain.endsWith('.edu') || /\.edu\.[a-z]{2,3}$/.test(domain) || /\.ac\.[a-z]{2,3}$/.test(domain)) {
    signals.push({ category: 'School', strength: 3 })
  }
  if (domain.endsWith('.gov') || /\.gov\.[a-z]{2,3}$/.test(domain)) {
    signals.push({ category: 'Work', strength: 2 })
  }
  if (domain.endsWith('.mil')) {
    signals.push({ category: 'Work', strength: 3 })
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

const OG_TYPE_SIGNALS: Record<string, Signal> = {
  'video.movie':         { category: 'Entertainment', strength: 3 },
  'video.episode':       { category: 'Entertainment', strength: 3 },
  'video.tv_show':       { category: 'Entertainment', strength: 3 },
  'video.other':         { category: 'Entertainment', strength: 2 },
  'music.song':          { category: 'Entertainment', strength: 3 },
  'music.album':         { category: 'Entertainment', strength: 3 },
  'music.playlist':      { category: 'Entertainment', strength: 3 },
  'music.radio_station': { category: 'Entertainment', strength: 3 },
  'product':             { category: 'Personal', strength: 3 },
  'product.group':       { category: 'Personal', strength: 3 },
  'product.item':        { category: 'Personal', strength: 3 },
  'profile':             { category: 'Personal', strength: 2 },
  'article':             { category: 'Personal', strength: 1 },
  'book':                { category: 'School', strength: 1 },
}

const SCHEMA_TYPE_SIGNALS: Record<string, Signal> = {
  'Course':             { category: 'School', strength: 3 },
  'EducationalContent': { category: 'School', strength: 3 },
  'LearningResource':   { category: 'School', strength: 3 },
  'Quiz':               { category: 'School', strength: 3 },
  'EducationEvent':     { category: 'School', strength: 2 },
  'VideoObject':        { category: 'Entertainment', strength: 3 },
  'Movie':              { category: 'Entertainment', strength: 3 },
  'TVSeries':           { category: 'Entertainment', strength: 3 },
  'TVEpisode':          { category: 'Entertainment', strength: 3 },
  'MusicRecording':     { category: 'Entertainment', strength: 3 },
  'MusicAlbum':         { category: 'Entertainment', strength: 3 },
  'MusicVideoObject':   { category: 'Entertainment', strength: 3 },
  'PodcastEpisode':     { category: 'Entertainment', strength: 2 },
  'PodcastSeries':      { category: 'Entertainment', strength: 2 },
  'Game':               { category: 'Entertainment', strength: 3 },
  'VideoGame':          { category: 'Entertainment', strength: 3 },
  'Product':            { category: 'Personal', strength: 3 },
  'Offer':              { category: 'Personal', strength: 2 },
  'AggregateOffer':     { category: 'Personal', strength: 2 },
  'Recipe':             { category: 'Personal', strength: 2 },
  'Event':              { category: 'Personal', strength: 2 },
  'NewsArticle':        { category: 'Personal', strength: 2 },
  'BlogPosting':        { category: 'Personal', strength: 1 },
  'Article':            { category: 'Personal', strength: 1 },
  'SoftwareApplication':{ category: 'Work', strength: 2 },
  'WebApplication':     { category: 'Work', strength: 2 },
  'TechArticle':        { category: 'Work', strength: 2 },
  'APIReference':       { category: 'Work', strength: 3 },
}

function analyzeMetadata(metadata: PageMetadata | null): Signal[] {
  if (!metadata) return []
  const signals: Signal[] = []

  if (metadata.ogType) {
    const lookup = OG_TYPE_SIGNALS[metadata.ogType.toLowerCase()]
    if (lookup) signals.push(lookup)
  }

  for (const schemaType of metadata.schemaTypes) {
    const lookup = SCHEMA_TYPE_SIGNALS[schemaType]
    if (lookup) signals.push(lookup)
  }

  const corpus = `${metadata.description ?? ''} ${metadata.keywords ?? ''} ${metadata.headings.join(' ')}`.toLowerCase()
  if (corpus.trim().length > 0) {
    if (/\b(tutorial|course|lecture|lesson|study|homework|assignment|quiz|exam|syllabus|curriculum)\b/.test(corpus)) {
      signals.push({ category: 'School', strength: 2 })
    }
    if (/\b(shop|store|sale|deals?|cart|purchase|order|discount|coupons?)\b/.test(corpus)) {
      signals.push({ category: 'Personal', strength: 2 })
    }
    if (/\b(watch|stream|episode|trailer|series|anime|playlist|soundtrack|gameplay)\b/.test(corpus)) {
      signals.push({ category: 'Entertainment', strength: 2 })
    }
    if (/\b(documentation|developer|api|sdk|repository|integration|workflow|enterprise|saas|admin)\b/.test(corpus)) {
      signals.push({ category: 'Work', strength: 2 })
    }
    if (/\b(news|politics|opinion|column|breaking|headlines)\b/.test(corpus)) {
      signals.push({ category: 'Personal', strength: 1 })
    }
  }

  return signals
}

function resolveCategory(canonical: string, categoryNames: string[]): string {
  const lower = canonical.toLowerCase()
  const result = (
    categoryNames.find(c => c.toLowerCase() === lower) ??
    categoryNames.find(c => c.toLowerCase().includes(lower)) ??
    categoryNames.find(c => lower.includes(c.toLowerCase()))
  )
  if (!result) throw new CategoryNotFoundError(canonical)
  return result
}

export function offlineCategorize(
  url: string,
  title: string,
  categoryNames: string[],
  metadata: PageMetadata | null = null,
): OfflineResult {
  let domain: string
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    throw new NoCategoryDecisionError('invalid-url')
  }

  const known = lookupKnownSite(domain)
  if (known) {
    return { category: resolveCategory(known, categoryNames), confidence: 'high' }
  }

  const sources: Record<SignalSource, Signal[]> = {
    url: analyzeUrl(url, domain),
    title: analyzeTitle(title),
    metadata: analyzeMetadata(metadata),
  }
  const signals = [...sources.url, ...sources.title, ...sources.metadata]

  if (signals.length === 0) {
    throw new NoCategoryDecisionError('no-signals')
  }

  const scores: Record<string, number> = {}
  for (const { category, strength } of signals) {
    scores[category] = (scores[category] ?? 0) + strength
  }

  const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const [topCanonical, topScore] = ranked[0]
  const resolved = resolveCategory(topCanonical, categoryNames)

  const sourceCount = (Object.keys(sources) as SignalSource[]).filter(
    src => sources[src].some(s => s.category === topCanonical),
  ).length
  const confidence: 'high' | 'low' = (topScore >= 5 || sourceCount >= 2) ? 'high' : 'low'

  return { category: resolved, confidence }
}
