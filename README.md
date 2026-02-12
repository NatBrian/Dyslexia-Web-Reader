# Dyslexia Reading Assistant

Chrome Extension (Manifest V3) that converts web articles into a distraction-free reader view with adjustable typography, guided reading, text-to-speech, and optional LLM-powered simplification.

## Objective

People with dyslexia struggle with default web typography — long lines, tight spacing, cluttered layouts. This extension extracts article content from any page and re-renders it with configurable dyslexia-friendly settings. It also breaks articles into manageable chunks, offers word explanations, and reads content aloud.

## Features

- **Reader View** — strips page clutter, renders article in a clean layout
- **Typography controls** — font size, line spacing, letter spacing, word spacing, line width
- **Theme switching** — cream, gray, dark backgrounds
- **OpenDyslexic font** — toggle on/off
- **Guided reading** — splits articles into chunks (80–180 words each), navigate with Prev/Next
- **Chunk simplification** — rewrites a chunk into shorter sentences, bullet points, and a glossary (requires OpenRouter API key; local fallback available)
- **Explain selection** — select any word or phrase, get a plain-language explanation in a tooltip
- **Glossary** — per-article word list, built automatically from explanations
- **Reading ruler** — focus overlay in line or paragraph mode, navigate with J/K, dismiss with Esc
- **Text-to-speech** — Web Speech API (built-in, free) with optional ElevenLabs support
- **Local fallbacks** — all features work without an API key using local paragraph/sentence splitting and basic text processing

## Setup

**Requirements:** Node.js >= 18, Chrome or Chromium-based browser.

```bash
npm install
npm run build
```

This creates a `dist/` folder.

### Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select the `dist/` folder

### Development

```bash
npm run dev       # watch mode, rebuilds on save
npx tsc --noEmit  # typecheck without emitting
```

## Usage

1. Go to any article page
2. Click the extension icon → **Enable Reader Mode**
3. Adjust typography with the toolbar sliders and buttons
4. Click the **guided reading** button to split the article into chunks
5. Select text → click **Explain** pill for a tooltip definition
6. Toggle the **reading ruler** for line/paragraph focus
7. Click **play** to hear the current chunk read aloud

### API Key (optional)

Go to extension Settings → enter an [OpenRouter API key](https://openrouter.ai/keys). This enables smarter chunking, richer simplification, and detailed explanations. Without it, local fallbacks handle everything.

## Architecture

The extension has 5 entry points and 11 feature modules. Communication flows through `chrome.runtime` messaging, with the background service worker as the central orchestrator.

```
Popup  ──▶  Background Service Worker  ──▶  Content Script (injected on-demand)
                     │
         ┌───────────┼───────────────┐
         ▼           ▼               ▼
   Reader Page   Options Page   OpenRouter API
```

### Entry Points

| Entry | Path | Role |
|---|---|---|
| Background | `src/background/index.ts` | Service worker, handles all message routing, makes LLM calls, manages cache |
| Content script | `src/content/index.ts` | Injected into active tab on-demand, extracts article HTML/text |
| Popup | `src/popup/` | Toolbar popup with "Enable Reader Mode" button and quick toggles |
| Options | `src/options/` | API key input, model selection, default style prefs, cache controls |
| Reader | `src/reader/` | Main reading UI — article display, toolbar, guided panel, glossary |

### Modules

Each module lives in `src/modules/<name>/index.ts` with a single-file interface. Modules are isolated — you can modify one without breaking others.

```
src/modules/
├── extractor/     Extracts article body using vendored Readability + HTML sanitizer
├── readerStyle/   Applies CSS custom properties for typography/theme
├── llmClient/     Thin fetch wrapper for OpenRouter chat completions API
├── chunker/       Splits articles into guided reading chunks (LLM or local)
├── simplifier/    Rewrites chunk text into simpler language (LLM or local)
├── explainer/     Generates word/phrase explanations (LLM or local)
├── glossary/      Per-article glossary CRUD via chrome.storage
├── readingRuler/  DOM overlay for line/paragraph focus
├── tts/           Text-to-speech via Web Speech API + optional ElevenLabs
├── storage/       Wrapper for chrome.storage.sync (settings) and .local (cache)
└── messaging/     Typed wrappers for chrome.runtime.sendMessage/onMessage
```

**Module dependency graph:**

```
extractor     → lib/readability, lib/sanitize
readerStyle   → (standalone)
llmClient     → (standalone, fetch only)
chunker       → llmClient
simplifier    → llmClient
explainer     → llmClient
glossary      → storage
readingRuler  → (standalone, DOM only)
tts           → (standalone, Web APIs)
storage       → (standalone, chrome.storage)
messaging     → (standalone, chrome.runtime)
```

### Shared Types

All data contracts and message types are in `src/shared/types.ts`. If you add a new message type:

1. Add the message interface to `types.ts`
2. Add it to the `ExtMessage` union
3. Handle it in `src/background/index.ts`

### How to Add a New Module

1. Create `src/modules/<name>/index.ts`
2. Export functions with clear signatures
3. Import shared types from `@shared/types`
4. Wire it into the background handler if it needs message-based communication
5. Modules should not import from other modules except `llmClient`, `storage`, or `messaging`

## File Structure

```
Dyslexia-Web-Reader/
├── public/
│   ├── manifest.json          Manifest V3 configuration
│   ├── icons/                 Extension icons (16/48/128px)
│   └── assets/fonts/          OpenDyslexic-Regular.woff2
├── src/
│   ├── shared/types.ts        All interfaces, message types, defaults
│   ├── lib/
│   │   ├── readability.ts     Vendored article extractor
│   │   └── sanitize.ts        HTML allowlist sanitizer
│   ├── modules/               11 feature modules (see above)
│   ├── background/index.ts    Service worker
│   ├── content/index.ts       Content script
│   ├── popup/                 popup.html, popup.ts, popup.css
│   ├── options/               options.html, options.ts, options.css
│   └── reader/                reader.html, reader.ts, reader.css
├── vite.config.ts             Multi-entry build config + HTML move plugin
├── tsconfig.json
└── package.json
```

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab's page content when the user clicks the extension |
| `storage` | Persist settings, cached articles, reading plans, glossary |
| `scripting` | Inject the content script on-demand (not persistent) |
| `host: openrouter.ai` | LLM API calls |
| `host: elevenlabs.io` | Optional TTS API |

No browsing data is collected. Articles are processed only on explicit user action. API keys are stored locally in `chrome.storage.sync`, never transmitted anywhere except to the configured API endpoint.

## Tech Stack

- TypeScript (strict mode)
- Vite (multi-entry bundler)
- Chrome Extension Manifest V3
- Zero runtime npm dependencies (Readability and sanitizer are vendored)

## License

MIT
