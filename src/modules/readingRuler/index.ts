/* ===================================================================
 * readingRuler/ — Reading Ruler / Spotlight overlay.
 *
 * Creates a semi-transparent overlay that dims the page except for
 * a focus band around the current line or paragraph.
 *
 * Controls:
 *   - Toggle on/off
 *   - Mode: 'line' (follows mouse) or 'paragraph' (J/K navigation)
 *   - Esc to disable
 * =================================================================== */

import type { ReaderSettings } from '@shared/types';

interface RulerState {
    mode: 'line' | 'paragraph';
    active: boolean;
    container: HTMLElement | null;
    overlay: HTMLElement | null;
    currentParaIndex: number;
    paragraphs: HTMLElement[];
    handlers: {
        mousemove: (e: MouseEvent) => void;
        keydown: (e: KeyboardEvent) => void;
    };
}

const state: RulerState = {
    mode: 'line',
    active: false,
    container: null,
    overlay: null,
    currentParaIndex: 0,
    paragraphs: [],
    handlers: {
        mousemove: () => { },
        keydown: () => { },
    },
};

const RULER_HEIGHT = 48; // px — height of the visible band in line mode

/**
 * Initialise the reading ruler on a container element.
 */
export function initRuler(container: HTMLElement): void {
    state.container = container;
    state.paragraphs = Array.from(container.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote'));

    // Create overlay elements
    createOverlay();

    // Set up event handlers
    state.handlers.mousemove = handleMouseMove;
    state.handlers.keydown = handleKeyDown;
}

/**
 * Enable the ruler.
 */
export function enableRuler(mode: 'line' | 'paragraph' = 'line'): void {
    state.mode = mode;
    state.active = true;

    if (!state.overlay) createOverlay();
    state.overlay!.style.display = 'block';

    if (mode === 'line') {
        document.addEventListener('mousemove', state.handlers.mousemove);
    }
    document.addEventListener('keydown', state.handlers.keydown);

    if (mode === 'paragraph') {
        highlightParagraph(state.currentParaIndex);
    }
}

/**
 * Disable and hide the ruler.
 */
export function disableRuler(): void {
    state.active = false;
    if (state.overlay) {
        state.overlay.style.display = 'none';
    }
    document.removeEventListener('mousemove', state.handlers.mousemove);
    document.removeEventListener('keydown', state.handlers.keydown);
    clearParagraphHighlight();
}

/**
 * Set ruler mode.
 */
export function setRulerMode(mode: 'line' | 'paragraph'): void {
    const wasActive = state.active;
    if (wasActive) disableRuler();
    state.mode = mode;
    if (wasActive) enableRuler(mode);
}

/**
 * Clean up all ruler resources.
 */
export function destroyRuler(): void {
    disableRuler();
    state.overlay?.remove();
    state.overlay = null;
    state.container = null;
    state.paragraphs = [];
}

// ─── Internal ───────────────────────────────────────────────────────

function createOverlay(): void {
    if (state.overlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'dra-ruler-overlay';
    overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 99999;
    display: none;
    transition: opacity 0.15s ease;
  `;
    document.body.appendChild(overlay);
    state.overlay = overlay;
}

function handleMouseMove(e: MouseEvent): void {
    if (!state.active || state.mode !== 'line' || !state.overlay) return;

    const y = e.clientY;
    const top = y - RULER_HEIGHT / 2;
    const bottom = y + RULER_HEIGHT / 2;

    // Use CSS mask/clip to create the "spotlight" effect
    state.overlay.style.background = `
    linear-gradient(
      to bottom,
      rgba(0,0,0,0.55) 0%,
      rgba(0,0,0,0.55) ${top}px,
      transparent ${top}px,
      transparent ${bottom}px,
      rgba(0,0,0,0.55) ${bottom}px,
      rgba(0,0,0,0.55) 100%
    )
  `;
}

function handleKeyDown(e: KeyboardEvent): void {
    if (!state.active) return;

    if (e.key === 'Escape') {
        disableRuler();
        return;
    }

    if (state.mode === 'paragraph') {
        if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
            e.preventDefault();
            moveParagraph(1);
        } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveParagraph(-1);
        }
    }
}

function moveParagraph(delta: number): void {
    const next = state.currentParaIndex + delta;
    if (next >= 0 && next < state.paragraphs.length) {
        state.currentParaIndex = next;
        highlightParagraph(next);
    }
}

function highlightParagraph(index: number): void {
    clearParagraphHighlight();
    const para = state.paragraphs[index];
    if (!para || !state.overlay) return;

    // Scroll paragraph into view
    para.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const rect = para.getBoundingClientRect();
    const pad = 8;

    state.overlay.style.background = `
    linear-gradient(
      to bottom,
      rgba(0,0,0,0.55) 0%,
      rgba(0,0,0,0.55) ${rect.top - pad}px,
      transparent ${rect.top - pad}px,
      transparent ${rect.bottom + pad}px,
      rgba(0,0,0,0.55) ${rect.bottom + pad}px,
      rgba(0,0,0,0.55) 100%
    )
  `;

    para.classList.add('dra-ruler-focus');
}

function clearParagraphHighlight(): void {
    state.paragraphs.forEach(p => p.classList.remove('dra-ruler-focus'));
}
