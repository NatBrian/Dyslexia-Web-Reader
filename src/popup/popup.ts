/* ===================================================================
 * Popup — action popup script
 * =================================================================== */

import { sendMessage } from '@modules/messaging';
import type { ReaderSettings } from '@shared/types';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

const statusEl = $('#status') as HTMLParagraphElement;
const btnReader = $('#btn-reader') as HTMLButtonElement;
const toggleDyslexic = $('#toggle-dyslexic') as HTMLInputElement;
const toggleHighlight = $('#toggle-highlight') as HTMLInputElement;
const linkOptions = $('#link-options') as HTMLAnchorElement;

// ─── Status helpers ─────────────────────────────────────────────────

function setStatus(text: string, type: 'info' | 'success' | 'error' = 'info') {
    statusEl.textContent = text;
    statusEl.className = `status status-${type}`;
}

// ─── Load current settings ──────────────────────────────────────────

async function loadSettings() {
    const resp = await sendMessage<ReaderSettings & { apiKey: string }>({ type: 'GET_SETTINGS' });
    if (resp.ok && resp.data) {
        toggleDyslexic.checked = resp.data.openDyslexic ?? false;
        toggleHighlight.checked = resp.data.highlightFocus ?? false;

        if (!resp.data.apiKey) {
            setStatus('⚠️ API key not set — local mode', 'info');
        } else {
            setStatus('Ready', 'success');
        }
    }
}

// ─── Enable Reader Mode ─────────────────────────────────────────────

btnReader.addEventListener('click', async () => {
    setStatus('Extracting article…', 'info');
    btnReader.disabled = true;

    try {
        const resp = await sendMessage<{ articleId: string }>({ type: 'EXTRACT_ARTICLE' });
        if (resp.ok) {
            setStatus('Reader opened!', 'success');
            // Close popup after a moment
            setTimeout(() => window.close(), 600);
        } else {
            setStatus(resp.error || 'Extraction failed', 'error');
        }
    } catch (err: any) {
        setStatus(err?.message || 'Error', 'error');
    } finally {
        btnReader.disabled = false;
    }
});

// ─── Quick toggles ──────────────────────────────────────────────────

toggleDyslexic.addEventListener('change', () => {
    sendMessage({ type: 'SAVE_SETTINGS', settings: { openDyslexic: toggleDyslexic.checked } });
});

toggleHighlight.addEventListener('change', () => {
    sendMessage({ type: 'SAVE_SETTINGS', settings: { highlightFocus: toggleHighlight.checked } });
});

// ─── Settings link ──────────────────────────────────────────────────

linkOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});

// ─── Init ───────────────────────────────────────────────────────────

loadSettings();
