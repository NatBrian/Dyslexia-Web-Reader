/* ===================================================================
 * extractor/ — Extract article content from any web page.
 * Uses vendored Readability + HTML sanitiser.
 * =================================================================== */

import { parseReadability } from '@lib/readability';
import { sanitizeHtml } from '@lib/sanitize';
import type { Article } from '@shared/types';

/**
 * Generate a deterministic article ID from its URL.
 */
function articleIdFromUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        const ch = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0; // 32-bit int
    }
    return 'art_' + Math.abs(hash).toString(36);
}

/**
 * Extract the main article content from the current document.
 * Returns null if extraction fails.
 */
export function extractArticle(doc: Document): Article | null {
    const result = parseReadability(doc);
    if (!result || !result.textContent || result.textContent.length < 100) {
        return null;
    }

    const url = doc.location?.href || '';
    return {
        id: articleIdFromUrl(url),
        url,
        title: result.title,
        byline: result.byline || undefined,
        contentHtml: sanitizeHtml(result.content),
        text: result.textContent,
        extractedAt: Date.now(),
    };
}
