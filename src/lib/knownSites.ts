// Comprehensive domain → category lookup based on Similarweb/Semrush top-site data (2025).
// Only UNAMBIGUOUS sites live here — sites that clearly belong to one category for any user.
// Ambiguous sites (YouTube, Udemy, Reddit, etc.) are in AMBIGUOUS_SITES and always ask the user.

const KNOWN_SITES: Record<string, string> = {

  // ── ENTERTAINMENT ──────────────────────────────────────────────────────────
  // Streaming video
  'netflix.com': 'Entertainment',
  'hulu.com': 'Entertainment',
  'disneyplus.com': 'Entertainment',
  'max.com': 'Entertainment',
  'hbomax.com': 'Entertainment',
  'primevideo.com': 'Entertainment',
  'peacocktv.com': 'Entertainment',
  'peacock.com': 'Entertainment',
  'paramountplus.com': 'Entertainment',
  'appletv.com': 'Entertainment',
  'crunchyroll.com': 'Entertainment',
  'funimation.com': 'Entertainment',
  'vimeo.com': 'Entertainment',
  'twitch.tv': 'Entertainment',
  'dailymotion.com': 'Entertainment',
  'rutube.ru': 'Entertainment',

  // Music
  'spotify.com': 'Entertainment',
  'soundcloud.com': 'Entertainment',
  'pandora.com': 'Entertainment',
  'tidal.com': 'Entertainment',
  'deezer.com': 'Entertainment',
  'music.apple.com': 'Entertainment',
  'last.fm': 'Entertainment',
  'bandcamp.com': 'Entertainment',

  // Gaming
  'roblox.com': 'Entertainment',
  'store.steampowered.com': 'Entertainment',
  'steampowered.com': 'Entertainment',
  'epicgames.com': 'Entertainment',
  'gog.com': 'Entertainment',
  'itch.io': 'Entertainment',
  'poki.com': 'Entertainment',
  'miniclip.com': 'Entertainment',
  'kongregate.com': 'Entertainment',
  'chess.com': 'Entertainment',

  // Sports
  'espn.com': 'Entertainment',
  'cricbuzz.com': 'Entertainment',
  'nba.com': 'Entertainment',
  'nfl.com': 'Entertainment',
  'bbc.co.uk/sport': 'Entertainment',
  'goal.com': 'Entertainment',
  'transfermarkt.com': 'Entertainment',
  'sofascore.com': 'Entertainment',

  // Art & media
  'imdb.com': 'Entertainment',
  'fandom.com': 'Entertainment',
  'pixiv.net': 'Entertainment',
  'deviantart.com': 'Entertainment',
  'rottentomatoes.com': 'Entertainment',
  'letterboxd.com': 'Entertainment',
  '9gag.com': 'Entertainment',
  'imgur.com': 'Entertainment',
  'giphy.com': 'Entertainment',
  'webtoons.com': 'Entertainment',

  // ── WORK / PRODUCTIVITY ────────────────────────────────────────────────────
  // Dev tools & version control
  'github.com': 'Work',
  'gitlab.com': 'Work',
  'bitbucket.org': 'Work',
  'codepen.io': 'Work',
  'replit.com': 'Work',
  'codesandbox.io': 'Work',
  'stackoverflow.com': 'Work',
  'jsfiddle.net': 'Work',

  // Cloud & infrastructure
  'aws.amazon.com': 'Work',
  'console.cloud.google.com': 'Work',
  'portal.azure.com': 'Work',
  'heroku.com': 'Work',
  'vercel.com': 'Work',
  'netlify.com': 'Work',
  'cloudflare.com': 'Work',
  'digitalocean.com': 'Work',
  'railway.app': 'Work',
  'render.com': 'Work',
  'supabase.com': 'Work',
  'firebase.google.com': 'Work',

  // Project management & planning
  'linear.app': 'Work',
  'jira.atlassian.com': 'Work',
  'confluence.atlassian.com': 'Work',
  'atlassian.com': 'Work',
  'trello.com': 'Work',
  'asana.com': 'Work',
  'monday.com': 'Work',
  'clickup.com': 'Work',
  'basecamp.com': 'Work',
  'height.app': 'Work',
  'shortcut.com': 'Work',

  // Design
  'figma.com': 'Work',
  'miro.com': 'Work',
  'canva.com': 'Work',
  'sketch.com': 'Work',
  'invisionapp.com': 'Work',
  'zeplin.io': 'Work',
  'framer.com': 'Work',
  'adobe.com': 'Work',
  'behance.net': 'Work',
  'dribbble.com': 'Work',

  // Office & docs
  'office.com': 'Work',
  'office365.com': 'Work',
  'sharepoint.com': 'Work',
  'teams.microsoft.com': 'Work',
  'meet.google.com': 'Work',
  'zoom.us': 'Work',
  'webex.com': 'Work',
  'whereby.com': 'Work',
  'loom.com': 'Work',

  // CRM / sales / HR
  'salesforce.com': 'Work',
  'hubspot.com': 'Work',
  'zendesk.com': 'Work',
  'intercom.com': 'Work',
  'pipedrive.com': 'Work',
  'airtable.com': 'Work',
  'typeform.com': 'Work',

  // Finance & payments (business)
  'stripe.com': 'Work',
  'square.com': 'Work',
  'quickbooks.intuit.com': 'Work',
  'xero.com': 'Work',
  'freshbooks.com': 'Work',

  // Jobs
  'indeed.com': 'Work',
  'glassdoor.com': 'Work',
  'upwork.com': 'Work',
  'fiverr.com': 'Work',
  'toptal.com': 'Work',
  'wellfound.com': 'Work',
  'ycombinator.com': 'Work',
  'producthunt.com': 'Work',

  // Misc productivity
  'grammarly.com': 'Work',
  'calendly.com': 'Work',
  'todoist.com': 'Work',
  'evernote.com': 'Work',
  'obsidian.md': 'Work',
  'roamresearch.com': 'Work',
  'dropbox.com': 'Work',
  'box.com': 'Work',
  'docusign.com': 'Work',

  // AI tools (work context)
  'openai.com': 'Work',
  'chat.openai.com': 'Work',
  'anthropic.com': 'Work',
  'claude.ai': 'Work',
  'gemini.google.com': 'Work',
  'aistudio.google.com': 'Work',
  'bard.google.com': 'Work',
  'deepseek.com': 'Work',
  'chat.deepseek.com': 'Work',
  'perplexity.ai': 'Work',
  'cursor.com': 'Work',
  'copilot.microsoft.com': 'Work',
  'bing.com/chat': 'Work',
  'poe.com': 'Work',
  'you.com': 'Work',
  'phind.com': 'Work',
  'mistral.ai': 'Work',
  'groq.com': 'Work',

  // ── SCHOOL / LEARNING ──────────────────────────────────────────────────────
  // Unambiguously educational platforms
  'khanacademy.org': 'School',
  'edx.org': 'School',
  'coursera.org': 'School',
  'codecademy.com': 'School',
  'freecodecamp.org': 'School',
  'brilliant.org': 'School',
  'duolingo.com': 'School',
  'leetcode.com': 'School',
  'hackerrank.com': 'School',
  'theodinproject.com': 'School',
  'w3schools.com': 'School',
  'developer.mozilla.org': 'School',
  'frontendmasters.com': 'School',
  'egghead.io': 'School',
  'scrimba.com': 'School',
  'datacamp.com': 'School',
  'udacity.com': 'School',
  'babbel.com': 'School',
  'rosettastone.com': 'School',
  'busuu.com': 'School',
  'quizlet.com': 'School',
  'anki.tenderapp.com': 'School',
  'ankiweb.net': 'School',
  'chegg.com': 'School',

  // Reference
  'wikipedia.org': 'School',
  'britannica.com': 'School',
  'scholar.google.com': 'School',
  'researchgate.net': 'School',
  'academia.edu': 'School',
  'jstor.org': 'School',
  'arxiv.org': 'School',

  // LMS
  'canvas.instructure.com': 'School',
  'instructure.com': 'School',
  'blackboard.com': 'School',
  'moodle.org': 'School',

  // Universities
  'mit.edu': 'School',
  'harvard.edu': 'School',
  'stanford.edu': 'School',
  'ocw.mit.edu': 'School',

  // ── PERSONAL ───────────────────────────────────────────────────────────────
  // Email
  'mail.google.com': 'Personal',
  'outlook.live.com': 'Personal',
  'proton.me': 'Personal',
  'protonmail.com': 'Personal',
  'yahoo.com': 'Personal',
  'mail.yahoo.com': 'Personal',
  'zoho.com': 'Personal',

  // Messaging
  'web.whatsapp.com': 'Personal',
  'whatsapp.com': 'Personal',
  'telegram.org': 'Personal',
  't.me': 'Personal',
  'signal.org': 'Personal',
  'messenger.com': 'Personal',
  'viber.com': 'Personal',
  'line.me': 'Personal',
  'kakao.com': 'Personal',

  // Shopping & finance
  'amazon.com': 'Personal',
  'ebay.com': 'Personal',
  'etsy.com': 'Personal',
  'walmart.com': 'Personal',
  'shopify.com': 'Personal',
  'aliexpress.com': 'Personal',
  'paypal.com': 'Personal',
  'wise.com': 'Personal',
  'revolut.com': 'Personal',
  'robinhood.com': 'Personal',
  'coinbase.com': 'Personal',

  // Maps & travel
  'maps.google.com': 'Personal',
  'google.com/maps': 'Personal',
  'tripadvisor.com': 'Personal',
  'airbnb.com': 'Personal',
  'booking.com': 'Personal',
  'expedia.com': 'Personal',

  // Cloud storage & personal files
  'photos.google.com': 'Personal',
  'icloud.com': 'Personal',
  'onedrive.live.com': 'Personal',

  // Social — clearly personal
  'pinterest.com': 'Personal',
  'vk.com': 'Personal',
  'ok.ru': 'Personal',
  'qq.com': 'Personal',
  'wechat.com': 'Personal',
  'tumblr.com': 'Personal',
  'tinder.com': 'Personal',
  'bumble.com': 'Personal',
  'hinge.co': 'Personal',

  // News (personal reading habit)
  'bbc.com': 'Personal',
  'cnn.com': 'Personal',
  'nytimes.com': 'Personal',
  'theguardian.com': 'Personal',
  'msn.com': 'Personal',
  'reuters.com': 'Personal',
  'apnews.com': 'Personal',

  // Writing & publishing — personal reading/writing, not work
  'medium.com': 'Personal',
  'substack.com': 'Personal',

  // Auth & identity — always Personal, never needs asking
  'accounts.google.com': 'Personal',
  'myaccount.google.com': 'Personal',
  'login.microsoftonline.com': 'Personal',
  'account.microsoft.com': 'Personal',
  'appleid.apple.com': 'Personal',
  'github.com/login': 'Work',
  'github.com/session': 'Work',
}

// Sites that are AMBIGUOUS — their purpose depends entirely on the user.
// Tabwise always asks the user how to classify these and saves the answer.
export const AMBIGUOUS_SITES = new Set([
  'youtube.com',        // entertainment, school, or work
  'udemy.com',          // school, work, or personal hobby
  'skillshare.com',     // school or personal
  'pluralsight.com',    // school or work
  'linkedin.com',       // work or personal
  'reddit.com',         // entertainment, work, or research
  'twitter.com',        // personal, work, or entertainment
  'x.com',
  'instagram.com',      // personal, work, or entertainment
  'facebook.com',       // personal or work
  'discord.com',        // work, personal, or entertainment
  'slack.com',          // work or personal
  'notion.so',          // work, school, or personal
  'bilibili.com',       // entertainment or school
  'drive.google.com',   // work, school, or personal
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'calendar.google.com',
  'gmail.com',          // work or personal
  'apple.com',
  'quora.com',          // school or personal
  'wordpress.com',      // work or personal
  'tiktok.com',         // entertainment or personal
  'twitch.tv',          // entertainment or work (streamers)
  'github.com',         // work or school — keep as ambiguous for students
])

export function lookupKnownSite(domain: string): string | null {
  const cleaned = domain.replace(/^www\./, '')
  if (KNOWN_SITES[cleaned]) return KNOWN_SITES[cleaned]

  // Match by root domain (e.g. sub.github.com → github.com)
  const parts = cleaned.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.')
    if (KNOWN_SITES[candidate]) return KNOWN_SITES[candidate]
  }
  return null
}

export function isAmbiguous(domain: string): boolean {
  const cleaned = domain.replace(/^www\./, '')
  if (AMBIGUOUS_SITES.has(cleaned)) return true
  const parts = cleaned.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    if (AMBIGUOUS_SITES.has(parts.slice(i).join('.'))) return true
  }
  return false
}
