/* ===================================================================
 * Reader page script — the main reading experience.
 *
 * Handles:
 * - Article loading + rendering
 * - Style controls (font size, spacing, theme, OpenDyslexic, ruler)
 * - Guided reading mode (chunk navigation, simplify, explain)
 * - TTS playback
 * - Glossary panel
 * - Focus on words (bionic reading with color coding)
 * =================================================================== */

import { sendMessage } from '@modules/messaging';
import { applyReaderStyles } from '@modules/readerStyle';
import { initRuler, enableRuler, disableRuler, setRulerMode } from '@modules/readingRuler';
import { speak, stop as ttsStop, pause as ttsPause, resume as ttsResume, isActive as ttsIsActive } from '@modules/tts';
import { enableFocusOnWords, disableFocusOnWords, isFocusOnWordsEnabled, updateFocusSettings } from '@modules/focusOnWords';
import type { Article, ReaderSettings, ReadingPlan, Chunk, SimplifiedChunk, GlossaryEntry, Explanation } from '@shared/types';

// ─── DOM refs ───────────────────────────────────────────────────────
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const root = document.documentElement;
const readerRoot = $('#reader-root');
const loadingEl = $('#loading');
const errorEl = $('#error');
const errorText = $('#error-text');
const articleContent = $('#article-content');
const articleTitle = $('#article-title');
const articleByline = $('#article-byline');
const articleBody = $('#article-body');

// Toolbar controls
const ctlFontSize = $('#ctl-fontsize') as HTMLInputElement;
const ctlLineSpacing = $('#ctl-linespacing') as HTMLInputElement;
const ctlLetterSpacing = $('#ctl-letterspacing') as HTMLInputElement;
const ctlMarginWidth = $('#ctl-marginwidth') as HTMLInputElement;
const ctlTheme = $('#ctl-theme') as HTMLButtonElement;
const ctlDyslexic = $('#ctl-dyslexic') as HTMLButtonElement;
const ctlFocusWords = $('#ctl-focus-words') as HTMLButtonElement;
const focusSpeedGroup = $('#focus-speed-group');
const ctlFocusSpeed = $('#ctl-focus-speed') as HTMLInputElement;
const ctlRuler = $('#ctl-ruler') as HTMLButtonElement;
const ctlGuided = $('#ctl-guided') as HTMLButtonElement;

// TTS controls
const ctlTtsPlay = $('#ctl-tts-play') as HTMLButtonElement;
const ctlTtsPause = $('#ctl-tts-pause') as HTMLButtonElement;
const ctlTtsStop = $('#ctl-tts-stop') as HTMLButtonElement;

// Guided panel
const guidedPanel = $('#guided-panel');
const guidedProgress = $('#guided-progress');
const guidedPrev = $('#guided-prev') as HTMLButtonElement;
const guidedNext = $('#guided-next') as HTMLButtonElement;
const chunkTitle = $('#chunk-title');
const chunkText = $('#chunk-text');
const btnSimplify = $('#btn-simplify') as HTMLButtonElement;
const simplifyToggle = $('#simplify-toggle');
const btnShowOriginal = $('#btn-show-original') as HTMLButtonElement;
const btnShowSimplified = $('#btn-show-simplified') as HTMLButtonElement;
const simplifiedContent = $('#simplified-content');
const simplifiedText = $('#simplified-text');
const simplifiedBullets = $('#simplified-bullets');
const simplifiedGlossary = $('#simplified-glossary');

// Glossary
const glossaryPanel = $('#glossary-panel');
const glossaryList = $('#glossary-list');

// Explain tooltip
const explainPill = $('#explain-pill') as HTMLButtonElement;
const explainTooltip = $('#explain-tooltip');
const tooltipContent = $('#tooltip-content');
const tooltipText = $('#tooltip-text');
const tooltipExample = $('#tooltip-example');
const tooltipLoading = $('#tooltip-loading');
const tooltipClose = $('#tooltip-close') as HTMLButtonElement;

// ─── State ──────────────────────────────────────────────────────────
let article: Article | null = null;
let settings: ReaderSettings;
let articleId = '';
let guidedMode = false;
let readingPlan: ReadingPlan | null = null;
let currentChunkIndex = 0;
let simplifiedChunks = new Map<string, SimplifiedChunk>();
let rulerActive = false;
let focusWordsActive = false;
let rulerMode: 'line' | 'paragraph' = 'paragraph';
const themes: Array<ReaderSettings['theme']> = ['cream', 'gray', 'dark'];
const themeIcons: Record<string, string> = { cream: '🌾', gray: '🌫️', dark: '🌙' };
let themeIndex = 0;

// ─── Initialise ─────────────────────────────────────────────────────

async function init() {
    // Get article ID from URL
    const params = new URLSearchParams(window.location.search);
    articleId = params.get('articleId') || '';

    if (!articleId) {
        showError('No article ID in URL. Please use the extension popup to open reader mode.');
        return;
    }

    // Load settings
    try {
        const settingsResp = await sendMessage<any>({ type: 'GET_SETTINGS' });
        settings = settingsResp.ok
            ? { ...getDefaultSettings(), ...settingsResp.data }
            : getDefaultSettings();
    } catch {
        settings = getDefaultSettings();
    }

    applySettings();

    // Load article
    try {
        const resp = await sendMessage<Article>({ type: 'GET_ARTICLE', articleId });
        if (!resp.ok || !resp.data) {
            showError(resp.error || 'Article not found. Try extracting again from the popup.');
            return;
        }
        article = resp.data;
        renderArticle();
        if (focusWordsActive) {
            enableFocusOnWords(articleBody, settings);
        }
        initRuler(articleBody);
        loadGlossary();
    } catch (err: any) {
        showError(err?.message || 'Failed to load article');
    }
}

function getDefaultSettings(): ReaderSettings {
    return {
        fontSize: 18, lineSpacing: 1.8, letterSpacing: 0.05, wordSpacing: 0.1,
        marginWidth: 120, theme: 'cream', openDyslexic: false, highlightFocus: false,
        rulerMode: 'off', ttsEngine: 'web', ttsRate: 1.0,
        focusOnWords: true, bionicAnchorCount: 5, readingSpeed: 2,
    };
}

// ─── Render article ─────────────────────────────────────────────────

function renderArticle() {
    if (!article) return;
    loadingEl.classList.add('hidden');
    articleContent.classList.remove('hidden');

    articleTitle.textContent = article.title;
    articleByline.textContent = article.byline || '';
    articleByline.classList.toggle('hidden', !article.byline);
    articleBody.innerHTML = article.contentHtml;

    document.title = `${article.title} — Reader`;
}

function showError(msg: string) {
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorText.textContent = msg;
}

// ─── Apply styles ───────────────────────────────────────────────────

function applySettings() {
    applyReaderStyles(root, settings);

    // Sync toolbar controls
    ctlFontSize.value = String(settings.fontSize);
    ctlLineSpacing.value = String(settings.lineSpacing);
    ctlLetterSpacing.value = String(settings.letterSpacing);
    ctlMarginWidth.value = String(settings.marginWidth);
    ctlFocusSpeed.value = String(settings.readingSpeed);

    themeIndex = themes.indexOf(settings.theme);
    if (themeIndex === -1) themeIndex = 0;
    ctlTheme.textContent = themeIcons[settings.theme] || '🌾';

    ctlDyslexic.classList.toggle('active', settings.openDyslexic);
    ctlFocusWords.classList.toggle('active', settings.focusOnWords);
    focusWordsActive = settings.focusOnWords;
    focusSpeedGroup.classList.toggle('hidden', !focusWordsActive);
}

function updateSetting(key: keyof ReaderSettings, value: any) {
    (settings as any)[key] = value;
    applyReaderStyles(root, settings);
    // Persist async
    sendMessage({ type: 'SAVE_SETTINGS', settings: { [key]: value } });
}

// ─── Toolbar event handlers ─────────────────────────────────────────

ctlFontSize.addEventListener('input', () => updateSetting('fontSize', Number(ctlFontSize.value)));
ctlLineSpacing.addEventListener('input', () => updateSetting('lineSpacing', Number(ctlLineSpacing.value)));
ctlLetterSpacing.addEventListener('input', () => updateSetting('letterSpacing', Number(ctlLetterSpacing.value)));
ctlMarginWidth.addEventListener('input', () => updateSetting('marginWidth', Number(ctlMarginWidth.value)));

ctlTheme.addEventListener('click', () => {
    themeIndex = (themeIndex + 1) % themes.length;
    const theme = themes[themeIndex];
    ctlTheme.textContent = themeIcons[theme];
    updateSetting('theme', theme);
});

ctlDyslexic.addEventListener('click', () => {
    settings.openDyslexic = !settings.openDyslexic;
    ctlDyslexic.classList.toggle('active', settings.openDyslexic);
    updateSetting('openDyslexic', settings.openDyslexic);
});

ctlFocusWords.addEventListener('click', () => {
    focusWordsActive = !focusWordsActive;
    ctlFocusWords.classList.toggle('active', focusWordsActive);
    focusSpeedGroup.classList.toggle('hidden', !focusWordsActive);

    if (focusWordsActive && articleBody) {
        enableFocusOnWords(articleBody, settings);
    } else {
        disableFocusOnWords();
    }

    updateSetting('focusOnWords', focusWordsActive);
});

ctlFocusSpeed.addEventListener('input', () => {
    const speed = Number(ctlFocusSpeed.value);
    settings.readingSpeed = speed;
    updateFocusSettings({ readingSpeed: speed });
    updateSetting('readingSpeed', speed);
});

// ─── Reading Ruler ──────────────────────────────────────────────────

ctlRuler.addEventListener('click', () => {
    rulerActive = !rulerActive;
    ctlRuler.classList.toggle('active', rulerActive);

    if (rulerActive) {
        // Toggle between line → paragraph → off
        enableRuler(rulerMode);
    } else {
        disableRuler();
    }
});

// Long-press or right-click to switch ruler mode
ctlRuler.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    rulerMode = rulerMode === 'line' ? 'paragraph' : 'line';
    if (rulerActive) {
        setRulerMode(rulerMode);
    }
});

// ─── Guided Reading Mode ────────────────────────────────────────────

ctlGuided.addEventListener('click', async () => {
    guidedMode = !guidedMode;
    ctlGuided.classList.toggle('active', guidedMode);

    if (guidedMode) {
        articleContent.classList.add('hidden');
        guidedPanel.classList.remove('hidden');
        glossaryPanel.classList.remove('hidden');

        if (!readingPlan) {
            await generatePlan();
        } else {
            displayChunk(currentChunkIndex);
        }
    } else {
        guidedPanel.classList.add('hidden');
        glossaryPanel.classList.add('hidden');
        articleContent.classList.remove('hidden');
    }
});

async function generatePlan() {
    chunkTitle.textContent = 'Generating reading plan…';
    chunkText.innerHTML = '<div class="spinner"></div>';
    btnSimplify.disabled = true;

    try {
        const resp = await sendMessage<ReadingPlan>({ type: 'GENERATE_READING_PLAN', articleId });
        if (resp.ok && resp.data) {
            readingPlan = resp.data;
            currentChunkIndex = 0;
            displayChunk(0);
        } else {
            chunkTitle.textContent = 'Error';
            chunkText.textContent = resp.error || 'Failed to generate reading plan.';
        }
    } catch (err: any) {
        chunkTitle.textContent = 'Error';
        chunkText.textContent = err?.message || 'Failed to generate reading plan.';
    }
}

function displayChunk(index: number) {
    if (!readingPlan || index < 0 || index >= readingPlan.chunks.length) return;

    const chunk = readingPlan.chunks[index];
    currentChunkIndex = index;

    guidedProgress.textContent = `Chunk ${index + 1} / ${readingPlan.chunks.length}`;
    chunkTitle.textContent = chunk.title || `Section ${index + 1}`;
    chunkText.textContent = chunk.text;

    guidedPrev.disabled = index === 0;
    guidedNext.disabled = index === readingPlan.chunks.length - 1;
    btnSimplify.disabled = false;

    // Check if simplified version is cached
    const simplified = simplifiedChunks.get(chunk.id);
    if (simplified) {
        showSimplifiedUI(simplified);
    } else {
        hideSimplifiedUI();
    }
}

guidedPrev.addEventListener('click', () => displayChunk(currentChunkIndex - 1));
guidedNext.addEventListener('click', () => displayChunk(currentChunkIndex + 1));

// ─── Simplify ───────────────────────────────────────────────────────

btnSimplify.addEventListener('click', async () => {
    if (!readingPlan) return;
    const chunk = readingPlan.chunks[currentChunkIndex];
    if (!chunk) return;

    // Check cache
    if (simplifiedChunks.has(chunk.id)) {
        showSimplifiedUI(simplifiedChunks.get(chunk.id)!);
        return;
    }

    btnSimplify.disabled = true;
    btnSimplify.textContent = '⏳ Simplifying…';

    try {
        const resp = await sendMessage<SimplifiedChunk>({
            type: 'SIMPLIFY_CHUNK',
            chunkId: chunk.id,
            chunkText: chunk.text,
            articleId,
        });

        if (resp.ok && resp.data) {
            simplifiedChunks.set(chunk.id, resp.data);
            showSimplifiedUI(resp.data);
            // Refresh glossary
            loadGlossary();
        } else {
            alert(resp.error || 'Simplification failed.');
        }
    } catch (err: any) {
        alert(err?.message || 'Simplification failed.');
    } finally {
        btnSimplify.disabled = false;
        btnSimplify.textContent = '✨ Simplify this chunk';
    }
});

function showSimplifiedUI(simplified: SimplifiedChunk) {
    simplifyToggle.classList.remove('hidden');
    simplifiedContent.classList.remove('hidden');

    simplifiedText.textContent = simplified.simplifiedText;

    // Bullets
    if (simplified.bullets?.length) {
        simplifiedBullets.innerHTML = '<ul>' + simplified.bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
    } else {
        simplifiedBullets.innerHTML = '';
    }

    // Inline glossary
    if (simplified.glossary?.length) {
        simplifiedGlossary.innerHTML = '<h4>📚 New Words</h4><dl>' +
            simplified.glossary.map(g => `<dt>${g.term}</dt><dd>${g.definition}</dd>`).join('') +
            '</dl>';
    } else {
        simplifiedGlossary.innerHTML = '';
    }

    // Show simplified by default
    showView('simplified');
}

function hideSimplifiedUI() {
    simplifyToggle.classList.add('hidden');
    simplifiedContent.classList.add('hidden');
}

btnShowOriginal.addEventListener('click', () => showView('original'));
btnShowSimplified.addEventListener('click', () => showView('simplified'));

function showView(view: 'original' | 'simplified') {
    if (view === 'original') {
        chunkText.classList.remove('hidden');
        simplifiedContent.classList.add('hidden');
        btnShowOriginal.classList.add('active');
        btnShowSimplified.classList.remove('active');
    } else {
        chunkText.classList.add('hidden');
        simplifiedContent.classList.remove('hidden');
        btnShowOriginal.classList.remove('active');
        btnShowSimplified.classList.add('active');
    }
}

// ─── TTS ────────────────────────────────────────────────────────────

ctlTtsPlay.addEventListener('click', () => {
    const textToRead = guidedMode && readingPlan
        ? readingPlan.chunks[currentChunkIndex]?.text || ''
        : article?.text || '';

    if (!textToRead) return;

    // Add highlight class to current chunk
    if (guidedMode) {
        $('#guided-chunk-display')?.classList.add('tts-speaking');
    }

    speak(textToRead, { rate: settings.ttsRate, engine: settings.ttsEngine }, {
        onStart: () => {
            ctlTtsPlay.classList.add('hidden');
            ctlTtsPause.classList.remove('hidden');
            ctlTtsStop.classList.remove('hidden');
        },
        onEnd: () => {
            ctlTtsPlay.classList.remove('hidden');
            ctlTtsPause.classList.add('hidden');
            ctlTtsStop.classList.add('hidden');
            $('#guided-chunk-display')?.classList.remove('tts-speaking');
        },
        onError: () => {
            ctlTtsPlay.classList.remove('hidden');
            ctlTtsPause.classList.add('hidden');
            ctlTtsStop.classList.add('hidden');
        },
    });
});

ctlTtsPause.addEventListener('click', () => {
    if (ttsIsActive()) {
        ttsPause();
        ctlTtsPause.classList.add('hidden');
        ctlTtsPlay.classList.remove('hidden');
    }
});

ctlTtsStop.addEventListener('click', () => {
    ttsStop();
    ctlTtsPlay.classList.remove('hidden');
    ctlTtsPause.classList.add('hidden');
    ctlTtsStop.classList.add('hidden');
    $('#guided-chunk-display')?.classList.remove('tts-speaking');
});

// ─── Explain pill + tooltip ─────────────────────────────────────────

let selectedText = '';

document.addEventListener('mouseup', (e) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';

    if (text.length > 1 && text.length < 200) {
        selectedText = text;
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        explainPill.style.left = `${rect.left + rect.width / 2 - 40}px`;
        explainPill.style.top = `${rect.bottom + window.scrollY + 6}px`;
        explainPill.classList.remove('hidden');
    } else {
        // Don't hide if clicking the pill itself or tooltip
        const target = e.target as HTMLElement;
        if (!target.closest('#explain-pill') && !target.closest('#explain-tooltip')) {
            explainPill.classList.add('hidden');
        }
    }
});

// Keyboard shortcut: E to explain
document.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') {
        if (selectedText && !explainPill.classList.contains('hidden')) {
            e.preventDefault();
            triggerExplain();
        }
    }
});

explainPill.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerExplain();
});

tooltipClose.addEventListener('click', () => {
    explainTooltip.classList.add('hidden');
    explainPill.classList.add('hidden');
});

async function triggerExplain() {
    if (!selectedText) return;

    // Position tooltip
    const pillRect = explainPill.getBoundingClientRect();
    explainTooltip.style.left = `${Math.max(10, pillRect.left - 100)}px`;
    explainTooltip.style.top = `${pillRect.bottom + window.scrollY + 4}px`;
    explainTooltip.classList.remove('hidden');
    tooltipLoading.classList.remove('hidden');
    tooltipText.textContent = '';
    tooltipExample.classList.add('hidden');

    explainPill.classList.add('hidden');

    try {
        const resp = await sendMessage<Explanation>({ type: 'EXPLAIN_SELECTION', text: selectedText });
        tooltipLoading.classList.add('hidden');

        if (resp.ok && resp.data) {
            tooltipText.textContent = resp.data.explanation;
            if (resp.data.example) {
                tooltipExample.textContent = `Example: ${resp.data.example}`;
                tooltipExample.classList.remove('hidden');
            }

            // Save to glossary
            await sendMessage({
                type: 'SAVE_GLOSSARY_ENTRY',
                articleId,
                entry: { term: selectedText, definition: resp.data.explanation, example: resp.data.example },
            });
            loadGlossary();
        } else {
            tooltipText.textContent = resp.error || 'Explanation unavailable.';
        }
    } catch (err: any) {
        tooltipLoading.classList.add('hidden');
        tooltipText.textContent = err?.message || 'Explanation failed.';
    }
}

// ─── Glossary panel ─────────────────────────────────────────────────

async function loadGlossary() {
    try {
        const resp = await sendMessage<GlossaryEntry[]>({ type: 'GET_GLOSSARY', articleId });
        if (resp.ok && resp.data && resp.data.length > 0) {
            glossaryList.innerHTML = resp.data
                .map(g => `<li><strong>${g.term}</strong>: ${g.definition}${g.example ? ` <em>(${g.example})</em>` : ''}</li>`)
                .join('');

            // Show glossary in guided mode
            if (guidedMode) {
                glossaryPanel.classList.remove('hidden');
            }
        }
    } catch { /* ignore */ }
}

// ─── Boot ───────────────────────────────────────────────────────────
init();
