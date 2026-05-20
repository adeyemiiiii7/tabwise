# Privacy Policy — Tabwise

**Last updated: May 2025**

Tabwise is a browser extension (Chrome, Brave, Dia) that organises your tabs and tracks screen time. This policy explains exactly what data the extension touches, where it goes, and how you control it.

---

## What Tabwise collects

| Data | Purpose | Where it's stored |
|------|---------|-------------------|
| Tab URLs and page titles | Determining which category a tab belongs to | Processed in memory only — not persisted |
| Domain names | Screen time tracking (e.g. `youtube.com`) | Locally in your browser (`chrome.storage.local`) |
| Time spent per domain | Screen time dashboard | Locally in your browser |
| Your category corrections | Remembering where you've assigned sites before | Locally in your browser |
| Your AI provider API key | Authenticating requests to your chosen AI service | Locally in your browser |
| Your settings and categories | Extension configuration | Locally in your browser |
| Per-tab memory signals (JS heap size, presence of video/canvas elements) | Estimating RAM usage in the Resources view | Locally in your browser |

---

## What leaves your device

**One thing only:** when you have configured an AI provider, Tabwise sends a tab's **URL and title** to that provider's API to determine its category.

- This data goes directly to your chosen provider (OpenAI, Anthropic, or Google).
- It is subject to that provider's privacy policy, not this one.
- **Tabwise has no backend servers.** There is no Tabwise cloud, no Tabwise database, and no telemetry endpoint. Nothing you do in the extension is ever transmitted to us.

If you use Tabwise without an AI key (the default), **nothing ever leaves your device.**

---

## Third-party services

Tabwise only communicates with the AI provider you explicitly configure:

| Provider | Privacy policy |
|----------|---------------|
| OpenAI | https://openai.com/privacy |
| Anthropic | https://www.anthropic.com/privacy |
| Google (Gemini) | https://policies.google.com/privacy |

Tabwise does not use any analytics services, crash reporters, advertising networks, or any other third-party services.

---

## What stays on your device

Everything else:

- Screen time history
- Learned site categorisations
- Tab records
- Your API key
- All settings and categories

All stored in `chrome.storage.local` — local to your browser profile, not synced across devices.

---

## How to delete your data

Open the Tabwise popup → **View Stats** → **Settings** → scroll to **Data**:

- **Reset algorithm** — clears learned site categorisations. Screen time is kept.
- **Export CSV** — download your full screen time history before deleting.
- **Delete all data** — permanently removes everything. Cannot be undone.

You can also clear all extension storage by removing and reinstalling the extension.

---

## Permissions

Tabwise requests the following Chrome permissions and uses them as follows:

| Permission | Why |
|------------|-----|
| `tabs` | Read tab URLs and titles to categorise them |
| `tabGroups` | Create and manage Chrome tab groups |
| `storage` | Save your settings and data locally |
| `alarms` | Run periodic checks for inactive tabs |
| `notifications` | Alert you about tabs that have been idle too long |
| `system.memory` | Read total system RAM for the Resources dashboard |

Host permissions for `api.openai.com`, `api.anthropic.com`, and `generativelanguage.googleapis.com` are required to make API calls to your chosen AI provider. These are only used when you have configured a key.

---

## No analytics, no advertising, no tracking

Tabwise does not:
- Collect usage analytics or crash reports
- Show ads or sponsored content
- Track you across websites
- Share any data with anyone

---

## Contact

For questions about this policy, open an issue at [github.com/adeyemiiiii7/tabwise/issues](https://github.com/adeyemiiiii7/tabwise/issues).
