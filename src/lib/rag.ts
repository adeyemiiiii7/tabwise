import { getLearnedSites, getTabRecords } from './storage'
import { Settings } from '../types'

export interface RAGContext {
  systemPrompt: string
  userExamples: string
}

const SITE_EXAMPLES_BY_CATEGORY: Record<string, string[]> = {
  Entertainment: [
    'netflix.com', 'spotify.com', 'twitch.tv', 'roblox.com',
    'espn.com', 'hulu.com', 'crunchyroll.com', 'imdb.com',
    'chess.com', 'soundcloud.com', '9gag.com', 'disneyplus.com',
  ],
  Work: [
    'github.com', 'figma.com', 'jira.atlassian.com', 'vercel.com',
    'stripe.com', 'linear.app', 'notion.so', 'slack.com',
    'gitlab.com', 'asana.com', 'zoom.us', 'hubspot.com',
  ],
  School: [
    'khanacademy.org', 'coursera.org', 'leetcode.com', 'wikipedia.org',
    'arxiv.org', 'edx.org', 'freecodecamp.org', 'developer.mozilla.org',
    'quizlet.com', 'scholar.google.com', 'duolingo.com', 'codecademy.com',
  ],
  Personal: [
    'mail.google.com', 'amazon.com', 'whatsapp.com', 'paypal.com',
    'instagram.com', 'twitter.com', 'facebook.com', 'booking.com',
    'medium.com', 'substack.com', 'reddit.com', 'pinterest.com',
  ],
}

export async function buildRAGContext(settings: Settings): Promise<RAGContext> {
  const [learned, records] = await Promise.all([
    getLearnedSites(),
    getTabRecords(),
  ])

  const categoryNames = settings.categories.map(c => c.name)

  const userHistory: Record<string, string[]> = {}
  categoryNames.forEach(name => { userHistory[name] = [] })

  for (const [domain, cat] of Object.entries(learned)) {
    if (userHistory[cat] && userHistory[cat].length < 8) {
      userHistory[cat].push(domain)
    }
  }
  for (const record of records) {
    const cat = record.category
    if (userHistory[cat] && userHistory[cat].length < 8 && !userHistory[cat].includes(record.domain)) {
      userHistory[cat].push(record.domain)
    }
  }

  const siteHintLines: string[] = []
  for (const cat of categoryNames) {
    const builtInExamples = SITE_EXAMPLES_BY_CATEGORY[cat] ?? []
    if (builtInExamples.length > 0) {
      siteHintLines.push(`${cat}: ${builtInExamples.join(', ')}`)
    }
  }

  const userHistoryLines: string[] = []
  for (const [cat, domains] of Object.entries(userHistory)) {
    if (domains.length > 0) {
      userHistoryLines.push(`${cat}: ${domains.join(', ')}`)
    }
  }

  const userExamples = userHistoryLines.length > 0
    ? `\nThis specific user's saved picks (highest priority — trust these over defaults):\n${userHistoryLines.join('\n')}`
    : ''

  const systemPrompt = [
    `You are a browser tab categorizer.`,
    `Available categories: ${categoryNames.join(', ')}.`,
    `Reply with ONLY the category name — no punctuation, no explanation, nothing else.`,
    `\nWell-known site reference (use as strong prior):\n${siteHintLines.join('\n')}`,
    userExamples,
  ].filter(Boolean).join('\n')

  return { systemPrompt, userExamples }
}

export async function recordAPICall(inputTokens = 0, outputTokens = 0): Promise<void> {
  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
  const result = await chrome.storage.local.get(['apiUsage', 'apiTokens'])

  const usage: Record<string, number> = (result.apiUsage as Record<string, number> | undefined) ?? {}
  usage[today] = (usage[today] ?? 0) + 1
  const usageKeys = Object.keys(usage).sort()
  if (usageKeys.length > 30) delete usage[usageKeys[0]]

  const tokens: Record<string, { input: number; output: number }> = (result.apiTokens as Record<string, { input: number; output: number }> | undefined) ?? {}
  if (!tokens[today]) tokens[today] = { input: 0, output: 0 }
  tokens[today].input += inputTokens
  tokens[today].output += outputTokens
  const tokenKeys = Object.keys(tokens).sort()
  if (tokenKeys.length > 30) delete tokens[tokenKeys[0]]

  await chrome.storage.local.set({ apiUsage: usage, apiTokens: tokens })
}

export async function getAPIUsageThisMonth(): Promise<number> {
  const result = await chrome.storage.local.get('apiUsage')
  const usage: Record<string, number> = (result.apiUsage as Record<string, number> | undefined) ?? {}
  const monthPrefix = new Date().toISOString().slice(0, 7)
  return Object.entries(usage)
    .filter(([date]) => date.startsWith(monthPrefix))
    .reduce((sum, [, count]) => sum + count, 0)
}
