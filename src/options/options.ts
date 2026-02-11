/* ===================================================================
 * Options page script
 * =================================================================== */

import { sendMessage } from '@modules/messaging';
import type { ReaderSettings } from '@shared/types';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const $$ = (s: string) => document.querySelectorAll(s);

// ─── Element references ─────────────────────────────────────────────
const apiKeyInput = $('#api-key') as HTMLInputElement;
const modelInput = $('#model') as HTMLInputElement;
const elevenLabsKeyInput = $('#elevenlabs-key') as HTMLInputElement;
const btnTest = $('#btn-test') as HTMLButtonElement;
const testResult = $('#test-result') as HTMLSpanElement;
const btnSave = $('#btn-save') as HTMLButtonElement;
const saveResult = $('#save-result') as HTMLSpanElement;
const btnClear = $('#btn-clear') as HTMLButtonElement;

// Range inputs
const sliders: Record<string, { input: HTMLInputElement; display: HTMLSpanElement }> = {};
['fontsize', 'linespacing', 'letterspacing', 'wordspacing', 'marginwidth', 'ttsrate'].forEach(id => {
    sliders[id] = {
        input: $(`#${id}`) as HTMLInputElement,
        display: $(`#val-${id}`) as HTMLSpanElement,
    };
});

// Toggles
const dyslexicToggle = $('#opendyslexic') as HTMLInputElement;
const highlightToggle = $('#highlight-focus') as HTMLInputElement;
const ttsEngineSelect = $('#tts-engine') as HTMLSelectElement;

// ─── Load current settings ──────────────────────────────────────────
async function loadSettings() {
    const resp = await sendMessage<any>({ type: 'GET_SETTINGS' });
    if (!resp.ok || !resp.data) return;
    const d = resp.data;

    apiKeyInput.value = d.apiKey || '';
    modelInput.value = d.model || 'openrouter/auto';
    elevenLabsKeyInput.value = d.elevenLabsApiKey || '';

    if (d.fontSize) { sliders.fontsize.input.value = d.fontSize; sliders.fontsize.display.textContent = d.fontSize; }
    if (d.lineSpacing) { sliders.linespacing.input.value = d.lineSpacing; sliders.linespacing.display.textContent = d.lineSpacing; }
    if (d.letterSpacing !== undefined) { sliders.letterspacing.input.value = d.letterSpacing; sliders.letterspacing.display.textContent = d.letterSpacing; }
    if (d.wordSpacing !== undefined) { sliders.wordspacing.input.value = d.wordSpacing; sliders.wordspacing.display.textContent = d.wordSpacing; }
    if (d.marginWidth) { sliders.marginwidth.input.value = d.marginWidth; sliders.marginwidth.display.textContent = d.marginWidth; }
    if (d.ttsRate) { sliders.ttsrate.input.value = d.ttsRate; sliders.ttsrate.display.textContent = d.ttsRate; }

    dyslexicToggle.checked = d.openDyslexic ?? false;
    highlightToggle.checked = d.highlightFocus ?? false;
    ttsEngineSelect.value = d.ttsEngine || 'web';

    // Highlight active theme
    updateThemeButtons(d.theme || 'cream');
}

// ─── Slider live updates ────────────────────────────────────────────
Object.entries(sliders).forEach(([, { input, display }]) => {
    input.addEventListener('input', () => {
        display.textContent = input.value;
    });
});

// ─── Theme buttons ──────────────────────────────────────────────────
let selectedTheme = 'cream';

function updateThemeButtons(theme: string) {
    selectedTheme = theme;
    $$('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === theme);
    });
}

$$('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        updateThemeButtons((btn as HTMLElement).dataset.theme || 'cream');
    });
});

// ─── Save ───────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
    const settings: any = {
        openRouterApiKey: apiKeyInput.value.trim(),
        openRouterModel: modelInput.value.trim() || 'openrouter/auto',
        fontSize: Number(sliders.fontsize.input.value),
        lineSpacing: Number(sliders.linespacing.input.value),
        letterSpacing: Number(sliders.letterspacing.input.value),
        wordSpacing: Number(sliders.wordspacing.input.value),
        marginWidth: Number(sliders.marginwidth.input.value),
        theme: selectedTheme,
        openDyslexic: dyslexicToggle.checked,
        highlightFocus: highlightToggle.checked,
        ttsEngine: ttsEngineSelect.value,
        ttsRate: Number(sliders.ttsrate.input.value),
        elevenLabsApiKey: elevenLabsKeyInput.value.trim() || undefined,
    };

    const resp = await sendMessage({ type: 'SAVE_SETTINGS', settings });
    saveResult.textContent = resp.ok ? '✅ Saved!' : '❌ ' + (resp.error || 'Save failed');
    saveResult.className = `test-result ${resp.ok ? 'success' : 'error'}`;
    setTimeout(() => { saveResult.textContent = ''; }, 3000);
});

// ─── Test API ───────────────────────────────────────────────────────
btnTest.addEventListener('click', async () => {
    testResult.textContent = 'Testing…';
    testResult.className = 'test-result';
    btnTest.disabled = true;

    // Save key first so background can use it
    await sendMessage({
        type: 'SAVE_SETTINGS',
        settings: {
            openRouterApiKey: apiKeyInput.value.trim(),
            openRouterModel: modelInput.value.trim() || 'openrouter/auto',
        },
    });

    const resp = await sendMessage({ type: 'TEST_API' });
    testResult.textContent = resp.ok ? '✅ Connected!' : '❌ ' + (resp.error || 'Test failed');
    testResult.className = `test-result ${resp.ok ? 'success' : 'error'}`;
    btnTest.disabled = false;
});

// ─── Clear cache ────────────────────────────────────────────────────
btnClear.addEventListener('click', async () => {
    if (!confirm('Clear all cached articles and reading plans?')) return;
    await sendMessage({ type: 'CLEAR_CACHE' });
    alert('Cache cleared!');
});

// ─── Init ───────────────────────────────────────────────────────────
loadSettings();
