/* ===================================================================
 * Content Extractor — using @mozilla/readability
 * Plus custom pre-cleaning to remove ads and distractors.
 * =================================================================== */

import { Readability } from '@mozilla/readability';

export interface ReadabilityResult {
    title: string;
    byline: string | null;
    content: string;   // cleaned HTML string
    textContent: string;
    excerpt: string;
}

/**
 * Extract the main readable content from a document.
 * Clones the document to avoid mutating the live page.
 */
export function parseReadability(doc: Document): ReadabilityResult | null {
    try {
        const clone = doc.cloneNode(true) as Document;

        // Pre-clean the document before passing to Readability
        cleanDistractors(clone);

        // Usage: new Readability(doc).parse()
        const reader = new Readability(clone);
        const result = reader.parse();

        if (!result) return null;

        return {
            title: result.title || '',
            byline: result.byline || null,
            content: result.content || '',
            textContent: result.textContent || '',
            excerpt: result.excerpt || '',
        };
    } catch (err) {
        console.error('Readability extraction failed:', err);
        return null;
    }
}

/**
 * aggressively remove distractors that Readability might miss.
 */
function cleanDistractors(doc: Document): void {
    // 1. Remove elements based on CSS selectors
    const noiseSelectors = [
        // Ads and banners
        '.ad', '.ads', '.advertisement', '.banner', '.commercial',
        '[id^="google_ads"]', '[id^="div-gpt-ad"]', '[class^="ad-"]',
        '[id^="google-ads"]',
        'div[aria-label="Advertisement"]',

        // Social / Share
        '.social-share', '.share-buttons', '.social-links',

        // Comments
        '.comments', '#comments', '.comment-section',

        // Related Content / "Also Read"
        '.related-articles', '.read-more', '.also-read', '.related-posts',
        '.recommended', '.outbrain', '.taboola', '.zergnet',

        // Newsletter / Signups
        '.newsletter', '.signup', '.subscription', '.subscribe-widget',

        // Navigation / Footer (Readability usually handles these, but good to be sure)
        'nav', 'footer', 'header', 'aside',
        '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
    ];

    noiseSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 2. Remove elements based on text content (Case-insensitive)
    const textDistractors = [
        'advertisement',
        'sponsored',
        'also read:',
        'also read',
        'read more:',
        'sign up for our newsletters',
        'subscribe to our',
    ];

    // Traverse all elements and check their text
    // We target headers and small containers mostly
    const candidates = doc.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, span, section, li');
    candidates.forEach(el => {
        // If element has many children, don't remove it just because it contains the text
        // (unless it's a known container type like 'div' with specific text)
        // We want to target leaf nodes or small wrapper nodes.
        if (el.children.length > 5 && el.tagName === 'DIV') return;

        const text = el.textContent?.trim().toLowerCase() || '';

        // Check for exact matches or "starts with" for labels like "Also read:"
        for (const distractor of textDistractors) {
            if (text === distractor || (text.length < 50 && text.startsWith(distractor))) {
                if (distractor.includes('also read')) {
                    removeRelatedContentContainer(el);
                } else {
                    el.remove();
                }
                return; // Element removed, move to next
            }
        }
    });
}

function removeRelatedContentContainer(el: Element): void {
    // Walk up the tree to find the container of "Also read" section
    // Heuristic: container should have links or list items
    let parent = el.parentElement;
    let limit = 3; // go up at most 3 levels

    while (parent && limit > 0) {
        const tag = parent.tagName;
        // CRITICAL: Never remove the main content wrappers!
        if (tag === 'ARTICLE' || tag === 'MAIN' || tag === 'BODY') {
            break;
        }

        const cls = parent.className.toLowerCase();
        if (cls.includes('related') || cls.includes('read') || cls.includes('more')) {
            parent.remove();
            return;
        }

        // Check if parent has multiple links or list items
        const linkCount = parent.querySelectorAll('a').length;
        const listCount = parent.querySelectorAll('ul, ol').length;

        if (listCount > 0 || linkCount > 1) {
            parent.remove();
            return;
        }

        parent = parent.parentElement;
        limit--;
    }

    // Fallback: If we couldn't find a safe wrapper to remove, we are likely inside the main article
    // and the "Also read" is a header/paragraph followed by links.
    // We should remove the label and the immediate following link-heavy elements.
    removeNextSiblingsIfRelated(el);
    el.remove();
}

function removeNextSiblingsIfRelated(el: Element): void {
    let next = el.nextElementSibling;
    let limit = 5; // Check next 5 siblings max

    while (next && limit > 0) {
        let shouldRemove = false;
        const tag = next.tagName;
        const textLen = next.textContent?.trim().length || 0;

        // If it's a list, it's definitely related links
        if (tag === 'UL' || tag === 'OL') {
            shouldRemove = true;
        }
        // If it's a div with links
        else if (tag === 'DIV' && next.querySelector('a')) {
            shouldRemove = true;
        }
        // If it's a generic element with class "related" etc.
        else if (next.className.toLowerCase().includes('related')) {
            shouldRemove = true;
        }

        if (shouldRemove) {
            const toRemove = next;
            next = next.nextElementSibling; // move pointer before removing
            toRemove.remove();
            limit--;
        } else {
            // Stop if we hit a paragraph of text or header that looks like main content
            if (tag === 'P' && textLen > 50) return;
            if (tag === 'H2' || tag === 'H3') return;

            // If we are unsure/it's a small element, maybe continue? 
            // Better safe: stop.
            next = next.nextElementSibling;
            limit--;
        }
    }
}
