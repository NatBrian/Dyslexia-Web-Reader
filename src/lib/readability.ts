/* ===================================================================
 * Vendored Mozilla Readability — lightweight port
 * Based on: https://github.com/nicolo-ribaudo/readability
 *
 * This is a simplified extraction engine. For production, replace with
 * the full @nicolo-ribaudo/readability package if desired.
 * =================================================================== */

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

        // Remove noise elements
        const noiseSelectors = [
            'script', 'style', 'noscript', 'iframe', 'nav', 'footer',
            'header', 'aside', '[role="banner"]', '[role="navigation"]',
            '[role="complementary"]', '.sidebar', '.nav', '.footer',
            '.header', '.ad', '.advertisement', '.social-share',
            '.comments', '#comments', '.related-posts',
        ];
        noiseSelectors.forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Find article element or best candidate
        const article = findArticleContent(clone);
        if (!article) return null;

        const title = extractTitle(clone);
        const byline = extractByline(clone);

        return {
            title,
            byline,
            content: article.innerHTML,
            textContent: article.textContent?.trim() || '',
            excerpt: (article.textContent?.trim() || '').slice(0, 200),
        };
    } catch {
        return null;
    }
}

function extractTitle(doc: Document): string {
    // Try Open Graph title first
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) return ogTitle.getAttribute('content') || '';

    // Try <h1>
    const h1 = doc.querySelector('h1');
    if (h1?.textContent) return h1.textContent.trim();

    // Fallback to <title>
    return doc.title || 'Untitled';
}

function extractByline(doc: Document): string | null {
    const selectors = [
        '[rel="author"]', '.author', '.byline', '.post-author',
        'meta[name="author"]',
    ];
    for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
            const content = el.getAttribute('content') || el.textContent;
            if (content?.trim()) return content.trim();
        }
    }
    return null;
}

function findArticleContent(doc: Document): Element | null {
    // Check semantic <article> elements
    const articles = doc.querySelectorAll('article');
    if (articles.length === 1) return articles[0];

    // If multiple <article>, pick the longest one
    if (articles.length > 1) {
        let best: Element | null = null;
        let bestLen = 0;
        articles.forEach(a => {
            const len = a.textContent?.length || 0;
            if (len > bestLen) { bestLen = len; best = a; }
        });
        if (best && bestLen > 200) return best;
    }

    // Try role=main / main element
    const main = doc.querySelector('main, [role="main"]');
    if (main && (main.textContent?.length || 0) > 200) return main;

    // Score-based: find element with the most <p> children with substantial text
    const candidates = doc.querySelectorAll('div, section');
    let bestCandidate: Element | null = null;
    let bestScore = 0;

    candidates.forEach(el => {
        const paragraphs = el.querySelectorAll('p');
        let score = 0;
        paragraphs.forEach(p => {
            const text = p.textContent?.trim() || '';
            if (text.length > 40) score += text.length;
        });
        // Penalise deeply nested elements
        let depth = 0;
        let parent: Element | null = el;
        while (parent) { depth++; parent = parent.parentElement; }
        score -= depth * 10;

        if (score > bestScore) { bestScore = score; bestCandidate = el; }
    });

    return bestCandidate;
}
