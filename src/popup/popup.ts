import { getScreenTime, getTabRecords, getSettings } from '../lib/storage'

function formatSeconds(s: number): string {
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

async function init() {
  const [screentime, records, settings] = await Promise.all([
    getScreenTime(),
    getTabRecords(),
    getSettings(),
  ])

  const today = screentime[todayKey()] ?? {}
  const totalSeconds = Object.values(today).reduce((a, b) => a + b, 0)

  const el = (id: string) => document.getElementById(id)!
  el('time-today').textContent = formatSeconds(totalSeconds)
  el('tabs-organized').textContent = String(records.length)

  const topDomain = Object.entries(today).sort((a, b) => b[1] - a[1])[0]
  if (topDomain) {
    const record = records.find(r => r.domain === topDomain[0])
    el('active-category').textContent = record?.category ?? '—'
  }

  const list = el('sites-list')
  Object.entries(today)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([domain, secs]) => {
      const li = document.createElement('li')
      li.innerHTML = `<span class="domain">${domain}</span><span>${formatSeconds(secs)}</span>`
      list.appendChild(li)
    })

  if (!settings.apiKey || !settings.onboardingComplete) {
    document.querySelector('.dot')!.setAttribute('style', 'background:#333; box-shadow:none')
  }

  // Show tab groups in current window with "Move to new window" option
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

  // Reorganize button — show warning first
  const overlay = el('warning-overlay')
  const reorgBtn = el('btn-reorganize')

  reorgBtn.addEventListener('click', () => {
    if (!settings.apiKey || !settings.onboardingComplete) {
      el('reorg-label').textContent = 'Set up API key in Settings first'
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
