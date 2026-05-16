import { getSettings, saveSettings } from '../lib/storage'
import { AIProviderName, DEFAULT_CATEGORIES } from '../types'

let selectedProvider: AIProviderName = 'openai'
let currentStep = 1

function showStep(n: number) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== n)
  })
  document.querySelectorAll('.progress .dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === n)
  })
  currentStep = n
}

async function init() {
  const settings = await getSettings()

  // Provider selection
  document.querySelectorAll<HTMLButtonElement>('.provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedProvider = btn.dataset.provider as AIProviderName
    })
  })

  document.getElementById('step1-next')!.addEventListener('click', () => showStep(2))

  // API key
  const hints: Record<AIProviderName, string> = {
    openai: 'Get your key at platform.openai.com → API keys',
    claude: 'Get your key at console.anthropic.com → API keys',
    gemini: 'Get your key at aistudio.google.com → API keys',
  }

  document.getElementById('step2-next')!.addEventListener('click', async () => {
    const key = (document.getElementById('api-key-input') as HTMLInputElement).value.trim()
    if (!key) {
      document.getElementById('key-error')!.classList.remove('hidden')
      return
    }
    await saveSettings({ ...settings, provider: selectedProvider, apiKey: key })
    showStep(3)
  })

  document.getElementById('api-hint')!.textContent = hints[selectedProvider]

  // Categories
  const list = document.getElementById('categories-list')!
  DEFAULT_CATEGORIES.forEach(cat => {
    const chip = document.createElement('div')
    chip.className = 'category-chip'
    chip.textContent = cat.name
    chip.style.background = cat.color
    list.appendChild(chip)
  })

  document.getElementById('step3-next')!.addEventListener('click', () => showStep(4))

  document.getElementById('step4-finish')!.addEventListener('click', async () => {
    const current = await getSettings()
    await saveSettings({ ...current, onboardingComplete: true, categories: DEFAULT_CATEGORIES })
    window.close()
  })
}

init()
