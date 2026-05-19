import { getSettings, saveSettings, clearAllData, getScreenTime } from '../lib/storage'
import { getProvider } from '../lib/ai'
import { AIProviderName, Category } from '../types'

function selectedProvider(): AIProviderName {
  return (document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value ?? 'openai') as AIProviderName
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8)
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

async function init() {
  const settings = await getSettings()
  let categories: Category[] = [...settings.categories]

  document.querySelectorAll<HTMLInputElement>('input[name="provider"]').forEach(r => {
    if (r.value === settings.provider) r.checked = true
  })

  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
  apiKeyInput.value = settings.apiKey

  // Test uses the currently selected provider, not the saved one
  document.getElementById('test-btn')!.addEventListener('click', async () => {
    const result = document.getElementById('test-result')!
    const key = apiKeyInput.value.trim()
    if (!key) { result.textContent = 'Enter an API key first.'; result.className = 'hint error'; return }
    result.textContent = 'Testing...'
    result.className = 'hint'
    try {
      const provider = getProvider(selectedProvider(), key)
      await provider.categorize('https://github.com', 'GitHub', ['Work', 'Personal'])
      result.textContent = 'API key works!'
      result.className = 'hint success'
    } catch (e) {
      result.textContent = 'Invalid API key or network error.'
      result.className = 'hint error'
    }
  })

  const autoToggle = document.getElementById('auto-mode') as HTMLInputElement
  autoToggle.checked = settings.autoMode

  const inactivityInput = document.getElementById('inactivity') as HTMLInputElement
  inactivityInput.value = String(settings.inactivityThresholdHours)

  function renderCategories() {
    const catList = document.getElementById('categories-list')!
    catList.innerHTML = ''
    categories.forEach((cat, i) => {
      const row = document.createElement('div')
      row.className = 'category-row'
      row.innerHTML = `
        <span class="cat-color" style="background:${cat.color}"></span>
        <input type="text" value="${cat.name}" class="cat-name" data-index="${i}" />
        <button class="delete-cat" data-index="${i}" title="Delete">✕</button>
      `
      catList.appendChild(row)
    })

    catList.querySelectorAll<HTMLInputElement>('.cat-name').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index)
        categories[idx] = { ...categories[idx], name: input.value }
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

  document.getElementById('add-cat-btn')!.addEventListener('click', () => {
    const nameInput = document.getElementById('new-cat-name') as HTMLInputElement
    const colorInput = document.getElementById('new-cat-color') as HTMLInputElement
    const name = nameInput.value.trim()
    if (!name) return
    categories.push({ id: randomId(), name, color: colorInput.value, keywords: [] })
    nameInput.value = ''
    colorInput.value = '#888888'
    renderCategories()
  })

  // Also sets onboardingComplete so the background worker starts organizing on first save
  document.getElementById('save-btn')!.addEventListener('click', async () => {
    await saveSettings({
      ...settings,
      provider: selectedProvider(),
      apiKey: apiKeyInput.value.trim(),
      autoMode: autoToggle.checked,
      inactivityThresholdHours: Number(inactivityInput.value),
      categories,
      onboardingComplete: true,
    })
    const btn = document.getElementById('save-btn')!
    btn.textContent = 'Saved!'
    setTimeout(() => { btn.textContent = 'Save changes' }, 2000)
  })

  // Removes learned sites only — screen time and settings are preserved
  document.getElementById('clear-cache-btn')!.addEventListener('click', async () => {
    if (!await askConfirm({
      title: 'Reset algorithm?',
      message: 'Clears saved site picks and API stats. Tabwise will re-ask and relearn from your answers. Screen time is kept.',
      confirmLabel: 'Reset',
    })) return
    await chrome.storage.local.remove(['learnedSites', 'apiUsage'])
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' }) // drop background's in-memory RAG cache
    const btn = document.getElementById('clear-cache-btn')!
    btn.textContent = 'Algorithm reset!'
    setTimeout(() => { btn.textContent = 'Reset algorithm' }, 2500)
  })

  document.getElementById('export-btn')!.addEventListener('click', async () => {
    const screentime = await getScreenTime()
    const rows = ['Date,Domain,Seconds']
    for (const [date, sites] of Object.entries(screentime)) {
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

  document.getElementById('nav-stats')!.addEventListener('click', e => {
    e.preventDefault()
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
  })

  document.getElementById('reset-btn')!.addEventListener('click', async () => {
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
