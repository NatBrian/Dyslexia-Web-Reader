/* ===================================================================
 * focusOnWords/ — Bionic reading with sentence coloring.
 *
 * Features:
 * - Sentence segmentation
 * - Bionic reading (first 5 letters per sentence, up to first 2 words)
 * - Global 5-color palette (text color)
 * - Reading progress (word-by-word with background fill)
 * - Keyboard-only selection
 * - Pause/resume with spacebar
 * =================================================================== */

import type { ReaderSettings } from '@shared/types';

// Global 5-color palette - readable, darker colors with good contrast
const GLOBAL_COLORS = [
    '#E74C3C', // Deep Red
    '#2980B9', // Deep Blue
    '#27AE60', // Deep Green
    '#8E44AD', // Deep Purple
    '#D35400', // Deep Orange
];

interface Word {
    text: string;
}

const SUBSCRIPT_DIGITS: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
};

const SUBSCRIPT_CHARS: Record<string, string> = {
    ...SUBSCRIPT_DIGITS,
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
};

const SUPERSCRIPT_CHARS: Record<string, string> = {
    ...SUPERSCRIPT_DIGITS,
    '+': '⁺',
    '-': '⁻',
    '=': '⁼',
    '(': '⁽',
    ')': '⁾',
};

interface Sentence {
    id: string;
    text: string;
    words: Word[];
    wordCount: number;
    colorIndex: number;
    color: string;
}

interface AllSentencesData {
    sentences: Sentence[];
    originalHTML: Map<HTMLElement, string>;
}

let focusState = {
    enabled: false,
    data: null as AllSentencesData | null,
    currentFocusSentence: null as Sentence | null,
    wordProgressIntervals: new Map<string, number>(), // sentence id -> interval id
    wordProgressIndex: new Map<string, number>(), // sentence id -> next word index
    readingSpeed: 2, // words per second
    bionicAnchorCount: 5, // bold letters per sentence
    isPaused: false, // Pause state
};

// ─── Sentence Segmentation ──────────────────────────────────────────

/**
 * Split text into sentences
 */
function segmentSentences(text: string): string[] {
    const sentenceRegex = /[^.!?]*[.!?]+/g;
    const sentences = text.match(sentenceRegex) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

function mapToScript(text: string, map: Record<string, string>): string {
    return text
        .split('')
        .map(ch => map[ch] ?? ch)
        .join('');
}

function toSubscript(text: string): string {
    return mapToScript(text, SUBSCRIPT_CHARS);
}

function toSuperscript(text: string): string {
    return mapToScript(text, SUPERSCRIPT_CHARS);
}

/**
 * Keep math/scientific formatting from inline HTML tags when focus mode flattens content.
 * - <sub>8</sub> => ₈
 * - <sup>2+</sup> => ²⁺
 */
function getParagraphPlainTextWithMathFormatting(paragraph: HTMLElement): string {
    const readNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (tag === 'br') return ' ';

        const childText = Array.from(el.childNodes).map(readNode).join('');
        if (tag === 'sub') return toSubscript(childText);
        if (tag === 'sup') return toSuperscript(childText);
        return childText;
    };

    return Array.from(paragraph.childNodes).map(readNode).join('');
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Extract words from sentence
 */
function extractWords(sentence: string): Word[] {
    const wordTexts = sentence
        .replace(/[.!?]+$/, '')
        .split(/\s+/)
        .filter(w => w.length > 0);

    return wordTexts.map(text => ({
        text: formatMathToken(text),
    }));
}

/**
 * Format math-like tokens so trailing digits render as subscript.
 * Also converts power notation to superscript.
 * Example: S8 -> S₈, CO2 -> CO₂, x^2 -> x², x^{12} -> x¹².
 */
function formatMathToken(token: string): string {
    let formatted = token.replace(
        /([A-Z\u0391-\u03A9][A-Za-z\u0370-\u03FF\u1F00-\u1FFF]*)(\d+)/g,
        (_match, symbolPart: string, digitsPart: string) => {
            const subDigits = toSubscript(digitsPart);
            return `${symbolPart}${subDigits}`;
        },
    );

    formatted = formatted.replace(
        /\^\{(\d+)\}/g,
        (_match, digitsPart: string) => toSuperscript(digitsPart),
    );

    formatted = formatted.replace(
        /\^(\d+)/g,
        (_match, digitsPart: string) => toSuperscript(digitsPart),
    );

    return formatted;
}

// ─── Bionic Reading ────────────────────────────────────────────────

/**
 * Apply bionic reading: bold first N letters of a word
 */
function renderBionicWord(word: Word, lettersToBold: number): string {
    if (lettersToBold <= 0) {
        return escapeHtml(word.text);
    }

    const boldLetters = Math.min(lettersToBold, word.text.length);
    const bold = escapeHtml(word.text.substring(0, boldLetters));
    const rest = escapeHtml(word.text.substring(boldLetters));

    if (rest) {
        return `<b>${bold}</b>${rest}`;
    } else {
        return `<b>${bold}</b>`;
    }
}

// ─── Sentence Rendering ────────────────────────────────────────────

/**
 * Render a sentence with bionic reading and color
 */
function renderSentence(sentence: Sentence): string {
    if (sentence.words.length === 0) return '';

    let remainingBionicLetters = focusState.bionicAnchorCount;
    const html = sentence.words
        .map((word, idx) => {
            const lettersForThisWord = idx < 2 ? remainingBionicLetters : 0;
            const bionicHTML = renderBionicWord(word, lettersForThisWord);
            if (idx < 2) {
                remainingBionicLetters -= Math.min(remainingBionicLetters, word.text.length);
            }
            const wordSpan = `<span class="focus-word" data-word-index="${idx}" style="color: ${sentence.color};">${bionicHTML}</span>`;
            
            // Add space after word (except last word)
            if (idx < sentence.words.length - 1) {
                return wordSpan + '<span class="focus-space"> </span>';
            }
            return wordSpan;
        })
        .join('');

    return `<span class="focus-sentence" data-sentence-id="${sentence.id}" style="color: ${sentence.color};">${html}</span>`;
}

// ─── Reading Progress ───────────────────────────────────────────────

/**
 * Start word-by-word progress animation for a sentence.
 * Words get highlighted as they are read.
 */
function startReadingProgress(sentence: Sentence): void {
    // Clear previous progress for this sentence
    if (focusState.wordProgressIntervals.has(sentence.id)) {
        clearInterval(focusState.wordProgressIntervals.get(sentence.id)!);
    }

    const words = document.querySelectorAll(
        `.focus-sentence[data-sentence-id="${sentence.id}"] .focus-word`,
    );
    const spaces = document.querySelectorAll(
        `.focus-sentence[data-sentence-id="${sentence.id}"] .focus-space`,
    );

    if (words.length === 0) return;

    let wordIndex = focusState.wordProgressIndex.get(sentence.id) ?? 0;
    const timePerWord = (1 / focusState.readingSpeed) * 1000; // ms per word

    const interval = window.setInterval(() => {
        if (focusState.isPaused) {
            // Don't advance on pause, but keep the interval running
            return;
        }

        // Highlight current word and following space
        if (wordIndex < words.length) {
            const word = words[wordIndex] as HTMLElement;
            // Fill with bright yellow background
            word.style.backgroundColor = '#FFEB3B';
            word.style.borderRadius = '3px';

            // Also fill the space after this word (if not last)
            if (wordIndex < spaces.length) {
                const space = spaces[wordIndex] as HTMLElement;
                space.style.backgroundColor = '#FFEB3B';
            }

            wordIndex++;
            focusState.wordProgressIndex.set(sentence.id, wordIndex);
        } else {
            // Animation complete
            clearInterval(interval);
            focusState.wordProgressIntervals.delete(sentence.id);
        }
    }, timePerWord);

    focusState.wordProgressIntervals.set(sentence.id, interval);
}

/**
 * Stop all word progress animations
 */
function stopAllProgress(): void {
    focusState.wordProgressIntervals.forEach(intervalId => {
        clearInterval(intervalId);
    });
    focusState.wordProgressIntervals.clear();
}

/**
 * Clear all progress highlight from all words and spaces in a sentence
 */
function clearSentenceProgress(sentence: Sentence): void {
    const words = document.querySelectorAll(
        `.focus-sentence[data-sentence-id="${sentence.id}"] .focus-word`,
    );
    const spaces = document.querySelectorAll(
        `.focus-sentence[data-sentence-id="${sentence.id}"] .focus-space`,
    );

    words.forEach(w => {
        (w as HTMLElement).style.backgroundColor = '';
        (w as HTMLElement).style.borderRadius = '';
    });

    spaces.forEach(s => {
        (s as HTMLElement).style.backgroundColor = '';
    });
    focusState.wordProgressIndex.delete(sentence.id);
}

// ─── Focus Management ───────────────────────────────────────────────

/**
 * Focus handler for keyboard navigation
 */
function setFocusSentence(sentence: Sentence): void {
    // Clear pause state when changing focus
    focusState.isPaused = false;

    // If already focused, don't re-render
    if (focusState.currentFocusSentence?.id === sentence.id) {
        return;
    }

    // Clear old focus visual
    if (focusState.currentFocusSentence) {
        const oldEl = document.querySelector(
            `.focus-sentence[data-sentence-id="${focusState.currentFocusSentence.id}"]`,
        ) as HTMLElement;
        if (oldEl) {
            oldEl.style.opacity = '1';
            oldEl.classList.remove('focus-sentence-active');
            clearSentenceProgress(focusState.currentFocusSentence);
        }
    }

    // Stop all progress
    stopAllProgress();

    // Set new focus
    focusState.currentFocusSentence = sentence;

    // Apply new focus visual
    const el = document.querySelector(
        `.focus-sentence[data-sentence-id="${sentence.id}"]`,
    ) as HTMLElement;

    if (el) {
        el.style.opacity = '0.9';
        el.classList.add('focus-sentence-active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Start reading progress
        focusState.wordProgressIndex.set(sentence.id, 0);
        startReadingProgress(sentence);
    }
}

/**
 * Navigate sentences
 */
function navigateSentence(direction: 'next' | 'prev'): void {
    if (!focusState.data || !focusState.currentFocusSentence) return;

    const sentences = focusState.data.sentences;
    const currentIdx = sentences.findIndex(s => s.id === focusState.currentFocusSentence!.id);

    if (currentIdx === -1) return;

    let nextIdx = -1;
    if (direction === 'next' && currentIdx < sentences.length - 1) {
        nextIdx = currentIdx + 1;
    } else if (direction === 'prev' && currentIdx > 0) {
        nextIdx = currentIdx - 1;
    }

    if (nextIdx >= 0) {
        setFocusSentence(sentences[nextIdx]);
    }
}

// ─── Pause/Resume ──────────────────────────────────────────────────

/**
 * Toggle pause state (spacebar)
 */
function togglePause(): void {
    focusState.isPaused = !focusState.isPaused;
}

// ─── Parse All Text ────────────────────────────────────────────────

/**
 * Parse article body into sentences with global color cycling
 */
function parseArticle(articleBody: HTMLElement): AllSentencesData {
    const data: AllSentencesData = {
        sentences: [],
        originalHTML: new Map(),
    };

    const paragraphs = articleBody.querySelectorAll('p');
    let sentenceIndex = 0;

    paragraphs.forEach(p => {
        // Store original HTML
        data.originalHTML.set(p, p.innerHTML);

        const text = getParagraphPlainTextWithMathFormatting(p);
        if (!text.trim()) return;

        const sentenceTexts = segmentSentences(text);

        sentenceTexts.forEach(sentenceText => {
            const words = extractWords(sentenceText);
            if (words.length > 0) {
                const sentence: Sentence = {
                    id: `sent-${sentenceIndex}`,
                    text: sentenceText,
                    words,
                    wordCount: words.length,
                    colorIndex: sentenceIndex % GLOBAL_COLORS.length,
                    color: GLOBAL_COLORS[sentenceIndex % GLOBAL_COLORS.length],
                };
                data.sentences.push(sentence);
                sentenceIndex++;
            }
        });
    });

    return data;
}

/**
 * Render all parsed sentences back into paragraphs
 */
function renderParsedSentences(articleBody: HTMLElement, data: AllSentencesData): void {
    const paragraphs = articleBody.querySelectorAll('p');
    let sentenceIndex = 0;

    paragraphs.forEach(p => {
        const text = getParagraphPlainTextWithMathFormatting(p);
        if (!text.trim()) return;

        const sentenceTexts = segmentSentences(text);
        const sentenceHTMLs: string[] = [];

        sentenceTexts.forEach(() => {
            if (sentenceIndex < data.sentences.length) {
                sentenceHTMLs.push(renderSentence(data.sentences[sentenceIndex]));
                sentenceIndex++;
            }
        });

        p.innerHTML = sentenceHTMLs.join(' ');

        // Keyboard navigation controls sentence focus.
    });
}

// ─── Keyboard Navigation ────────────────────────────────────────────

function handleKeyboardNavigation(e: KeyboardEvent): void {
    if (!focusState.enabled) return;

    // Spacebar: pause/resume
    if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
        return;
    }

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateSentence('next');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateSentence('prev');
    } else if (e.key === 'Escape') {
        e.preventDefault();
        disableFocusOnWords();
    }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Enable focus-on-words mode
 */
export function enableFocusOnWords(
    articleBody: HTMLElement,
    settings: ReaderSettings,
): void {
    if (focusState.enabled) return;

    focusState.enabled = true;
    focusState.readingSpeed = settings.readingSpeed || 2;
    focusState.bionicAnchorCount = settings.bionicAnchorCount || 5;
    focusState.isPaused = false;

    // Parse article
    focusState.data = parseArticle(articleBody);
    renderParsedSentences(articleBody, focusState.data);

    // Set focus to first sentence
    if (focusState.data.sentences.length > 0) {
        setFocusSentence(focusState.data.sentences[0]);
    }

    // Add keyboard listener
    document.addEventListener('keydown', handleKeyboardNavigation);
}

/**
 * Disable focus-on-words mode
 */
export function disableFocusOnWords(): void {
    if (!focusState.enabled) return;

    focusState.enabled = false;

    // Stop all animations
    stopAllProgress();

    // Restore original HTML
    if (focusState.data) {
        focusState.data.originalHTML.forEach((html, element) => {
            element.innerHTML = html;
        });
    }

    // Clear state
    focusState.data = null;
    focusState.currentFocusSentence = null;
    focusState.isPaused = false;
    focusState.wordProgressIndex.clear();

    // Remove keyboard listener
    document.removeEventListener('keydown', handleKeyboardNavigation);
}

export function isFocusOnWordsEnabled(): boolean {
    return focusState.enabled;
}

export function updateFocusSettings(settings: Partial<ReaderSettings>): void {
    if (typeof settings.readingSpeed === 'number') {
        focusState.readingSpeed = settings.readingSpeed;
        // Apply speed change immediately to the currently focused sentence.
        if (focusState.enabled && focusState.currentFocusSentence) {
            startReadingProgress(focusState.currentFocusSentence);
        }
    }
    if (typeof settings.bionicAnchorCount === 'number') {
        focusState.bionicAnchorCount = settings.bionicAnchorCount;
    }
}
