import { describe, it, expect, beforeEach } from 'vitest';
import { parseReadability } from '../src/lib/readability';
import { JSDOM } from 'jsdom';

// Helper to create a document from HTML string
function createDoc(html: string): Document {
    const dom = new JSDOM(html, { url: 'http://localhost/' });
    const doc = dom.window.document;
    return doc;
}

describe('Extractor', () => {
    it('should extract basic article content', () => {
        const html = `
            <html>
                <head><title>Test Article</title></head>
                <body>
                    <article>
                        <h1>Test Article Title</h1>
                        <p>This is the main content of the article.</p>
                    </article>
                </body>
            </html>
        `;
        const doc = createDoc(html);
        const result = parseReadability(doc);
        expect(result).not.toBeNull();
        expect(result?.title).toBe('Test Article');
        expect(result?.textContent).toContain('This is the main content of the article.');
    });

    it('should remove advertisements', () => {
        const html = `
            <html>
                <body>
                    <article>
                        <h1>Article with Ads</h1>
                        <p>Main content paragraph 1.</p>
                        <div class="ad-container">Buy this product!</div>
                        <div id="google-ads">Ad content</div>
                        <p>Main content paragraph 2.</p>
                        <div class="advertisement">Another ad</div>
                    </article>
                </body>
            </html>
        `;
        const doc = createDoc(html);
        const result = parseReadability(doc);
        expect(result?.textContent).toContain('Main content paragraph 1');
        expect(result?.textContent).toContain('Main content paragraph 2');
        expect(result?.textContent).not.toContain('Buy this product!');
        expect(result?.textContent).not.toContain('Ad content');
        expect(result?.textContent).not.toContain('Another ad');
    });

    it('should remove "Also read" sections', () => {
        const html = `
            <html>
                <body>
                    <article>
                        <h1>Article with Related Links</h1>
                        <p>Main content.</p>
                        <div class="related-articles">
                            <h3>Also read:</h3>
                            <ul>
                                <li><a href="#">Related Article 1</a></li>
                                <li><a href="#">Related Article 2</a></li>
                            </ul>
                        </div>
                        <p>More main content.</p>
                    </article>
                </body>
            </html>
        `;
        const doc = createDoc(html);
        const result = parseReadability(doc);
        expect(result?.textContent).toContain('Main content');
        // This fails with current implementation if "related-articles" isn't in noiseSelectors
        // or if "Also read" isn't detected by text
        expect(result?.textContent).not.toContain('Also read');
        expect(result?.textContent).not.toContain('Related Article 1');
    });

    it('should remove newsletter signups', () => {
        const html = `
            <html>
                <body>
                    <article>
                        <h1>Article with Newsletter</h1>
                        <p>Main content.</p>
                        <div class="newsletter-signup">
                            <h3>Sign up for our newsletters</h3>
                            <p>Get the best stories in your inbox.</p>
                            <input type="email">
                        </div>
                    </article>
                </body>
            </html>
        `;
        const doc = createDoc(html);
        const result = parseReadability(doc);
        expect(result?.textContent).toContain('Main content');
        expect(result?.textContent).not.toContain('Sign up for our newsletters');
    });

    // Case based on the user screenshot
    it('should remove text-based "Also read:" distractions', () => {
        const html = `
            <html>
                <body>
                    <article>
                        <h1>Corruption report</h1>
                        <p>Singapore's performance was underpinned by robust legislations, effective enforcement, and a vigilant society united by a shared commitment to integrity. This zero-tolerance towards corruption and collective determination to do the right thing remain the cornerstone of Singapore's enduring reputation as a clean and corrupt-free nation.</p>
                        <p>The bureau also pointed to Singapore's top ranking out of 16 economies in the Political and Economic Risk Consultancy's 2025 report on corruption in Asia, the US and Australia.</p>
                        <p>The country also placed second globally out of 143 countries and first in Asia for absence of corruption in the World Justice Project Rule of Law Index 2025.</p>
                        <p>Also read:</p>
                        <div class="image-link">
                             <img src="foo.jpg">
                             <a href="#">Inside the CPIB: Meet the officers tackling corruption in Singapore</a>
                        </div>
                        <div class="image-link">
                             <img src="bar.jpg">
                             <a href="#">Singapore climbs 2 places to be ranked 3rd least corrupt country</a>
                        </div>
                        <p>Source: CNA/co(zl)</p>
                        <h3>Sign up for our newsletters</h3>
                        <p>Get our pick of top stories and thought-provoking articles in your inbox</p>
                    </article>
                </body>
            </html>
        `;
        const doc = createDoc(html);
        const result = parseReadability(doc);
        expect(result).not.toBeNull();
        expect(result?.textContent).toContain('Singapore\'s performance');
        expect(result?.textContent).not.toContain('Also read:');
        expect(result?.textContent).not.toContain('Inside the CPIB');
        expect(result?.textContent).not.toContain('Sign up for our newsletters');
    });
});
