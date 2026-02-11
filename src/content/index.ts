/* ===================================================================
 * Content Script — injected on-demand via chrome.scripting.executeScript.
 *
 * Listens for EXTRACT_ARTICLE message, runs extractor on the page,
 * and returns the Article payload.
 * =================================================================== */

import { extractArticle } from '@modules/extractor';
import type { ExtMessage, ExtResponse, Article } from '@shared/types';

// Only register listener once (guard against double-injection)
if (!(window as any).__DRA_CONTENT_LOADED) {
    (window as any).__DRA_CONTENT_LOADED = true;

    chrome.runtime.onMessage.addListener(
        (message: ExtMessage, _sender, sendResponse: (resp: ExtResponse<Article | null>) => void) => {
            if (message.type === 'EXTRACT_ARTICLE') {
                try {
                    const article = extractArticle(document);
                    if (article) {
                        sendResponse({ ok: true, data: article });
                    } else {
                        sendResponse({
                            ok: false,
                            error: 'Could not extract article content from this page. Try a different page with a clear article.',
                        });
                    }
                } catch (err: any) {
                    sendResponse({ ok: false, error: err?.message || 'Extraction error' });
                }
                return false; // synchronous response
            }
        },
    );
}
