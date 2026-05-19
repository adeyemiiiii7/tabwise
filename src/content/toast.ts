// Injected into every page. Shows a categorization toast.
// "ask" mode  — persistent with dismiss option; user should pick but can decline
// "confirm" mode — auto-dismisses in 8s; user can still correct or close immediately

let dismissTimer: ReturnType<typeof setTimeout> | null = null
let activeToast: HTMLDivElement | null = null

// Checks whether the extension context is still valid before using any chrome.* API.
// After a reload, chrome.runtime.id becomes undefined and chrome.* calls throw.
function isContextValid(): boolean {
  try { return !!chrome.runtime?.id } catch { return false }
}

function showToast(
  domain: string,
  category: string | null,
  categories: string[],
  tabId: number,
  mode: 'ask' | 'confirm'
) {
  if (activeToast) activeToast.remove()
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }

  const isAsk = mode === 'ask'

  const toast = document.createElement('div')
  toast.id = 'tabwise-toast'
  activeToast = toast

  toast.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      #tabwise-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #111;
        border: 1px solid ${isAsk ? '#555' : '#2a2a2a'};
        border-radius: 12px;
        padding: 0;
        font-family: 'Space Grotesk', -apple-system, sans-serif;
        box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
        display: flex;
        flex-direction: column;
        min-width: 280px;
        max-width: 340px;
        animation: tw-in 0.22s cubic-bezier(0.16,1,0.3,1);
        user-select: none;
      }
      @keyframes tw-in {
        from { transform: translateY(20px) scale(0.96); opacity: 0; }
        to   { transform: translateY(0)    scale(1);    opacity: 1; }
      }
      #tabwise-toast .tw-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 11px 14px 8px;
        cursor: grab;
        border-bottom: 1px solid #1e1e1e;
      }
      #tabwise-toast .tw-handle:active { cursor: grabbing; }
      #tabwise-toast .tw-badge {
        font-size: 9px;
        font-weight: 700;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      #tabwise-toast .tw-badge.ask { color: #aaa; }
      #tabwise-toast .tw-close {
        background: none;
        border: none;
        color: #666;
        font-size: 13px;
        cursor: pointer;
        padding: 2px 4px;
        line-height: 1;
        margin-left: auto;
        flex-shrink: 0;
        transition: color 0.12s;
        border-radius: 4px;
      }
      #tabwise-toast .tw-close:hover { color: #ddd; background: #222; }
      #tabwise-toast .tw-body {
        padding: 10px 14px 8px;
      }
      #tabwise-toast .tw-domain {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #999;
        font-weight: 500;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #tabwise-toast .tw-question {
        font-size: 13px;
        font-weight: 600;
        color: #f0f0f0;
        line-height: 1.4;
      }
      #tabwise-toast .tw-question strong { color: #fff; }
      #tabwise-toast .tw-cats {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 14px 12px;
      }
      #tabwise-toast .tw-btn {
        padding: 6px 13px;
        background: #1a1a1a;
        border: 1px solid #3a3a3a;
        border-radius: 20px;
        color: #ccc;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s;
        font-family: 'Space Grotesk', sans-serif;
        letter-spacing: 0.02em;
      }
      #tabwise-toast .tw-btn:hover { border-color: #aaa; color: #fff; background: #222; }
      #tabwise-toast .tw-btn.active { border-color: #fff; background: #fff; color: #111; }
      #tabwise-toast .tw-footer {
        font-size: 10px;
        color: #666;
        font-family: 'JetBrains Mono', monospace;
        padding: 8px 14px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border-top: 1px solid #1e1e1e;
      }
      #tabwise-toast .tw-dismiss {
        background: none;
        border: none;
        color: #666;
        font-size: 10px;
        font-family: 'JetBrains Mono', monospace;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
        text-underline-offset: 2px;
        transition: color 0.12s;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #tabwise-toast .tw-dismiss:hover { color: #bbb; }
    </style>

    <div class="tw-handle" id="tw-handle">
      <span class="tw-badge ${isAsk ? 'ask' : ''}">
        ${isAsk ? '? Tabwise is asking' : '✓ Tabwise organised'}
      </span>
      <button class="tw-close" id="tw-close-btn" title="Dismiss">✕</button>
    </div>

    <div class="tw-body">
      <div class="tw-domain">${domain}</div>
      <div class="tw-question">
        ${isAsk
          ? 'Where does this tab belong?'
          : `Moved to <strong>${category}</strong>. Correct?`}
      </div>
    </div>

    <div class="tw-cats" id="tw-cat-list"></div>

    <div class="tw-footer">
      <span>${isAsk ? 'Pick once — Tabwise remembers it.' : 'Auto-closes in 8s.'}</span>
      ${isAsk ? '<button class="tw-dismiss" id="tw-skip-btn">Skip for now</button>' : ''}
    </div>
  `

  document.body.appendChild(toast)

  // ── Close / dismiss ────────────────────────────────────────

  function dismiss() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
    // Clean up document-level drag listeners to prevent accumulation
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    toast.remove()
    activeToast = null
  }

  toast.querySelector<HTMLButtonElement>('#tw-close-btn')?.addEventListener('click', dismiss)
  toast.querySelector<HTMLButtonElement>('#tw-skip-btn')?.addEventListener('click', dismiss)

  if (!isAsk) {
    dismissTimer = setTimeout(dismiss, 8000)
  }

  // ── Category buttons ───────────────────────────────────────

  const catList = toast.querySelector<HTMLElement>('#tw-cat-list')!
  categories.forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'tw-btn' + (cat === category ? ' active' : '')
    btn.textContent = cat
    btn.addEventListener('click', () => {
      if (dismissTimer) clearTimeout(dismissTimer)
      // Only call chrome APIs if the extension context is still valid
      if (isContextValid()) {
        try {
          chrome.runtime.sendMessage({
            type: 'REASSIGN_TAB',
            tabId,
            category: cat,
            learnDomain: domain,
          })
        } catch { /* context invalidated mid-call — ignore */ }
      }
      catList.querySelectorAll('.tw-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      setTimeout(dismiss, 600)
    })
    catList.appendChild(btn)
  })

  // ── Drag to reposition ─────────────────────────────────────

  const handle = toast.querySelector<HTMLElement>('#tw-handle')!
  let dragging = false
  let startX = 0, startY = 0, originLeft = 0, originTop = 0

  handle.addEventListener('mousedown', e => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging = true
    const rect = toast.getBoundingClientRect()
    toast.style.bottom = 'auto'
    toast.style.right = 'auto'
    toast.style.top = rect.top + 'px'
    toast.style.left = rect.left + 'px'
    originLeft = rect.left
    originTop = rect.top
    startX = e.clientX
    startY = e.clientY
    e.preventDefault()
  })

  // Store named references so dismiss() can cleanly remove them
  function onMouseMove(e: MouseEvent) {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const newLeft = Math.max(0, Math.min(window.innerWidth  - toast.offsetWidth,  originLeft + dx))
    const newTop  = Math.max(0, Math.min(window.innerHeight - toast.offsetHeight, originTop  + dy))
    toast.style.left = newLeft + 'px'
    toast.style.top  = newTop  + 'px'
  }

  function onMouseUp() { dragging = false }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ── Message listener ───────────────────────────────────────
// Double-wrapped: outer catch handles addListener failing (e.g. on first load
// in an invalidated context); inner catch handles the callback firing after
// a reload when chrome.runtime is already gone.

try {
  chrome.runtime.onMessage.addListener(msg => {
    try {
      if (msg.type === 'SHOW_TOAST') {
        showToast(msg.domain, msg.category, msg.categories, msg.tabId, msg.mode)
      }
    } catch {
      // Extension context invalidated while callback was executing — ignore
    }
  })
} catch {
  // Extension reloaded — content script replaced on next navigation
}

// ── Memory signal collection ───────────────────────────────
// Reads JS heap + page content signals after the page has settled and reports
// them to the background for use as per-domain memory estimates. Runs only on
// top-level frames, skips internal Chrome pages.
setTimeout(() => {
  if (!isContextValid()) return
  const domain = location.hostname.replace(/^www\./, '')
  if (!domain || window !== window.top) return

  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  const heapMB    = mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : 0
  const hasVideo  = document.querySelectorAll('video').length > 0
  const hasCanvas = document.querySelectorAll('canvas').length > 0

  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_MEMORY_SIGNALS',
      domain,
      heapMB,
      hasVideo,
      hasCanvas,
    })
  } catch { /* context invalidated mid-call */ }
}, 2000)
