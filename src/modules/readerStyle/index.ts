/* ===================================================================
 * readerStyle/ — Dyslexia-friendly CSS variable engine.
 *
 * Sets CSS custom properties on a root element so all child content
 * picks up the user's preferred layout. Handles theme switching and
 * OpenDyslexic font toggling.
 * =================================================================== */

import type { ReaderSettings } from '@shared/types';

const THEME_COLORS: Record<ReaderSettings['theme'], { bg: string; fg: string; accent: string; surface: string }> = {
    cream: { bg: '#FBF5E6', fg: '#2C2410', accent: '#B8860B', surface: '#F5ECD7' },
    gray: { bg: '#E8E8E8', fg: '#1A1A1A', accent: '#5A7D9A', surface: '#D8D8D8' },
    dark: { bg: '#1E1E2E', fg: '#CDD6F4', accent: '#89B4FA', surface: '#313244' },
};

/**
 * Apply reader styles to a root element based on user settings.
 */
export function applyReaderStyles(root: HTMLElement, settings: ReaderSettings): void {
    const theme = THEME_COLORS[settings.theme] || THEME_COLORS.cream;

    root.style.setProperty('--dra-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--dra-line-spacing', `${settings.lineSpacing}`);
    root.style.setProperty('--dra-letter-spacing', `${settings.letterSpacing}em`);
    root.style.setProperty('--dra-word-spacing', `${settings.wordSpacing}em`);
    root.style.setProperty('--dra-margin-width', `${settings.marginWidth}px`);

    root.style.setProperty('--dra-bg', theme.bg);
    root.style.setProperty('--dra-fg', theme.fg);
    root.style.setProperty('--dra-accent', theme.accent);
    root.style.setProperty('--dra-surface', theme.surface);

    // Font family
    if (settings.openDyslexic) {
        root.style.setProperty('--dra-font-family', "'OpenDyslexic', 'Comic Sans MS', sans-serif");
        root.classList.add('dra-opendyslexic');
    } else {
        root.style.setProperty('--dra-font-family', "'Inter', 'Segoe UI', system-ui, sans-serif");
        root.classList.remove('dra-opendyslexic');
    }

    // Apply to root
    root.style.backgroundColor = theme.bg;
    root.style.color = theme.fg;
}

/**
 * Get CSS text for the base reader layout.
 * Injected once into the reader page <style>.
 */
export function getBaseReaderCSS(): string {
    return `
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('/assets/fonts/OpenDyslexic-Regular.woff2') format('woff2');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    :root {
      --dra-font-size: 18px;
      --dra-line-spacing: 1.8;
      --dra-letter-spacing: 0.05em;
      --dra-word-spacing: 0.1em;
      --dra-margin-width: 120px;
      --dra-bg: #FBF5E6;
      --dra-fg: #2C2410;
      --dra-accent: #B8860B;
      --dra-surface: #F5ECD7;
      --dra-font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    }

    .dra-ruler-focus {
      outline: 3px solid var(--dra-accent) !important;
      outline-offset: 4px;
      border-radius: 4px;
    }
  `;
}
