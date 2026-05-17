# Tabwise

AI-powered Chrome extension that automatically organizes your tabs into groups and tracks your screen time.

## What it does

- Categorizes every tab you open using AI (OpenAI, Claude, or Gemini)
- Groups tabs in your browser by category automatically
- Tracks daily screen time per site with a live dashboard
- Falls back to smart offline categorization when your API quota runs out

## Setup

**Requirements:** Node.js 18+, Google Chrome

```bash
git clone https://github.com/adeyemiiiii7/tabwise.git
cd tabwise
npm install
npm run build
```

Then load it in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` folder

## First launch

The extension opens an onboarding screen automatically. You'll need:

- An API key from one of: [OpenAI](https://platform.openai.com/api-keys) · [Anthropic](https://console.anthropic.com/settings/keys) · [Google AI Studio](https://aistudio.google.com/apikey)

Pick your provider, paste your key, and you're done. Tabwise starts organizing tabs immediately.

## Development

```bash
npm run dev   # watch mode — rebuilds on every save
```

Reload the extension at `chrome://extensions` after each build.

## Dashboard

Click the extension icon → **Open Dashboard** to see screen time charts, tab categories, memory usage, and settings.
