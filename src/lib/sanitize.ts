/* ===================================================================
 * HTML Sanitiser — allowlist-based.
 * Strips everything except safe tags and attributes.
 * No external dependency (no DOMPurify needed).
 * =================================================================== */

const ALLOWED_TAGS = new Set([
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'em', 'strong', 'b', 'i', 'u', 'sub', 'sup', 'mark',
    'a', 'img', 'figure', 'figcaption', 'table', 'thead',
    'tbody', 'tr', 'th', 'td', 'span', 'div', 'section',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    td: new Set(['colspan', 'rowspan']),
    th: new Set(['colspan', 'rowspan']),
};

/**
 * Sanitise an HTML string by keeping only allowed tags/attributes.
 * Runs in a document context (content script or extension page).
 */
export function sanitizeHtml(dirtyHtml: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirtyHtml, 'text/html');
    cleanNode(doc.body);
    return doc.body.innerHTML;
}

function cleanNode(node: Node): void {
    const toRemove: Node[] = [];

    node.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            const tag = el.tagName.toLowerCase();

            if (!ALLOWED_TAGS.has(tag)) {
                // Unwrap: keep children, remove the wrapping tag
                while (el.firstChild) {
                    el.parentNode?.insertBefore(el.firstChild, el);
                }
                toRemove.push(el);
                return;
            }

            // Strip disallowed attributes
            const allowed = ALLOWED_ATTRS[tag] || new Set<string>();
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
                if (!allowed.has(attr.name)) {
                    el.removeAttribute(attr.name);
                }
            }

            // Sanitise href/src to prevent javascript: URIs
            if (el.hasAttribute('href')) {
                const href = el.getAttribute('href') || '';
                if (href.trim().toLowerCase().startsWith('javascript:')) {
                    el.setAttribute('href', '#');
                }
            }
            if (el.hasAttribute('src')) {
                const src = el.getAttribute('src') || '';
                if (src.trim().toLowerCase().startsWith('javascript:')) {
                    el.removeAttribute('src');
                }
            }

            cleanNode(el);
        } else if (child.nodeType === Node.COMMENT_NODE) {
            toRemove.push(child);
        }
    });

    toRemove.forEach(n => n.parentNode?.removeChild(n));
}
