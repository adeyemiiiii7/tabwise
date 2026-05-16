import { getSettings, saveSettings, clearAllData, getScreenTime } from '../lib/storage'
import { getProvider } from '../lib/ai'
import { AIProviderName, Category } from '../types'

function selectedProvider(): AIProviderName {
  return (document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value ?? 'openai') as AIProviderName
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8)
}

async function init() {
  const settings = await getSettings()
  let categories: Category[] = [...settings.categories]

  // Provider
  document.querySelectorAll<HTMLInputElement>('input[name="provider"]').forEach(r => {
    if (r.value === settings.provider) r.checked = true
  })

  // API key
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement
  apiKeyInput.value = settings.apiKey

  // Test — use the currently selected provider, not the saved one
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

  // Auto mode
  const autoToggle = document.getElementById('auto-mode') as HTMLInputElement
  autoToggle.checked = settings.autoMode

  // Inactivity
  const inactivityInput = document.getElementById('inactivity') as HTMLInputElement
  inactivityInput.value = String(settings.inactivityThresholdHours)

  // Render categories
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
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index)
        if (categories.length <= 1) return
        categories.splice(idx, 1)
        renderCategories()
      })
    })
  }

  renderCategories()

  // Add category
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

  // Save — also marks onboardingComplete so the background worker starts organizing
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

  // Clear algorithm cache (learned sites only — keeps screen time & settings)
  document.getElementById('clear-cache-btn')!.addEventListener('click', async () => {
    if (!confirm('This clears your saved site preferences. Tabwise will ask where each site belongs again and relearn from your answers. Screen time data is kept.\n\nContinue?')) return
    await chrome.storage.local.remove(['learnedSites', 'apiUsage'])
    // Tell background to drop its in-memory RAG cache too
    chrome.runtime.sendMessage({ type: 'INVALIDATE_CACHE' })
    const btn = document.getElementById('clear-cache-btn')!
    btn.textContent = 'Algorithm reset!'
    setTimeout(() => { btn.textContent = 'Reset algorithm' }, 2500)
  })

  // Export CSV
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

  // Stats link
  document.getElementById('nav-stats')!.addEventListener('click', e => {
    e.preventDefault()
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
  })

  // Reset
  document.getElementById('reset-btn')!.addEventListener('click', async () => {
    if (confirm('This will delete all your screen time data and settings. Continue?')) {
      await clearAllData()
      location.reload()
    }
  })
}

init()
