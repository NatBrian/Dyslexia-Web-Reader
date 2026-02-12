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
    appendSpace: boolean;
    readingUnits: number;
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
    wordProgressRafs: new Map<string, number>(), // sentence id -> requestAnimationFrame id
    wordProgressEndEl: new Map<string, HTMLElement>(), // sentence id -> current right cap element
    progressRunToken: 0,
    wordProgressIndex: new Map<string, number>(), // sentence id -> next word index
    readingSpeed: 2, // words per second
    bionicAnchorCount: 5, // bold letters per sentence
    isPaused: false, // Pause state
};

const HAN_CHAR_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const PURE_HAN_WORD_RE = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+$/;
const SENTENCE_ENDING_PUNCT_RE = /[.!?。！？]+$/u;
const CJK_PUNCTUATION_RE = /[，。！？；：、,.!?;:]/;
const LATIN_ALNUM_RE = /[A-Za-z0-9]/;
const LATIN_CHARS_PER_UNIT = 3.5;

// ─── Sentence Segmentation ──────────────────────────────────────────

/**
 * Split text into sentences
 */
function segmentSentences(text: string): string[] {
    const sentenceRegex = /[^.!?。！？]*[.!?。！？]+/g;
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
    const normalized = sentence.replace(SENTENCE_ENDING_PUNCT_RE, '').trim();
    if (!normalized) return [];

    const hasWhitespace = /\s/.test(normalized);
    const hasHanChars = HAN_CHAR_RE.test(normalized);

    // Chinese text often has no spaces; tokenize per character for smoother progress.
    if (!hasWhitespace && hasHanChars) {
        const chars = Array.from(normalized).filter(ch =>
            ch.trim().length > 0 && !CJK_PUNCTUATION_RE.test(ch),
        );

        return chars.map(ch => {
            const text = formatMathToken(ch);
            return {
                text,
                appendSpace: false,
                readingUnits: getReadingUnits(text),
            };
        });
    }

    const wordTexts = normalized.split(/\s+/).filter(w => w.length > 0);
    const words: Word[] = [];

    wordTexts.forEach((rawText, tokenIdx) => {
        // For pure Chinese tokens, split into per-character units even in spaced text.
        if (PURE_HAN_WORD_RE.test(rawText) && rawText.length > 1) {
            const chars = Array.from(rawText);
            chars.forEach((ch, charIdx) => {
                const isLastChar = charIdx === chars.length - 1;
                words.push({
                    text: formatMathToken(ch),
                    appendSpace: isLastChar && tokenIdx < wordTexts.length - 1,
                    readingUnits: 1,
                });
            });
            return;
        }

        const text = formatMathToken(rawText);
        words.push({
            text,
            appendSpace: tokenIdx < wordTexts.length - 1,
            readingUnits: getReadingUnits(text),
        });
    });

    return words;
}

function getReadingUnits(text: string): number {
    let hanCount = 0;
    let latinLikeCount = 0;
    for (const ch of Array.from(text)) {
        if (HAN_CHAR_RE.test(ch)) {
            // 1 Chinese character = 1 speed unit.
            hanCount += 1;
        } else if (LATIN_ALNUM_RE.test(ch)) {
            latinLikeCount += 1;
        } else if (ch.trim().length > 0) {
            latinLikeCount += 1;
        }
    }

    // Lower chars-per-unit makes English spend more time (slower) at the same slider value.
    const latinUnits = latinLikeCount / LATIN_CHARS_PER_UNIT;
    const totalUnits = hanCount + latinUnits;
    return Math.max(0.5, totalUnits);
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
            
            // Preserve spacing behavior by language/tokenization mode.
            if (word.appendSpace) {
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
 * Each word fills from left to right based on its duration.
 */
function startReadingProgress(sentence: Sentence): void {
    const words = Array.from(document.querySelectorAll(
        `.focus-sentence[data-sentence-id="${sentence.id}"] .focus-word`,
    )) as HTMLElement[];

    if (words.length === 0) return;

    stopSentenceProgress(sentence.id);
    const runToken = ++focusState.progressRunToken;
    let wordIndex = focusState.wordProgressIndex.get(sentence.id) ?? 0;
    const timePerUnit = (1 / focusState.readingSpeed) * 1000; // ms per letter-equivalent

    const run = async () => {
        while (wordIndex < words.length) {
            if (!isSentenceRunActive(sentence.id, runToken)) break;

            const wordEl = words[wordIndex];
            if (wordIndex === 0) {
                wordEl.classList.add('focus-progress-start');
            }
            setSentenceProgressEnd(sentence.id, wordEl);
            const currentWord = sentence.words[wordIndex];
            const durationMs = Math.max(
                80,
                Math.round((currentWord?.readingUnits ?? 1) * timePerUnit),
            );

            const completed = await animateWordFill(sentence.id, runToken, wordEl, durationMs);
            if (!completed) break;

            wordEl.classList.remove('focus-word-progress');
            wordEl.classList.add('focus-word-complete');
            wordEl.style.removeProperty('--focus-progress');

            const nextEl = wordEl.nextElementSibling as HTMLElement | null;
            if (nextEl && nextEl.classList.contains('focus-space')) {
                nextEl.classList.add('focus-space-complete');
                setSentenceProgressEnd(sentence.id, nextEl);
            } else {
                setSentenceProgressEnd(sentence.id, wordEl);
            }

            wordIndex++;
            focusState.wordProgressIndex.set(sentence.id, wordIndex);
        }

        if (isSentenceRunActive(sentence.id, runToken)) {
            focusState.wordProgressRafs.delete(sentence.id);
        }
    };

    void run();
}

/**
 * Stop all word progress animations
 */
function stopAllProgress(): void {
    focusState.progressRunToken++;
    focusState.wordProgressRafs.forEach(rafId => {
        cancelAnimationFrame(rafId);
    });
    focusState.wordProgressRafs.clear();
}

function stopSentenceProgress(sentenceId: string): void {
    const rafId = focusState.wordProgressRafs.get(sentenceId);
    if (rafId) {
        cancelAnimationFrame(rafId);
        focusState.wordProgressRafs.delete(sentenceId);
    }
}

function setSentenceProgressEnd(sentenceId: string, el: HTMLElement): void {
    const prev = focusState.wordProgressEndEl.get(sentenceId);
    if (prev && prev !== el) {
        prev.classList.remove('focus-progress-end');
    }
    el.classList.add('focus-progress-end');
    focusState.wordProgressEndEl.set(sentenceId, el);
}

function isSentenceRunActive(sentenceId: string, runToken: number): boolean {
    return (
        focusState.enabled &&
        focusState.progressRunToken === runToken &&
        focusState.currentFocusSentence?.id === sentenceId
    );
}

function animateWordFill(
    sentenceId: string,
    runToken: number,
    wordEl: HTMLElement,
    durationMs: number,
): Promise<boolean> {
    wordEl.classList.add('focus-word-progress');
    wordEl.style.setProperty('--focus-progress', '0%');

    return new Promise(resolve => {
        let startedAt = 0;
        let pauseStartedAt = 0;
        let pausedMs = 0;

        const frame = (ts: number) => {
            if (!isSentenceRunActive(sentenceId, runToken)) {
                resolve(false);
                return;
            }

            if (focusState.isPaused) {
                if (!pauseStartedAt) pauseStartedAt = ts;
                const rafId = requestAnimationFrame(frame);
                focusState.wordProgressRafs.set(sentenceId, rafId);
                return;
            }

            if (pauseStartedAt) {
                pausedMs += ts - pauseStartedAt;
                pauseStartedAt = 0;
            }

            if (!startedAt) startedAt = ts;

            const elapsed = ts - startedAt - pausedMs;
            const progress = Math.min(1, elapsed / durationMs);
            wordEl.style.setProperty('--focus-progress', `${(progress * 100).toFixed(2)}%`);

            if (progress >= 1) {
                resolve(true);
                return;
            }

            const rafId = requestAnimationFrame(frame);
            focusState.wordProgressRafs.set(sentenceId, rafId);
        };

        const rafId = requestAnimationFrame(frame);
        focusState.wordProgressRafs.set(sentenceId, rafId);
    });
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
        (w as HTMLElement).classList.remove(
            'focus-word-progress',
            'focus-word-complete',
            'focus-progress-start',
            'focus-progress-end',
        );
        (w as HTMLElement).style.removeProperty('--focus-progress');
    });

    spaces.forEach(s => {
        (s as HTMLElement).classList.remove('focus-space-complete', 'focus-progress-end');
    });
    focusState.wordProgressEndEl.delete(sentence.id);
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
    focusState.wordProgressEndEl.clear();

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
