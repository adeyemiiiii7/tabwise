# Contributing to Tabwise

Thanks for your interest in contributing. This guide covers how to run the project locally, the codebase structure, and the expectations for pull requests.

---

## Prerequisites

- **Node.js 18+**
- **Chrome, Brave, or Dia** (any Chromium-based browser works)
- A basic understanding of Chrome Extension Manifest V3

---

## Local setup

```bash
git clone https://github.com/adeyemiiiii7/tabwise.git
cd tabwise
npm install
npm run dev    # watch mode — rebuilds on every save
```

Load the extension in your browser:

1. Open the extensions page — `chrome://extensions` · `brave://extensions` · `dia://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

After each rebuild, click the reload icon next to Tabwise on the extensions page. The popup and content scripts reload automatically; the background service worker may need a manual reload.

---

## Project structure

```
src/
├── background/index.ts      # Service worker — tab events, categorisation, screen time
├── content/toast.ts         # Content script — toast notifications, memory signals
├── popup/                   # Extension popup (stats, groups, reorganize)
├── dashboard/               # Full-page dashboard (overview, sites, resources, settings)
├── onboarding/              # First-run setup flow
├── settings/                # Standalone settings page (legacy — merged into dashboard)
├── lib/
│   ├── ai/                  # AI provider implementations (OpenAI, Claude, Gemini)
│   ├── storage.ts           # chrome.storage.local read/write helpers
│   ├── categorizer.ts       # AI categorisation logic
│   ├── offlineCategorizer.ts # Pattern-matching fallback
│   ├── knownSites.ts        # ~250-domain lookup table
│   ├── tabs.ts              # Tab utility functions
│   ├── groups.ts            # Chrome tab group operations
│   ├── screentime.ts        # Time tracking
│   ├── scheduler.ts         # Alarm-based periodic tasks
│   └── rag.ts               # RAG context builder for AI prompts
└── types/index.ts           # Shared TypeScript interfaces and defaults
```

---

## Adding a new AI provider

1. Create `src/lib/ai/yourprovider.ts` implementing the provider interface (see `openai.ts` for reference)
2. Export a class with a `categorize(url: string, title: string, categories: string[]): Promise<string>` method
3. Register it in `src/lib/ai/index.ts` in the `getProvider()` factory
4. Add the provider name to `AIProviderName` in `src/types/index.ts`
5. Add the provider card to the Settings UI in `src/dashboard/index.html`
6. Add the API host to `host_permissions` in `public/manifest.json`

---

## Code style

- **No `any`** — use `unknown` and narrow with type guards, or use the exact type
- **No unnecessary comments** — only comment non-obvious WHY, never WHAT the code does
- **No silent fallbacks** — if a value should never be null, throw; don't recover quietly
- **Early returns** — reduce nesting with guard clauses
- **Small, single-purpose functions**

These rules come from the project's coding standards. PRs that introduce `any` types or explanatory comments on obvious code will be asked to revise.

---

## Opening a pull request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` — it must complete with zero TypeScript errors
4. Test your change manually in Chrome (load unpacked from `dist/`)
5. Open a PR with the provided template filled out

For significant features, open an issue first to discuss the approach before building.

---

## Reporting bugs

Use the [bug report template](https://github.com/adeyemiiiii7/tabwise/issues/new?template=bug_report.md). Include your browser name and version, the extension version (visible on the extensions page), and steps to reproduce.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
