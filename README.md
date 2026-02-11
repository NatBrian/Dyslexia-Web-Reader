# Dyslexia Reading Assistant

A Chrome Extension (Manifest V3) that transforms any web article into a **dyslexia-friendly Reader View** with guided reading, AI simplification, text-to-speech, reading ruler, and one-click explanations.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)

---

## Features

| Feature | Description |
|---|---|
| 🔍 Article Extraction | One-click extraction from any page (news, blogs, Wikipedia) |
| 📐 Dyslexia-Friendly Layout | Font size, line/letter/word spacing, margin width, theme switching |
| ✏️ OpenDyslexic Font | Toggle the research-backed dyslexia font |
| 📑 Guided Reading | Chunk articles into bite-sized sections with Next/Prev navigation |
| ✨ AI Simplification | Rewrite chunks into short sentences, bullets, and glossary |
| 💡 One-Click Explain | Select any word → tooltip explanation → auto-saves to glossary |
| 📏 Reading Ruler | Focus overlay in line or paragraph mode (J/K navigation, Esc off) |
| 🔊 Text-to-Speech | Web Speech API (free) + optional ElevenLabs premium voices |
| 📚 Glossary | Per-article word list built automatically from explanations |
| 🔌 Local Fallbacks | Everything works without an API key (local chunking, simplify, explain) |

---

## Setup

### Prerequisites
- **Node.js** ≥ 18
- **Chrome** (or Chromium-based browser)

### Install & Build

```bash
# Clone the repo
cd Dyslexia-Web-Reader

# Install dependencies
npm install

# Build for production
npm run build
```

This creates a `dist/` folder with the extension ready to load.

### Load in Chrome

1. Open **chrome://extensions**
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `dist/` folder

The extension icon appears in your toolbar. 🎉

### Development

```bash
npm run dev    # Watch mode — re-builds on save
```

---

## Usage

1. **Navigate** to any article page (news site, blog, Wikipedia, etc.)
2. **Click** the extension icon → **"Enable Reader Mode"**
3. The article opens in a **clean Reader View** with dyslexia-friendly styling
4. Use the **toolbar** to adjust font size, spacing, theme, and toggle OpenDyslexic
5. Enable **Guided Reading** (📑) to read chunk-by-chunk
6. **Select any word** → click "💡 Explain" pill for an instant explanation
7. Toggle the **Reading Ruler** (📏) for focus assistance — use J/K/Esc
8. Click **▶️** to hear the current chunk read aloud

### With AI Features (Optional)

1. Click **⚙️ Settings** in the popup → enter your [OpenRouter API key](https://openrouter.ai/keys)
2. AI-powered features unlock: smarter chunking, rich simplification, detailed explanations
3. Without an API key, local fallbacks provide basic functionality

---

## Module Guide

The codebase is modular — each team member can work on a module independently.

```
src/modules/
├── extractor/     Article extraction from web pages
├── readerStyle/   CSS variable engine for dyslexia-friendly styling
├── llmClient/     OpenRouter API wrapper (thin REST client)
├── chunker/       Split articles into guided reading chunks
├── simplifier/    Rewrite chunks into simpler language
├── explainer/     One-click word/phrase explanations
├── glossary/      Per-article glossary storage
├── readingRuler/  Focus overlay with line/paragraph modes
├── tts/           Text-to-speech (Web Speech + ElevenLabs)
├── storage/       chrome.storage wrapper with caching
└── messaging/     Typed message passing between components
```

### How to Extend a Module

1. **Find the module** in `src/modules/<name>/index.ts`
2. **Read the exports** — each module has clear function signatures
3. **Import shared types** from `src/shared/types.ts`
4. **Add your feature** — modules are isolated; changes shouldn't break others
5. **If adding a new message type**: update `types.ts` and the background handler

### Module Dependencies

```
extractor     → lib/readability, lib/sanitize
readerStyle   → (standalone, reads types)
llmClient     → (standalone, pure fetch)
chunker       → llmClient
simplifier    → llmClient
explainer     → llmClient
glossary      → storage
readingRuler  → (standalone, pure DOM)
tts           → (standalone, Web APIs)
storage       → (standalone, chrome.storage)
messaging     → (standalone, chrome.runtime)
```

---

## File Structure

```
Dyslexia-Web-Reader/
├── public/
│   ├── manifest.json          # Manifest V3 config
│   ├── icons/                 # Extension icons
│   └── assets/fonts/          # OpenDyslexic font
├── src/
│   ├── shared/types.ts        # All data contracts & message types
│   ├── lib/
│   │   ├── readability.ts     # Vendored article extractor
│   │   └── sanitize.ts        # HTML allowlist sanitiser
│   ├── modules/               # Feature modules (see Module Guide)
│   ├── background/index.ts    # Service worker orchestrator
│   ├── content/index.ts       # On-demand content script
│   ├── popup/                 # Extension popup UI
│   ├── options/               # Settings page
│   └── reader/                # Main reading experience
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Extract article content from the currently active tab (on user click only) |
| `storage` | Save user settings, cached articles, reading plans, and glossary |
| `scripting` | Inject the extraction script on-demand (no persistent content script) |
| `host_permissions: openrouter.ai` | Send LLM requests to OpenRouter API |
| `host_permissions: elevenlabs.io` | Optional premium TTS API |

> **Privacy**: No browsing history collected. Articles are only processed when you explicitly click "Enable Reader Mode". API keys are stored locally, never logged.

---

## Tech Stack

- **TypeScript** — strict mode, discriminated unions for type-safe messaging
- **Vite** — fast multi-entry bundler
- **Chrome Extension Manifest V3** — modern, secure extension platform
- **Zero runtime npm dependencies** — Readability and sanitiser are vendored

---

## License

MIT
