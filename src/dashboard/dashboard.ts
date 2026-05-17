import { Chart, registerables } from 'chart.js'
import { getScreenTime, getTabRecords, getSettings, saveSettings, clearAllData, getQuotaBlock, clearQuotaBlock, isQuotaBlockedToday } from '../lib/storage'
import { getProvider } from '../lib/ai'
import { AIProviderName, Category } from '../types'

Chart.register(...registerables)

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

const VIEWS = ['overview', 'sites', 'categories', 'resources', 'settings']

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

async function init() {
  const [screentime, records, settings] = await Promise.all([
    getScreenTime(),
    getTabRecords(),
    getSettings(),
  ])

  const today = screentime[todayKey()] ?? {}
  const totalToday = Object.values(today).reduce((a, b) => a + b, 0)
  const topSite = Object.entries(today).sort((a, b) => b[1] - a[1])[0]

  const catColors: Record<string, string> = {}
  settings.categories.forEach(c => { catColors[c.name] = c.color })

  // Multiple tabs of the same domain create separate records; keep the most recently visited.
  const domainMap = new Map<string, typeof records[0]>()
  for (const r of records) {
    const existing = domainMap.get(r.domain)
    if (!existing || r.lastVisited > existing.lastVisited) domainMap.set(r.domain, r)
  }
  const uniqueRecords = Array.from(domainMap.values())

  el('ov-time').textContent = fmt(totalToday)
  el('ov-tabs').textContent = String(records.length)
  el('ov-top').textContent = topSite?.[0] ?? '—'
  el('ov-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const days = last7Days()
  const dayLabels = days.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }))

  const catDatasets = settings.categories.map(cat => ({
    label: cat.name,
    data: days.map(d => {
      const daySites = screentime[d] ?? {}
      const secs = Object.entries(daySites).reduce((sum, [domain, s]) => {
        const rec = domainMap.get(domain)
        return rec?.category === cat.name ? sum + s : sum
      }, 0)
      return Math.round(secs / 60 * 10) / 10
    }),
    backgroundColor: cat.color,
    borderRadius: 0,
    borderSkipped: false,
  }))

  const weekTotals = days.map(d => Object.values(screentime[d] ?? {}).reduce((a, b) => a + b, 0))

  new Chart(el('week-chart') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels: dayLabels, datasets: catDatasets },
    options: {
      plugins: {
        legend: {
          display: true,
          labels: {
            color: 'var(--text-dim)',
            font: { family: 'Space Grotesk', size: 10 },
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            title: ctx => `${dayLabels[ctx[0].dataIndex]} — ${fmt(weekTotals[ctx[0].dataIndex])} total`,
            label: ctx => {
              const mins = ctx.parsed.y
              if (!mins || mins <= 0) return null as unknown as string
              const secs = Math.round(mins * 60)
              return ` ${ctx.dataset.label}: ${fmt(secs)}`
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: 'var(--border)' },
          ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          stacked: true,
          grid: { color: 'var(--border)' },
          ticks: { color: 'var(--text-dim)', font: { family: 'JetBrains Mono', size: 10 }, callback: v => `${v}m` },
        },
      },
    },
  })

  const categorySeconds: Record<string, number> = {}
  for (const [domain, secs] of Object.entries(today)) {
    const cat = domainMap.get(domain)?.category
    if (cat) categorySeconds[cat] = (categorySeconds[cat] ?? 0) + secs
  }
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

  const catsGrid = el('cats-grid')
  settings.categories.forEach(cat => {
    const sitesInCat = uniqueRecords.filter(r => r.category === cat.name)
    const timeInCat = sitesInCat.reduce((sum, r) => sum + (today[r.domain] ?? 0), 0)

    const card = document.createElement('div')
    card.className = 'cat-card'
    card.innerHTML = `
      <div class="cat-card-header">
        ${cat.emoji
          ? `<span class="cat-card-emoji">${cat.emoji}</span>`
          : `<span class="cat-dot large" style="background:${cat.color}"></span>`}
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

  const quotaBlock = await getQuotaBlock()
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
    el('view-settings').querySelector('header')!.after(banner)

    document.getElementById('quota-retry-btn')?.addEventListener('click', async () => {
      await clearQuotaBlock()
      chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' })
      banner.remove()
    })
  }

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
        <input type="text" value="${cat.emoji ?? ''}" class="cat-emoji" data-index="${i}" placeholder="😀" maxlength="4" title="Emoji shown in tab group header" />
        <input type="text" value="${cat.name}" class="cat-name" data-index="${i}" />
        <button class="delete-cat" data-index="${i}">✕</button>
      `
      catList.appendChild(row)
    })
    catList.querySelectorAll<HTMLInputElement>('.cat-emoji').forEach(input => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.index)
        categories[i] = { ...categories[i], emoji: input.value.trim() || undefined }
      })
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
    const emojiInput = el('new-cat-emoji') as HTMLInputElement
    const name = nameInput.value.trim()
    if (!name) return
    const emoji = emojiInput.value.trim() || undefined
    categories.push({ id: randomId(), name, color: colorInput.value, emoji, keywords: [] })
    nameInput.value = ''
    emojiInput.value = ''
    renderCategories()
  })

  el('save-btn').addEventListener('click', async () => {
    const provider = (document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value ?? 'openai') as AIProviderName
    const oldCategories = settings.categories
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
    btn.textContent = 'Saving...'
    btn.setAttribute('disabled', 'true')

    chrome.runtime.sendMessage(
      { type: 'SYNC_GROUPS', oldCategories, newCategories: categories },
      () => {
        btn.removeAttribute('disabled')
        btn.textContent = 'Saved!'
        setTimeout(() => { btn.textContent = 'Save settings' }, 2000)
      }
    )
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

async function refreshScreenTime() {
  const [st, settings] = await Promise.all([getScreenTime(), getSettings()])
  const today = st[todayKey()] ?? {}

  let liveAdd = 0
  let liveDomain: string | null = null
  try {
    const active = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TIME' }) as
      { domain: string | null; elapsed: number }
    liveDomain = active.domain
    liveAdd = active.elapsed
  } catch { /* background not ready */ }

  function liveSeconds(domain: string): number {
    return (today[domain] ?? 0) + (domain === liveDomain ? liveAdd : 0)
  }

  const allDomains = new Set([...Object.keys(today), ...(liveDomain ? [liveDomain] : [])])
  const totalToday = Array.from(allDomains).reduce((sum, d) => sum + liveSeconds(d), 0)
  const ovTime = document.getElementById('ov-time')
  if (ovTime) ovTime.textContent = fmt(totalToday)

  const topEntry = Array.from(allDomains)
    .map(d => [d, liveSeconds(d)] as [string, number])
    .sort((a, b) => b[1] - a[1])[0]
  const ovTop = document.getElementById('ov-top')
  if (ovTop && topEntry) ovTop.textContent = topEntry[0]

  const tbody = document.getElementById('top-sites-body')
  if (tbody) {
    tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => {
      const link = row.querySelector<HTMLAnchorElement>('.site-link')
      const timeCell = row.cells[2]
      if (!link || !timeCell) return
      const secs = liveSeconds(link.textContent?.trim() ?? '')
      if (secs > 0) timeCell.textContent = fmt(secs)
    })
  }

  // Update time values in the sites list
  document.querySelectorAll<HTMLElement>('.site-row').forEach(row => {
    const nameEl = row.querySelector<HTMLElement>('.site-name')
    const timeEl = row.querySelector<HTMLElement>('.site-time')
    if (!nameEl || !timeEl) return
    const secs = liveSeconds(nameEl.textContent?.trim() ?? '')
    timeEl.textContent = secs > 0 ? fmt(secs) : '—'
  })

  const records = await getTabRecords()
  const domainMap = new Map<string, typeof records[0]>()
  for (const r of records) {
    const ex = domainMap.get(r.domain)
    if (!ex || r.lastVisited > ex.lastVisited) domainMap.set(r.domain, r)
  }
  document.querySelectorAll<HTMLElement>('.cat-card').forEach(card => {
    const nameEl = card.querySelector<HTMLElement>('.cat-card-name')
    const statsEl = card.querySelector<HTMLElement>('.cat-card-stats')
    if (!nameEl || !statsEl) return
    const catName = nameEl.textContent?.trim() ?? ''
    const sitesInCat = Array.from(domainMap.values()).filter(r => r.category === catName)
    const timeInCat = sitesInCat.reduce((sum, r) => sum + liveSeconds(r.domain), 0)
    const spans = statsEl.querySelectorAll('span')
    if (spans[1]) {
      spans[1].textContent = timeInCat > 0 ? `${fmt(timeInCat)} today` : 'No activity today'
    }
  })
}

setInterval(refreshScreenTime, 10_000)

const HEAVY_SITES: Record<string, string> = {
  'youtube.com': 'video streaming',
  'netflix.com': 'video streaming',
  'twitch.tv': 'live video',
  'hulu.com': 'video streaming',
  'disneyplus.com': 'video streaming',
  'primevideo.com': 'video streaming',
  'meet.google.com': 'video call',
  'zoom.us': 'video call',
  'teams.microsoft.com': 'video call',
  'webex.com': 'video call',
  'figma.com': 'design canvas',
  'canva.com': 'design canvas',
  'codesandbox.io': 'live IDE',
  'replit.com': 'live IDE',
  'notion.so': 'rich editor',
  'miro.com': 'whiteboard',
  'gmail.com': 'mail app',
  'mail.google.com': 'mail app',
  'docs.google.com': 'doc editor',
  'sheets.google.com': 'spreadsheet',
  'coinbase.com': 'live data',
  'robinhood.com': 'live data',
}

function relativeTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function memImpact(domain: string, isHeavy: boolean): { label: string; color: string } {
  if (isHeavy) return { label: '⬤ High', color: '#ff6b00' }
  return { label: '◉ Normal', color: 'var(--text-dim)' }
}

async function renderResources() {
  const [tabs, tabRecords, settings] = await Promise.all([
    chrome.tabs.query({}),
    getTabRecords(),
    getSettings(),
  ])

  const validTabs = tabs.filter(t => t.url?.startsWith('http') && t.id)
  const grid = el('res-stat-grid')
  grid.innerHTML = ''

  // Heavy sites ≈ 300 MB each; normal tabs ≈ 110 MB each; + 250 MB browser overhead.
  const BROWSER_OVERHEAD_MB = 250
  const HEAVY_MB = 300
  const NORMAL_MB = 110
  let estimatedBrowserMB = BROWSER_OVERHEAD_MB
  validTabs.forEach(t => {
    const domain = t.url ? new URL(t.url).hostname.replace(/^www\./, '') : ''
    estimatedBrowserMB += HEAVY_SITES[domain] ? HEAVY_MB : NORMAL_MB
  })
  const heavyCount = validTabs.filter(t => {
    const d = t.url ? new URL(t.url).hostname.replace(/^www\./, '') : ''
    return !!HEAVY_SITES[d]
  }).length

  await new Promise<void>(resolve => {
    try {
      chrome.system.memory.getInfo(info => {
        const freeBytes = info.availableCapacity
        const totalGB = (info.capacity / 1024 ** 3).toFixed(1)
        const freeGB = (freeBytes / 1024 ** 3).toFixed(1)
        const browserGB = (estimatedBrowserMB / 1024).toFixed(1)

        const pressurePct = Math.min(100, Math.round(estimatedBrowserMB / (info.capacity / 1024 ** 3 * 1024) * 100))
        const pressureColor = pressurePct >= 60 ? '#ff4444' : pressurePct >= 40 ? '#ff9a3c' : '#7ed321'

        const cards = [
          {
            val: `~${browserGB} GB`,
            sub: `estimated browser usage`,
            label: 'Browser RAM',
          },
          {
            val: `${freeGB} GB`,
            sub: `free of ${totalGB} GB total`,
            label: 'Available RAM',
          },
          {
            val: `${validTabs.length}`,
            sub: heavyCount > 0 ? `${heavyCount} heavy tab${heavyCount > 1 ? 's' : ''} detected` : 'no heavy tabs',
            label: 'Open tabs',
          },
        ]
        cards.forEach(({ val, sub, label }) => {
          const card = document.createElement('div')
          card.className = 'stat-card'
          card.innerHTML = `
            <div class="stat-val">${val}</div>
            <div style="font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;margin-bottom:4px">${sub}</div>
            <div class="stat-label">${label}</div>
          `
          grid.appendChild(card)
        })

        const wrap = el('res-pressure-wrap')
        wrap.style.display = 'block'
        el('res-pressure-label').textContent =
          `Browser using ~${pressurePct}% of system RAM — ${pressurePct >= 60 ? 'high, consider closing heavy or inactive tabs' : pressurePct >= 40 ? 'moderate, keep an eye on heavy tabs' : 'healthy'}`
        const bar = el('res-pressure-bar')
        bar.style.width = `${pressurePct}%`
        bar.style.background = pressureColor

        resolve()
      })
    } catch {
      // system.memory not available — show tab-only estimate
      const browserGB = (estimatedBrowserMB / 1024).toFixed(1)
      const cards = [
        { val: `~${browserGB} GB`, sub: 'estimated browser usage', label: 'Browser RAM' },
        { val: `${validTabs.length}`, sub: heavyCount > 0 ? `${heavyCount} heavy tab${heavyCount > 1 ? 's' : ''}` : 'no heavy tabs', label: 'Open tabs' },
      ]
      cards.forEach(({ val, sub, label }) => {
        const card = document.createElement('div')
        card.className = 'stat-card'
        card.innerHTML = `
          <div class="stat-val">${val}</div>
          <div style="font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;margin-bottom:4px">${sub}</div>
          <div class="stat-label">${label}</div>
        `
        grid.appendChild(card)
      })
      resolve()
    }
  })

  const tbody = el('res-tabs-body')
  tbody.innerHTML = ''

  const tabsSorted = [...validTabs].sort((a, b) => {
    const aHeavy = HEAVY_SITES[new URL(a.url!).hostname.replace(/^www\./, '')] ? 1 : 0
    const bHeavy = HEAVY_SITES[new URL(b.url!).hostname.replace(/^www\./, '')] ? 1 : 0
    return bHeavy - aHeavy
  })

  tabsSorted.forEach(tab => {
    const domain = new URL(tab.url!).hostname.replace(/^www\./, '')
    const rec = tabRecords.find(r => r.tabId === tab.id) ?? tabRecords.find(r => r.domain === domain)
    const heavy = HEAVY_SITES[domain]
    const { label: impactLabel, color: impactColor } = memImpact(domain, !!heavy)
    const lastSeen = rec?.lastVisited ? relativeTime(rec.lastVisited) : '—'
    const catColor = settings.categories.find(c => c.name === rec?.category)?.color ?? 'var(--text-dim)'

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>
        <div style="font-size:12px;color:var(--text)">${domain}</div>
        ${heavy ? `<div style="font-size:10px;color:#ff9a3c;font-family:'JetBrains Mono',monospace">${heavy}</div>` : ''}
      </td>
      <td><span class="cat-dot" style="background:${catColor}"></span><span style="font-size:12px;color:var(--text-dim)">${rec?.category ?? '—'}</span></td>
      <td style="color:${impactColor};font-size:12px;font-family:'JetBrains Mono',monospace">${impactLabel}</td>
      <td style="font-size:11px;color:var(--text-low);font-family:'JetBrains Mono',monospace">${lastSeen}</td>
    `
    tbody.appendChild(tr)
  })

  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const inactiveTabs = validTabs
    .map(tab => {
      const domain = new URL(tab.url!).hostname.replace(/^www\./, '')
      const rec = tabRecords.find(r => r.tabId === tab.id) ?? tabRecords.find(r => r.domain === domain)
      return { tab, domain, rec, lastVisited: rec?.lastVisited ?? 0 }
    })
    .filter(t => t.lastVisited < oneHourAgo && !t.tab.active)
    .sort((a, b) => a.lastVisited - b.lastVisited)

  const inactiveTbody = el('res-inactive-body')
  inactiveTbody.innerHTML = ''

  if (inactiveTabs.length === 0) {
    inactiveTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-low);padding:20px 0">No tabs idle for 1+ hour</td></tr>`
  } else {
    inactiveTabs.forEach(({ tab, domain, rec }) => {
      const catColor = settings.categories.find(c => c.name === rec?.category)?.color ?? 'var(--text-dim)'
      const idle = rec?.lastVisited ? relativeTime(rec.lastVisited) : 'unknown'
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td style="font-size:12px;color:var(--text)">${domain}</td>
        <td><span class="cat-dot" style="background:${catColor}"></span><span style="font-size:12px;color:var(--text-dim)">${rec?.category ?? '—'}</span></td>
        <td style="font-size:11px;color:var(--text-low);font-family:'JetBrains Mono',monospace">${idle}</td>
        <td><button class="secondary" style="font-size:10px;padding:3px 8px" data-tab-id="${tab.id}">Close</button></td>
      `
      tr.querySelector<HTMLButtonElement>('[data-tab-id]')?.addEventListener('click', async e => {
        const id = Number((e.target as HTMLElement).dataset.tabId)
        await chrome.tabs.remove(id)
        tr.remove()
      })
      inactiveTbody.appendChild(tr)
    })
  }

  // ── Bulk action buttons ───────────────────────────────────
  const actionsEl = el('res-inactive-actions')
  actionsEl.innerHTML = ''
  if (inactiveTabs.length > 0) {
    const closeAllBtn = document.createElement('button')
    closeAllBtn.className = 'secondary'
    closeAllBtn.textContent = `Close all ${inactiveTabs.length} inactive tabs`
    closeAllBtn.addEventListener('click', async () => {
      await Promise.all(inactiveTabs.map(t => chrome.tabs.remove(t.tab.id!)))
      inactiveTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-low);padding:20px 0">All inactive tabs closed</td></tr>`
      actionsEl.innerHTML = ''
    })
    actionsEl.appendChild(closeAllBtn)
  }
}

document.querySelector('[data-view="resources"]')?.addEventListener('click', () => {
  setTimeout(renderResources, 50)
})
el('res-refresh-btn')?.addEventListener('click', renderResources)
