import DOMPurify from 'dompurify';

// DOMPurify requires a window object.
// In the browser, 'window' is available.
// In tests (vitest with jsdom environment), 'window' is also available globally.
const purify = DOMPurify(typeof window !== 'undefined' ? window : {} as any);

/**
 * Sanitise an HTML string by keeping only safe tags/attributes.
 */
export function sanitizeHtml(dirtyHtml: string): string {
    return purify.sanitize(dirtyHtml, {
        ALLOWED_TAGS: [
            'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
            'em', 'strong', 'b', 'i', 'u', 'sub', 'sup', 'mark',
            'a', 'img', 'figure', 'figcaption', 'table', 'thead',
            'tbody', 'tr', 'th', 'td', 'span', 'div', 'section',
        ],
        ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'], // Global allowed attributes
    });
}
