import { Chart, registerables } from 'chart.js'
import { getScreenTime, getTabRecords, getSettings, saveSettings, clearAllData, getQuotaBlock, clearQuotaBlock, isQuotaBlockedToday, getSiteMemoryHints, SiteMemoryHint } from '../lib/storage'
import { getProvider } from '../lib/ai'
import { AIProviderName, Category } from '../types'

Chart.register(...registerables)

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function askConfirm({ title, message, confirmLabel = 'Confirm', danger = false }: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal-box">
        <h3 class="modal-title">${title}</h3>
        <p class="modal-msg">${message}</p>
        <div class="modal-actions">
          <button class="modal-cancel secondary">Cancel</button>
          <button class="modal-confirm${danger ? ' danger' : ''}">${confirmLabel}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const close = (result: boolean) => { overlay.remove(); resolve(result) }
    overlay.querySelector('.modal-cancel')!.addEventListener('click', () => close(false))
    overlay.querySelector('.modal-confirm')!.addEventListener('click', () => close(true))
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false) })
  })
}

let weekChart: Chart | null = null
let catChart: Chart | null = null

function fmt(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey() { return localDateKey() }

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return localDateKey(d)
  })
}

let selectedSiteDay = localDateKey()

function randomId() { return Math.random().toString(36).slice(2, 8) }
const el = (id: string) => document.getElementById(id)!

function applyTheme(light: boolean) {
  document.documentElement.classList.toggle('light', light)
  el('theme-icon').textContent = light ? '●' : '○'
  el('theme-label').textContent = light ? 'Dark mode' : 'Light mode'
  localStorage.setItem('tw-theme', light ? 'light' : 'dark')

  const textDim = cssVar('--text-dim')
  const border  = cssVar('--border')

  if (weekChart) {
    type ScaleOpts = { ticks: { color: string }; grid: { color: string } }
    const lo = weekChart.options
    lo.plugins!.legend!.labels!.color = textDim
    ;(lo.scales!.x as unknown as ScaleOpts).ticks.color = textDim
    ;(lo.scales!.x as unknown as ScaleOpts).grid.color  = border
    ;(lo.scales!.y as unknown as ScaleOpts).ticks.color = textDim
    ;(lo.scales!.y as unknown as ScaleOpts).grid.color  = border
    weekChart.update()
  }
  if (catChart) {
    catChart.options.plugins!.legend!.labels!.color = textDim
    catChart.update()
  }
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

  const todayStart = new Date(todayKey()).getTime()
  const organisedToday = records.filter(r => r.lastVisited >= todayStart).length

  el('ov-time').textContent = fmt(totalToday)
  el('ov-tabs').textContent = String(organisedToday)
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

  if (weekChart) weekChart.destroy()
  weekChart = new Chart(el('week-chart') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels: dayLabels, datasets: catDatasets },
    options: {
      plugins: {
        legend: {
          display: true,
          labels: {
            color: cssVar('--text-dim'),
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
          grid: { color: cssVar('--border') },
          ticks: { color: cssVar('--text-dim'), font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          stacked: true,
          grid: { color: cssVar('--border') },
          ticks: { color: cssVar('--text-dim'), font: { family: 'JetBrains Mono', size: 10 }, callback: v => `${v}m` },
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

  if (catChart) catChart.destroy()
  catChart = new Chart(el('cat-chart') as HTMLCanvasElement, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{ data: catValues, backgroundColor: catBg, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { labels: { color: cssVar('--text-dim'), font: { size: 11, family: 'Space Grotesk' }, boxWidth: 8 } },
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
    const dayData = screentime[selectedSiteDay] ?? {}
    const screentimeDomains = Object.keys(dayData)

    const dayStart = new Date(selectedSiteDay + 'T00:00:00').getTime()
    const dayEnd = dayStart + 86_400_000
    const visitedOnDay = uniqueRecords
      .filter(r => r.lastVisited >= dayStart && r.lastVisited < dayEnd && !dayData[r.domain])
      .map(r => r.domain)

    const allDomains = [...screentimeDomains, ...visitedOnDay]
    const filtered = sitesFilter === 'All'
      ? allDomains
      : allDomains.filter(d => (domainMap.get(d)?.category ?? '—') === sitesFilter)
    const sorted = [...filtered].sort((a, b) => (dayData[b] ?? 0) - (dayData[a] ?? 0))

    if (sorted.length === 0) {
      sitesListEl.innerHTML = `<div class="empty-state">${
        screentimeDomains.length === 0 ? 'No sites tracked on this day' : 'No sites in this category'
      }</div>`
      return
    }

    sorted.forEach(domain => {
      const record = domainMap.get(domain)
      const cat = record?.category ?? '—'
      const color = catColors[cat] ?? 'var(--text-dim)'
      const time = dayData[domain] ?? 0
      const row = document.createElement('div')
      row.className = 'site-row'
      row.innerHTML = `
        <a href="https://${domain}" target="_blank" class="site-name">${domain}</a>
        <span class="cat-badge">
          <span class="cat-dot" style="background:${color}"></span>${cat}
        </span>
        <span class="site-time">${time > 0 ? fmt(time) : '—'}</span>
      `
      sitesListEl.appendChild(row)
    })
  }

  function buildWeekStrip() {
    const strip = el('sites-week-strip')
    strip.innerHTML = ''
    last7Days().forEach(dateKey => {
      const d = new Date(dateKey + 'T12:00:00')
      const btn = document.createElement('button')
      btn.className = 'week-day-btn' + (dateKey === selectedSiteDay ? ' active' : '')
      btn.innerHTML = `
        <span class="wdb-label">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
        <span class="wdb-num">${d.getDate()}</span>
      `
      btn.addEventListener('click', () => {
        selectedSiteDay = dateKey
        strip.querySelectorAll('.week-day-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        renderSites()
      })
      strip.appendChild(btn)
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

  buildWeekStrip()
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

  const useAIToggle = el('use-ai') as HTMLInputElement
  const aiProviderFields = el('ai-provider-fields')

  useAIToggle.checked = settings.useAI ?? true

  function syncAIFieldsVisibility() {
    aiProviderFields.style.opacity = useAIToggle.checked ? '1' : '0.35'
    aiProviderFields.style.pointerEvents = useAIToggle.checked ? '' : 'none'
  }
  syncAIFieldsVisibility()
  useAIToggle.addEventListener('change', syncAIFieldsVisibility)

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
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index)
        if (categories.length <= 1) return
        if (!await askConfirm({
          title: 'Delete category?',
          message: `Delete "${categories[idx].name}"? Tabs assigned to it will become uncategorized.`,
          confirmLabel: 'Delete',
        })) return
        categories.splice(idx, 1)
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
    categories.push({ id: randomId(), name, color: colorInput.value, emoji })
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
      useAI: useAIToggle.checked,
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
    if (!await askConfirm({
      title: 'Reset algorithm?',
      message: 'Clears saved site picks and API stats. Screen time is kept.',
      confirmLabel: 'Reset',
    })) return
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
    if (!await askConfirm({
      title: 'Delete all data?',
      message: 'Removes all settings, categories, and screen time. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })) return
    await clearAllData()
    location.reload()
  })
}

init()

async function refreshScreenTime() {
  const [st] = await Promise.all([getScreenTime(), getSettings()])
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

  if (selectedSiteDay === todayKey()) {
    document.querySelectorAll<HTMLElement>('.site-row').forEach(row => {
      const nameEl = row.querySelector<HTMLElement>('.site-name')
      const timeEl = row.querySelector<HTMLElement>('.site-time')
      if (!nameEl || !timeEl) return
      const secs = liveSeconds(nameEl.textContent?.trim() ?? '')
      timeEl.textContent = secs > 0 ? fmt(secs) : '—'
    })
  }

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

// Badge labels — shown as a tag on tabs with noticeably high footprint
const SITE_LABELS: Record<string, string> = {
  'youtube.com': 'video streaming',
  'netflix.com': 'video streaming',
  'twitch.tv': 'live video',
  'hulu.com': 'video streaming',
  'disneyplus.com': 'video streaming',
  'primevideo.com': 'video streaming',
  'vimeo.com': 'video',
  'dailymotion.com': 'video',
  'meet.google.com': 'video call',
  'zoom.us': 'video call',
  'teams.microsoft.com': 'video call',
  'webex.com': 'video call',
  'discord.com': 'voice/video',
  'figma.com': 'design canvas',
  'canva.com': 'design canvas',
  'miro.com': 'whiteboard',
  'codesandbox.io': 'live IDE',
  'replit.com': 'live IDE',
  'stackblitz.com': 'live IDE',
  'notion.so': 'rich editor',
  'slack.com': 'messaging app',
  'gmail.com': 'mail app',
  'mail.google.com': 'mail app',
  'docs.google.com': 'doc editor',
  'sheets.google.com': 'spreadsheet',
  'maps.google.com': 'maps',
  'tradingview.com': 'live charts',
  'coinbase.com': 'live data',
  'robinhood.com': 'live data',
  'binance.com': 'live data',
  'tiktok.com': 'video feed',
  'facebook.com': 'social app',
}

// Per-domain memory estimates in MB — used as fallback when chrome.processes data is unavailable.
// Values based on Chrome Task Manager measurements across typical usage sessions.
const SITE_MEMORY_MB: Record<string, number> = {
  // Video streaming
  'youtube.com': 350,
  'netflix.com': 300,
  'twitch.tv': 420,
  'hulu.com': 280,
  'disneyplus.com': 280,
  'primevideo.com': 280,
  'vimeo.com': 220,
  'dailymotion.com': 200,
  // Video / audio calls
  'meet.google.com': 280,
  'zoom.us': 220,
  'teams.microsoft.com': 380,
  'webex.com': 250,
  'discord.com': 270,
  // Design & creative
  'figma.com': 520,
  'canva.com': 320,
  'miro.com': 380,
  // Development
  'codesandbox.io': 350,
  'replit.com': 300,
  'stackblitz.com': 280,
  'codepen.io': 180,
  'github.com': 130,
  'gitlab.com': 130,
  'bitbucket.org': 120,
  // Google Workspace
  'mail.google.com': 170,
  'gmail.com': 170,
  'docs.google.com': 160,
  'sheets.google.com': 190,
  'slides.google.com': 170,
  'drive.google.com': 130,
  'calendar.google.com': 120,
  'maps.google.com': 200,
  'google.com': 90,
  // Productivity & project tools
  'notion.so': 210,
  'slack.com': 320,
  'linear.app': 160,
  'airtable.com': 200,
  'monday.com': 180,
  'asana.com': 160,
  'trello.com': 140,
  'jira.atlassian.com': 180,
  'confluence.atlassian.com': 170,
  // Social media
  'twitter.com': 160,
  'x.com': 160,
  'facebook.com': 220,
  'instagram.com': 190,
  'reddit.com': 140,
  'linkedin.com': 170,
  'tiktok.com': 250,
  // Finance / live data
  'coinbase.com': 210,
  'robinhood.com': 210,
  'binance.com': 220,
  'tradingview.com': 300,
  // Shopping
  'amazon.com': 150,
  'ebay.com': 130,
  // Communication
  'web.whatsapp.com': 150,
  'web.telegram.org': 130,
  // Content / news
  'medium.com': 110,
  'substack.com': 100,
  'wikipedia.org': 70,
  'nytimes.com': 140,
  'bbc.com': 120,
  'theguardian.com': 120,
}

function relativeTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}


interface ChromeProcessInfo {
  type: string
  tabs?: number[]
  privateMemory?: number
}

async function getTabMemoryMap(tabIds: Set<number>): Promise<Map<number, number>> {
  type ProcessesAPI = {
    getProcessInfo(
      ids: number[],
      mem: boolean,
      cb: (procs: Record<number, ChromeProcessInfo>) => void
    ): void
  }
  const api = (chrome as unknown as { processes?: ProcessesAPI }).processes
  if (!api) return new Map()
  return new Promise(resolve => {
    try {
      api.getProcessInfo([], true, procs => {
        const map = new Map<number, number>()
        Object.values(procs).forEach(proc => {
          if (proc.type !== 'renderer' || !proc.tabs?.length || proc.privateMemory == null) return
          const mbPerTab = Math.round(proc.privateMemory / proc.tabs.length / 1024 / 1024)
          proc.tabs.forEach(id => { if (tabIds.has(id)) map.set(id, mbPerTab) })
        })
        resolve(map)
      })
    } catch {
      resolve(new Map())
    }
  })
}

function estimateFromHint(hint: SiteMemoryHint): number {
  if (hint.hasVideo)          return 300
  if (hint.hasCanvas)         return 350
  if (hint.heapMB > 150)      return Math.round(hint.heapMB * 1.8)
  if (hint.heapMB > 80)       return Math.round(hint.heapMB * 2.2)
  if (hint.heapMB > 30)       return Math.round(hint.heapMB * 2.5)
  return Math.max(80, Math.round(hint.heapMB * 3))
}

async function renderResources() {
  const [tabs, tabRecords, settings, siteMemoryHints] = await Promise.all([
    chrome.tabs.query({}),
    getTabRecords(),
    getSettings(),
    getSiteMemoryHints(),
  ])

  const validTabs = tabs.filter(t => t.url?.startsWith('http') && t.id)
  const grid = el('res-stat-grid')
  grid.innerHTML = ''

  const BROWSER_OVERHEAD_MB = 250
  const DEFAULT_TAB_MB = 120

  const tabIds = new Set(validTabs.map(t => t.id!))
  const tabMemoryMap = await getTabMemoryMap(tabIds)
  const hasRealMemory = tabMemoryMap.size > 0

  function tabMemMB(tabId: number, domain: string): { mb: number; real: boolean } {
    const real = tabMemoryMap.get(tabId)
    if (real !== undefined) return { mb: real, real: true }
    if (SITE_MEMORY_MB[domain]) return { mb: SITE_MEMORY_MB[domain], real: false }
    const hint = siteMemoryHints[domain]
    if (hint) return { mb: estimateFromHint(hint), real: false }
    return { mb: DEFAULT_TAB_MB, real: false }
  }

  const heavyTabs = validTabs.filter(t => {
    const d = t.url ? new URL(t.url).hostname.replace(/^www\./, '') : ''
    return !!SITE_LABELS[d]
  })
  const heavyCount = heavyTabs.length

  const totalBrowserMB = BROWSER_OVERHEAD_MB + validTabs.reduce((sum, t) => {
    const d = t.url ? new URL(t.url).hostname.replace(/^www\./, '') : ''
    return sum + tabMemMB(t.id!, d).mb
  }, 0)
  const browserGB = (totalBrowserMB / 1024).toFixed(1)

  function makeStatCard(val: string, sub: string, label: string) {
    const card = document.createElement('div')
    card.className = 'stat-card'
    card.innerHTML = `
      <div class="stat-val">${val}</div>
      <div class="res-stat-sub">${sub}</div>
      <div class="stat-label">${label}</div>
    `
    return card
  }

  const browserRAMLabel = hasRealMemory ? `${browserGB} GB` : `~${browserGB} GB`
  const browserRAMSub   = hasRealMemory ? `${validTabs.length} tabs · from Chrome process data` : `${validTabs.length} tabs · estimated`

  await new Promise<void>(resolve => {
    try {
      chrome.system.memory.getInfo(info => {
        const totalGB     = (info.capacity / 1024 ** 3).toFixed(1)
        const freeGB      = (info.availableCapacity / 1024 ** 3).toFixed(1)
        const pressurePct = Math.min(100, Math.round(totalBrowserMB / (info.capacity / 1024 / 1024) * 100))
        const pressureColor  = pressurePct >= 60 ? '#ff4444' : pressurePct >= 40 ? '#ff9a3c' : '#7ed321'
        const pressureStatus = pressurePct >= 60 ? 'High — close heavy or idle tabs' : pressurePct >= 40 ? 'Moderate — keep an eye on heavy tabs' : 'Healthy'

        grid.appendChild(makeStatCard(browserRAMLabel, browserRAMSub, 'Browser RAM'))
        grid.appendChild(makeStatCard(`${freeGB} GB`, `free of ${totalGB} GB total`, 'System RAM free'))
        grid.appendChild(makeStatCard(String(validTabs.length), `${heavyCount} heavy · ${validTabs.length - heavyCount} normal`, 'Open tabs'))

        const wrap = el('res-pressure-wrap')
        wrap.style.display = 'block'
        el('res-pressure-label').textContent = `RAM pressure — ${pressureStatus}`
        el('res-pressure-pct').textContent    = `${pressurePct}%`
        const bar = el('res-pressure-bar')
        bar.style.width      = `${pressurePct}%`
        bar.style.background = pressureColor
        el('res-pressure-hint').textContent =
          pressurePct >= 60
            ? `Chrome is using a large share of your system RAM. Closing heavy tabs (video, design apps) or idle tabs will free memory immediately.`
            : pressurePct >= 40
            ? `Memory use is moderate. Heavy tabs like video streams and design tools are the biggest contributors.`
            : `Memory use is low. All tabs are running comfortably within your system RAM.`

        resolve()
      })
    } catch {
      grid.appendChild(makeStatCard(browserRAMLabel, browserRAMSub, 'Browser RAM'))
      grid.appendChild(makeStatCard(String(validTabs.length), `${heavyCount} heavy · ${validTabs.length - heavyCount} normal`, 'Open tabs'))
      resolve()
    }
  })

  const tbody = el('res-tabs-body')
  tbody.innerHTML = ''

  const tabsSorted = [...validTabs].sort((a, b) => {
    const da = new URL(a.url!).hostname.replace(/^www\./, '')
    const db = new URL(b.url!).hostname.replace(/^www\./, '')
    return tabMemMB(b.id!, db).mb - tabMemMB(a.id!, da).mb
  })

  tabsSorted.forEach(tab => {
    const domain   = new URL(tab.url!).hostname.replace(/^www\./, '')
    const rec            = tabRecords.find(r => r.tabId === tab.id) ?? tabRecords.find(r => r.domain === domain)
    const heavy          = SITE_LABELS[domain]
    const { mb: memMB, real: memReal } = tabMemMB(tab.id!, domain)
    const memDisplay     = memReal ? `${memMB} MB` : `~${memMB} MB`
    const catColor       = settings.categories.find(c => c.name === rec?.category)?.color ?? 'var(--text-dim)'
    const lastSeen       = rec?.lastVisited ? relativeTime(rec.lastVisited) : '—'
    const title          = tab.title ? tab.title.replace(/</g, '&lt;').slice(0, 60) : domain

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="res-tab-cell">
        <span class="res-tab-domain">${domain}</span>
        <span class="res-tab-title">${title}</span>
        ${heavy ? `<span class="res-heavy-tag">${heavy}</span>` : ''}
      </td>
      <td><span class="cat-dot" style="background:${catColor}"></span><span class="res-cat-name">${rec?.category ?? '—'}</span></td>
      <td class="res-mem-cell ${memMB >= 200 ? 'res-mem-heavy' : ''}">${memDisplay}</td>
      <td class="res-last-seen">${lastSeen}</td>
      <td><button class="res-close-btn" data-tab-id="${tab.id}" title="Close this tab">✕</button></td>
    `
    tr.querySelector<HTMLButtonElement>('.res-close-btn')?.addEventListener('click', async () => {
      if (!await askConfirm({ title: 'Close tab?', message: `Close ${domain}?`, confirmLabel: 'Close' })) return
      await chrome.tabs.remove(tab.id!)
      tr.remove()
    })
    tbody.appendChild(tr)
  })

  const actionsEl = el('res-actions')
  actionsEl.innerHTML = ''
  if (heavyCount > 0) {
    const heavyMemGB = Math.round(heavyTabs.reduce((s, t) => {
      const d = new URL(t.url!).hostname.replace(/^www\./, '')
      return s + tabMemMB(t.id!, d).mb
    }, 0) / 1024 * 10) / 10
    const closeHeavyBtn = document.createElement('button')
    closeHeavyBtn.className = 'secondary'
    closeHeavyBtn.textContent = `Close ${heavyCount} heavy tab${heavyCount > 1 ? 's' : ''} — free ~${heavyMemGB} GB`
    closeHeavyBtn.addEventListener('click', async () => {
      if (!await askConfirm({
        title: 'Close heavy tabs?',
        message: `Close ${heavyCount} heavy tab${heavyCount > 1 ? 's' : ''} and free ~${heavyMemGB} GB of memory?`,
        confirmLabel: 'Close tabs',
      })) return
      const ids = heavyTabs.map(t => t.id!)
      await Promise.all(ids.map(id => chrome.tabs.remove(id)))
      await renderResources()
    })
    actionsEl.appendChild(closeHeavyBtn)
  }

  const oneHourAgo   = Date.now() - 60 * 60 * 1000
  const inactiveTabs = validTabs
    .map(tab => {
      const domain = new URL(tab.url!).hostname.replace(/^www\./, '')
      const rec    = tabRecords.find(r => r.tabId === tab.id) ?? tabRecords.find(r => r.domain === domain)
      return { tab, domain, rec, lastVisited: rec?.lastVisited ?? 0 }
    })
    .filter(t => t.lastVisited < oneHourAgo && !t.tab.active)
    .sort((a, b) => a.lastVisited - b.lastVisited)

  const inactiveTbody = el('res-inactive-body')
  inactiveTbody.innerHTML = ''

  if (inactiveTabs.length === 0) {
    inactiveTbody.innerHTML = `<tr><td colspan="4" class="res-empty">No tabs have been idle for 1+ hour</td></tr>`
  } else {
    inactiveTabs.forEach(({ tab, domain, rec }) => {
      const catColor = settings.categories.find(c => c.name === rec?.category)?.color ?? 'var(--text-dim)'
      const idle     = rec?.lastVisited ? relativeTime(rec.lastVisited) : 'unknown'
      const tr       = document.createElement('tr')
      tr.innerHTML   = `
        <td class="res-tab-domain">${domain}</td>
        <td><span class="cat-dot" style="background:${catColor}"></span><span class="res-cat-name">${rec?.category ?? '—'}</span></td>
        <td class="res-last-seen">${idle}</td>
        <td><button class="res-close-btn" data-tab-id="${tab.id}" title="Close this tab">✕</button></td>
      `
      tr.querySelector<HTMLButtonElement>('.res-close-btn')?.addEventListener('click', async () => {
        if (!await askConfirm({ title: 'Close tab?', message: `Close ${domain}?`, confirmLabel: 'Close' })) return
        await chrome.tabs.remove(tab.id!)
        tr.remove()
      })
      inactiveTbody.appendChild(tr)
    })
  }

  const inactiveActionsEl = el('res-inactive-actions')
  inactiveActionsEl.innerHTML = ''
  if (inactiveTabs.length > 0) {
    const closeAllBtn = document.createElement('button')
    closeAllBtn.className = 'secondary'
    const inactiveMemGB = Math.round(inactiveTabs.reduce((s, t) => s + tabMemMB(t.tab.id!, t.domain).mb, 0) / 1024 * 10) / 10
    closeAllBtn.textContent = `Close all ${inactiveTabs.length} inactive tab${inactiveTabs.length > 1 ? 's' : ''} — free ~${inactiveMemGB} GB`
    closeAllBtn.addEventListener('click', async () => {
      if (!await askConfirm({
        title: 'Close all inactive tabs?',
        message: `Close ${inactiveTabs.length} tab${inactiveTabs.length > 1 ? 's' : ''}? You can reopen them from your browser history.`,
        confirmLabel: 'Close all',
      })) return
      await Promise.all(inactiveTabs.map(t => chrome.tabs.remove(t.tab.id!)))
      inactiveTbody.innerHTML = `<tr><td colspan="4" class="res-empty">All inactive tabs closed</td></tr>`
      inactiveActionsEl.innerHTML = ''
    })
    inactiveActionsEl.appendChild(closeAllBtn)
  }
}

document.querySelector('[data-view="resources"]')?.addEventListener('click', () => {
  setTimeout(renderResources, 50)
})
el('res-refresh-btn')?.addEventListener('click', renderResources)
