import { getScreenTime, getTabRecords, getSettings } from '../lib/storage'

function fmt(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function cssColor(color: string | undefined): string {
  const map: Record<string, string> = {
    blue: '#4A90D9', green: '#7ED321', orange: '#F5A623', red: '#D0021B',
    purple: '#9B59B6', cyan: '#1ABC9C', pink: '#E91E63', grey: '#555', yellow: '#F1C40F',
  }
  return map[color ?? ''] ?? '#555'
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

const el = (id: string) => document.getElementById(id)!

async function getLiveTime(): Promise<{ domain: string | null; elapsed: number }> {
  try {
    return await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TIME' })
  } catch {
    return { domain: null, elapsed: 0 }
  }
}

async function renderStats() {
  const [screentime, records, live] = await Promise.all([
    getScreenTime(),
    getTabRecords(),
    getLiveTime(),
  ])

  const today = screentime[todayKey()] ?? {}

  function liveSeconds(domain: string): number {
    return (today[domain] ?? 0) + (domain === live.domain ? live.elapsed : 0)
  }

  const allDomains = new Set([...Object.keys(today), ...(live.domain ? [live.domain] : [])])

  const totalSeconds = Array.from(allDomains).reduce((sum, d) => sum + liveSeconds(d), 0)
  const todayStart = new Date(todayKey()).getTime()
  const organisedToday = records.filter(r => r.lastVisited >= todayStart).length

  el('time-today').textContent = fmt(totalSeconds)
  el('tabs-organized').textContent = String(organisedToday)

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (activeTab?.url?.startsWith('http')) {
      const domain = new URL(activeTab.url).hostname.replace(/^www\./, '')
      if (activeTab.groupId != null && activeTab.groupId !== -1) {
        try {
          const group = await chrome.tabGroups.get(activeTab.groupId)
          el('active-category').textContent = group.title ?? '—'
        } catch {
          const record = records.find(r => r.domain === domain)
          el('active-category').textContent = record?.category ?? '—'
        }
      } else {
        const record = records.find(r => r.domain === domain)
        el('active-category').textContent = record?.category ?? '—'
      }
    } else if (live.domain) {
      const record = records.find(r => r.domain === live.domain)
      el('active-category').textContent = record?.category ?? '—'
    } else {
      el('active-category').textContent = '—'
    }
  } catch {
    el('active-category').textContent = '—'
  }

  const list = el('sites-list')
  const existingItems = list.querySelectorAll('li')

  const topSites = Array.from(allDomains)
    .map(d => [d, liveSeconds(d)] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (existingItems.length === topSites.length) {
    // Update in-place to avoid flicker
    existingItems.forEach((li, i) => {
      const [domain, secs] = topSites[i]
      const domEl = li.querySelector<HTMLElement>('.domain')
      const timeEl = li.querySelector<HTMLElement>('span:last-child')
      if (domEl) domEl.textContent = domain
      if (timeEl) timeEl.textContent = fmt(secs)
    })
  } else {
    list.innerHTML = ''
    topSites.forEach(([domain, secs]) => {
      const li = document.createElement('li')
      li.innerHTML = `<span class="domain">${domain}</span><span>${fmt(secs)}</span>`
      list.appendChild(li)
    })
  }
}

async function init() {
  const settings = await getSettings()

  const badge = el('mode-badge')
  const modeDesc = el('mode-desc')
  const aiActive = settings.onboardingComplete && !!settings.apiKey && (settings.useAI ?? true)
  if (!settings.onboardingComplete) {
    badge.textContent = 'Setup needed'
    badge.className = 'mode-badge mode-setup'
    modeDesc.textContent = 'Complete onboarding to start using Tabwise'
  } else if (!aiActive) {
    badge.textContent = 'Auto mode'
    badge.className = 'mode-badge mode-auto'
    modeDesc.textContent = settings.apiKey
      ? 'AI is off — using smart pattern matching. Toggle in Settings.'
      : 'Using smart pattern matching. Add an AI key in Settings for better accuracy.'
  } else {
    badge.textContent = 'AI mode'
    badge.className = 'mode-badge mode-ai'
    modeDesc.textContent = `Tabs classified by ${settings.provider === 'claude' ? 'Claude' : settings.provider === 'gemini' ? 'Gemini' : 'OpenAI'}`
  }

  await renderStats()

  setInterval(renderStats, 10_000)

  const currentWindow = await chrome.windows.getCurrent()
  if (currentWindow.id) {
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id })
    const groupsList = el('groups-list')

    if (groups.length === 0) {
      groupsList.innerHTML = '<p class="no-groups">No groups yet — hit Reorganize</p>'
    } else {
      el('groups-window-label').textContent = `· this window`
      groups.forEach(group => {
        const row = document.createElement('div')
        row.className = 'group-row'
        row.innerHTML = `
          <span class="group-dot" style="background:${cssColor(group.color)}"></span>
          <span class="group-name">${group.title ?? 'Untitled'}</span>
          <button class="move-btn" data-title="${group.title}">→ New window</button>
        `
        groupsList.appendChild(row)
      })

      groupsList.querySelectorAll<HTMLButtonElement>('.move-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const title = btn.dataset.title ?? ''
          btn.textContent = 'Moving...'
          btn.disabled = true
          chrome.runtime.sendMessage({ type: 'MOVE_GROUP_TO_WINDOW', groupTitle: title }, res => {
            btn.textContent = res?.success ? 'Moved!' : 'Failed'
            setTimeout(() => { btn.textContent = '→ New window'; btn.disabled = false }, 2000)
          })
        })
      })
    }
  }

  el('btn-dashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
  })

  el('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') + '#settings' })
  })

  const overlay = el('warning-overlay')
  const reorgBtn = el('btn-reorganize') as HTMLButtonElement

  if (!aiActive) {
    el('warning-body').textContent = 'This will organize every open tab using smart pattern matching, replacing your current tab arrangement.'
  }

  reorgBtn.addEventListener('click', () => {
    if (!settings.onboardingComplete) {
      el('reorg-label').textContent = 'Complete setup first'
      setTimeout(() => { el('reorg-label').textContent = 'Reorganize all tabs' }, 2500)
      return
    }
    overlay.classList.remove('hidden')
  })

  el('warn-cancel').addEventListener('click', () => {
    overlay.classList.add('hidden')
  })

  el('warn-confirm').addEventListener('click', async () => {
    overlay.classList.add('hidden')
    reorgBtn.disabled = true
    el('reorg-icon').textContent = '…'
    el('reorg-label').textContent = 'Reorganizing...'

    chrome.runtime.sendMessage({ type: 'REORGANIZE_ALL' }, (response) => {
      if (response?.success) {
        el('reorg-icon').textContent = '✓'
        el('reorg-label').textContent = `Done — ${response.count} tabs organized`
      } else {
        el('reorg-icon').textContent = '!'
        el('reorg-label').textContent = 'Something went wrong'
      }
      reorgBtn.disabled = false
      setTimeout(() => {
        el('reorg-icon').textContent = '⟳'
        el('reorg-label').textContent = 'Reorganize all tabs'
      }, 3000)
    })
  })
}

init()
