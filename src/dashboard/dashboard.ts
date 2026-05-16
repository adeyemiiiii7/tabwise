import { Chart, registerables } from 'chart.js'
import { getScreenTime, getTabRecords, getSettings, saveSettings, clearAllData, getQuotaBlock, clearQuotaBlock, isQuotaBlockedToday } from '../lib/storage'
import { getAPIUsageThisMonth } from '../lib/rag'
import { getProvider } from '../lib/ai'
import { AIProviderName, Category } from '../types'

Chart.register(...registerables)

// ── Helpers ────────────────────────────────────────────────

function fmt(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function todayKey() { return new Date().toISOString().split('T')[0] }

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })
}

function randomId() { return Math.random().toString(36).slice(2, 8) }
const el = (id: string) => document.getElementById(id)!

// ── Theme ──────────────────────────────────────────────────

function applyTheme(light: boolean) {
  document.documentElement.classList.toggle('light', light)
  el('theme-icon').textContent = light ? '●' : '○'
  el('theme-label').textContent = light ? 'Dark mode' : 'Light mode'
  localStorage.setItem('tw-theme', light ? 'light' : 'dark')
}

const savedTheme = localStorage.getItem('tw-theme')
applyTheme(savedTheme === 'light')

el('theme-toggle').addEventListener('click', () => {
  applyTheme(!document.documentElement.classList.contains('light'))
})

// ── Navigation ─────────────────────────────────────────────

const VIEWS = ['overview', 'sites', 'categories', 'usage', 'settings']

function showView(name: string) {
  if (!VIEWS.includes(name)) return
  VIEWS.forEach(v => {
    const panel = document.getElementById(`view-${v}`)
    if (panel) panel.style.display = v === name ? 'block' : 'none'
    document.querySelector(`[data-view="${v}"]`)?.classList.toggle('active', v === name)
  })
  location.hash = name === 'overview' ? '' : name
}

document.querySelectorAll<HTMLAnchorElement>('[data-view]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); showView(a.dataset.view!) })
})

const initialHash = location.hash.slice(1)
if (VIEWS.includes(initialHash)) showView(initialHash)

// ── Main init ──────────────────────────────────────────────

async function init() {
  const [screentime, records, settings] = await Promise.all([
    getScreenTime(),
    getTabRecords(),
    getSettings(),
  ])

  const today = screentime[todayKey()] ?? {}
  const totalToday = Object.values(today).reduce((a, b) => a + b, 0)
  const topSite = Object.entries(today).sort((a, b) => b[1] - a[1])[0]

  // Category color map
  const catColors: Record<string, string> = {}
  settings.categories.forEach(c => { catColors[c.name] = c.color })

  // Deduplicate records by domain — keep the most recently visited entry.
  // Multiple browser tabs of the same site create separate records (same domain, different tabId).
  // For display purposes we only want one row per domain.
  const domainMap = new Map<string, typeof records[0]>()
  for (const r of records) {
    const existing = domainMap.get(r.domain)
    if (!existing || r.lastVisited > existing.lastVisited) domainMap.set(r.domain, r)
  }
  const uniqueRecords = Array.from(domainMap.values())

  // ── Overview ─────────────────────────────────────────────

  el('ov-time').textContent = fmt(totalToday)
  el('ov-tabs').textContent = String(uniqueRecords.length)
  el('ov-top').textContent = topSite?.[0] ?? '—'
  el('ov-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // Week bar chart — values in minutes, tooltip shows formatted time
  const days = last7Days()
  const weekSeconds = days.map(d =>
    Object.values(screentime[d] ?? {}).reduce((a, b) => a + b, 0)
  )

  new Chart(el('week-chart') as HTMLCanvasElement, {
    type: 'bar',
    data: {
      labels: days.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })),
      datasets: [{ data: weekSeconds.map(s => Math.round(s / 60 * 10) / 10), backgroundColor: 'var(--accent)', borderRadius: 4 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => fmt(weekSeconds[ctx.dataIndex]) },
        },
      },
      scales: {
        x: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 10 } } },
        y: {
          grid: { color: 'var(--border)' },
          ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 10 }, callback: v => `${v}m` },
        },
      },
    },
  })

  // Category donut — use raw seconds so small values still show proportionally
  const categorySeconds: Record<string, number> = {}
  for (const [domain, secs] of Object.entries(today)) {
    const cat = domainMap.get(domain)?.category
    if (cat) categorySeconds[cat] = (categorySeconds[cat] ?? 0) + secs
  }
  // Include ALL configured categories, show 0-time ones as a thin sliver
  const catLabels = settings.categories.map(c => c.name)
  const catValues = catLabels.map(name => categorySeconds[name] ?? 0)
  const catBg = catLabels.map(name => catColors[name] ?? '#333')

  new Chart(el('cat-chart') as HTMLCanvasElement, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{ data: catValues, backgroundColor: catBg, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { labels: { color: 'var(--text-dim)', font: { size: 11, family: 'Space Grotesk' }, boxWidth: 8 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(catValues[ctx.dataIndex])}` } },
      },
      cutout: '68%',
    },
  })

  // Top sites table
  const tbody = el('top-sites-body')
  Object.entries(today)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([domain, secs]) => {
      const record = domainMap.get(domain)
      const cat = record?.category ?? '—'
      const color = catColors[cat] ?? 'var(--text-dim)'
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td><a href="https://${domain}" target="_blank" class="site-link">${domain}</a></td>
        <td style="color:var(--text-dim);font-size:12px"><span class="cat-dot" style="background:${color}"></span>${cat}</td>
        <td>${fmt(secs)}</td>
      `
      tbody.appendChild(tr)
    })

  // ── Sites view ────────────────────────────────────────────

  let sitesFilter = 'All'
  const filtersEl = el('sites-filters')
  const sitesListEl = el('sites-list')

  function renderSites() {
    sitesListEl.innerHTML = ''
    const filtered = sitesFilter === 'All'
      ? uniqueRecords
      : uniqueRecords.filter(r => r.category === sitesFilter)
    const sorted = [...filtered].sort((a, b) => (today[b.domain] ?? 0) - (today[a.domain] ?? 0))

    if (sorted.length === 0) {
      sitesListEl.innerHTML = '<div class="empty-state">No sites tracked yet</div>'
      return
    }

    sorted.forEach(record => {
      const time = today[record.domain] ?? 0
      const color = catColors[record.category] ?? 'var(--text-dim)'
      const row = document.createElement('div')
      row.className = 'site-row'
      row.innerHTML = `
        <a href="https://${record.domain}" target="_blank" class="site-name">${record.domain}</a>
        <span class="cat-badge">
          <span class="cat-dot" style="background:${color}"></span>${record.category}
        </span>
        <span class="site-time">${time > 0 ? fmt(time) : '—'}</span>
      `
      sitesListEl.appendChild(row)
    })
  }

  const allChip = document.createElement('button')
  allChip.className = 'filter-chip active'
  allChip.textContent = 'All'
  allChip.addEventListener('click', () => {
    sitesFilter = 'All'
    filtersEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
    allChip.classList.add('active')
    renderSites()
  })
  filtersEl.appendChild(allChip)

  settings.categories.forEach(cat => {
    const chip = document.createElement('button')
    chip.className = 'filter-chip'
    const dot = document.createElement('span')
    dot.style.cssText = `background:${cat.color};width:6px;height:6px;border-radius:50%;display:inline-block`
    chip.appendChild(dot)
    chip.appendChild(document.createTextNode(cat.name))
    chip.addEventListener('click', () => {
      sitesFilter = cat.name
      filtersEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      renderSites()
    })
    filtersEl.appendChild(chip)
  })

  renderSites()

  // ── Categories view ───────────────────────────────────────

  const catsGrid = el('cats-grid')
  settings.categories.forEach(cat => {
    const sitesInCat = uniqueRecords.filter(r => r.category === cat.name)
    const timeInCat = sitesInCat.reduce((sum, r) => sum + (today[r.domain] ?? 0), 0)

    const card = document.createElement('div')
    card.className = 'cat-card'
    card.innerHTML = `
      <div class="cat-card-header">
        <span class="cat-dot large" style="background:${cat.color}"></span>
        <span class="cat-card-name">${cat.name}</span>
      </div>
      <div class="cat-card-stats">
        <span>${sitesInCat.length} site${sitesInCat.length !== 1 ? 's' : ''}</span>
        <span>${timeInCat > 0 ? fmt(timeInCat) + ' today' : 'No activity today'}</span>
      </div>
    `
    card.addEventListener('click', () => {
      sitesFilter = cat.name
      showView('sites')
      filtersEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
      filtersEl.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach(c => {
        if (c.textContent?.trim() === cat.name) c.classList.add('active')
      })
      renderSites()
    })
    catsGrid.appendChild(card)
  })

  // ── AI Usage view ─────────────────────────────────────────

  // Quota block banner
  const quotaBlock = await getQuotaBlock()
  const usageHeader = el('view-usage').querySelector('header')!
  const existingBanner = document.getElementById('quota-banner')
  if (existingBanner) existingBanner.remove()

  if (quotaBlock && isQuotaBlockedToday(quotaBlock)) {
    const blockedTime = new Date(quotaBlock.blockedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const banner = document.createElement('div')
    banner.id = 'quota-banner'
    banner.style.cssText = `
      background: #1a0f00;
      border: 1px solid #ff6b00;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    `
    banner.innerHTML = `
      <div style="font-size:18px;line-height:1">⚠</div>
      <div style="flex:1">
        <div style="font-weight:600;color:#ff9a3c;font-size:13px;margin-bottom:4px">
          ${quotaBlock.provider} daily quota reached — smart mode active
        </div>
        <div style="font-size:12px;color:#a06030;line-height:1.5">
          Hit at ${blockedTime}. Tabwise is organising your tabs using pattern matching until your quota resets at midnight UTC.
          Every tab you manually correct is saved and improves future categorisation.
        </div>
        <button id="quota-retry-btn" style="
          margin-top:10px;background:none;border:1px solid #ff6b00;border-radius:5px;
          color:#ff9a3c;font-size:11px;padding:5px 12px;cursor:pointer;font-family:inherit;
        ">Try AI again</button>
      </div>
    `
    usageHeader.after(banner)

    document.getElementById('quota-retry-btn')?.addEventListener('click', async () => {
      await clearQuotaBlock()
      chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' })
      banner.remove()
    })
  }

  const rawUsage = await chrome.storage.local.get(['apiUsage', 'apiTokens'])
  const usageData: Record<string, number> = rawUsage.apiUsage ?? {}
  const tokenData: Record<string, { input: number; output: number }> = rawUsage.apiTokens ?? {}

  const thisMonth = new Date().toISOString().slice(0, 7)
  const todayStr = todayKey()

  function sumUsage(filter: (d: string) => boolean) {
    return Object.entries(usageData).filter(([d]) => filter(d)).reduce((s, [, n]) => s + n, 0)
  }
  function sumTokens(filter: (d: string) => boolean) {
    let input = 0, output = 0
    Object.entries(tokenData).filter(([d]) => filter(d)).forEach(([, t]) => { input += t.input; output += t.output })
    return { input, output, total: input + output }
  }

  const todayCalls   = sumUsage(d => d === todayStr)
  const monthCalls   = sumUsage(d => d.startsWith(thisMonth))
  const totalCalls   = sumUsage(() => true)
  const todayTok     = sumTokens(d => d === todayStr)
  const monthTok     = sumTokens(d => d.startsWith(thisMonth))
  const totalTok     = sumTokens(() => true)

  // Cost rates per 1M tokens (approximate public pricing, May 2026)
  const RATES: Record<string, { input: number; output: number }> = {
    openai: { input: 0.15,  output: 0.60  },  // gpt-4o-mini
    claude: { input: 0.80,  output: 4.00  },  // haiku 4.5
    gemini: { input: 0.075, output: 0.30  },  // gemini-2.0-flash-lite
  }
  const rate = RATES[settings.provider] ?? RATES.openai

  function estimateCost(tok: { input: number; output: number }): string {
    const usd = (tok.input / 1_000_000) * rate.input + (tok.output / 1_000_000) * rate.output
    if (usd < 0.0001) return '< $0.0001'
    return `~$${usd.toFixed(4)}`
  }

  function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  const usageCards = el('usage-cards')
  const cardData = [
    { val: String(todayCalls),       sub: `${fmtTokens(todayTok.total)} tokens · ${estimateCost(todayTok)}`, label: 'Today' },
    { val: String(monthCalls),       sub: `${fmtTokens(monthTok.total)} tokens · ${estimateCost(monthTok)}`, label: 'This month' },
    { val: String(totalCalls),       sub: `${fmtTokens(totalTok.total)} tokens · ${estimateCost(totalTok)}`, label: 'All time' },
  ]
  cardData.forEach(({ val, sub, label }) => {
    const card = document.createElement('div')
    card.className = 'stat-card'
    card.innerHTML = `
      <div class="stat-val">${val} <span style="font-size:13px;font-weight:400;color:var(--text-dim)">calls</span></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim);margin-bottom:6px">${sub}</div>
      <div class="stat-label">${label}</div>
    `
    usageCards.appendChild(card)
  })

  const last30 = Object.entries(usageData).sort(([a], [b]) => a.localeCompare(b)).slice(-30)

  new Chart(el('usage-chart') as HTMLCanvasElement, {
    type: 'bar',
    data: {
      labels: last30.map(([d]) =>
        new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      ),
      datasets: [{ data: last30.map(([, n]) => n), backgroundColor: 'var(--accent)', borderRadius: 3 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45 } },
        y: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } },
      },
    },
  })

  const usageBody = el('usage-body')
  if (last30.length === 0) {
    usageBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-low);padding:24px 0">No API calls recorded yet</td></tr>`
  } else {
    ;[...last30].reverse().forEach(([date, calls]) => {
      const tok = tokenData[date] ?? { input: 0, output: 0 }
      const cost = estimateCost(tok)
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="mono" style="color:var(--text)">${date}</td>
        <td style="text-align:right;color:var(--text-dim)">${calls}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${fmtTokens(tok.input + tok.output)}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-low)">${cost}</td>
      `
      usageBody.appendChild(tr)
    })
  }

  // ── Settings view ─────────────────────────────────────────

  let categories: Category[] = [...settings.categories]

  document.querySelectorAll<HTMLInputElement>('input[name="provider"]').forEach(r => {
    if (r.value === settings.provider) r.checked = true
  })

  const apiKeyInput = el('api-key') as HTMLInputElement
  apiKeyInput.value = settings.apiKey

  el('test-btn').addEventListener('click', async () => {
    const result = el('test-result')
    const key = apiKeyInput.value.trim()
    const provider = (document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value ?? 'openai') as AIProviderName
    if (!key) { result.textContent = 'Enter an API key first.'; result.className = 'hint error'; return }
    result.textContent = 'Testing...'
    result.className = 'hint'
    try {
      await getProvider(provider, key).categorize('https://github.com', 'GitHub', ['Work', 'Personal'])
      result.textContent = 'API key works!'
      result.className = 'hint success'
    } catch {
      result.textContent = 'Invalid key or network error.'
      result.className = 'hint error'
    }
  })

  const autoToggle = el('auto-mode') as HTMLInputElement
  autoToggle.checked = settings.autoMode

  const inactivityInput = el('inactivity') as HTMLInputElement
  inactivityInput.value = String(settings.inactivityThresholdHours)

  function renderCategories() {
    const catList = el('categories-list')
    catList.innerHTML = ''
    categories.forEach((cat, i) => {
      const row = document.createElement('div')
      row.className = 'category-row'
      row.innerHTML = `
        <span class="cat-color" style="background:${cat.color}"></span>
        <input type="text" value="${cat.name}" class="cat-name" data-index="${i}" />
        <button class="delete-cat" data-index="${i}">✕</button>
      `
      catList.appendChild(row)
    })
    catList.querySelectorAll<HTMLInputElement>('.cat-name').forEach(input => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.index)
        categories[i] = { ...categories[i], name: input.value }
      })
    })
    catList.querySelectorAll<HTMLButtonElement>('.delete-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        if (categories.length <= 1) return
        categories.splice(Number(btn.dataset.index), 1)
        renderCategories()
      })
    })
  }
  renderCategories()

  el('add-cat-btn').addEventListener('click', () => {
    const nameInput = el('new-cat-name') as HTMLInputElement
    const colorInput = el('new-cat-color') as HTMLInputElement
    const name = nameInput.value.trim()
    if (!name) return
    categories.push({ id: randomId(), name, color: colorInput.value, keywords: [] })
    nameInput.value = ''
    renderCategories()
  })

  el('save-btn').addEventListener('click', async () => {
    const provider = (document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value ?? 'openai') as AIProviderName
    await saveSettings({
      ...settings,
      provider,
      apiKey: apiKeyInput.value.trim(),
      autoMode: autoToggle.checked,
      inactivityThresholdHours: Number(inactivityInput.value),
      categories,
      onboardingComplete: true,
    })
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' })
    const btn = el('save-btn')
    btn.textContent = 'Saved!'
    setTimeout(() => { btn.textContent = 'Save settings' }, 2000)
  })

  el('clear-cache-btn').addEventListener('click', async () => {
    if (!confirm('Clear saved site picks and API stats? Screen time is kept.')) return
    await chrome.storage.local.remove(['learnedSites', 'apiUsage'])
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' })
    const btn = el('clear-cache-btn')
    btn.textContent = 'Done!'
    setTimeout(() => { btn.textContent = 'Reset algorithm' }, 2500)
  })

  el('export-btn').addEventListener('click', async () => {
    const st = await getScreenTime()
    const rows = ['Date,Domain,Seconds']
    for (const [date, sites] of Object.entries(st)) {
      for (const [domain, secs] of Object.entries(sites)) {
        rows.push(`${date},${domain},${secs}`)
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tabwise-screentime.csv'
    a.click()
  })

  el('reset-btn').addEventListener('click', async () => {
    if (confirm('Delete ALL data including settings and screen time? Cannot be undone.')) {
      await clearAllData()
      location.reload()
    }
  })
}

init()
