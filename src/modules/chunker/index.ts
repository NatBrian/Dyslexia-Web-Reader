/* ===================================================================
 * chunker/ — Split article text into guided reading chunks.
 *
 * Strategy:
 *   1. Pre-split text into paragraphs locally (always works offline).
 *   2. If LLM available: ask LLM to group paragraphs into titled chunks.
 *   3. Fallback: group paragraphs by ~150 words each.
 * =================================================================== */

import { callOpenRouter, MissingApiKeyError } from '@modules/llmClient';
import type { ReadingPlan, Chunk } from '@shared/types';

const CHUNK_PROMPT = `You are a reading assistant. Split the following article text into short, easy-to-read sections for someone with dyslexia. Each section should be 80-180 words.

Rules:
- Preserve the original order and wording exactly (do not rewrite).
- Give each chunk a short, clear title (3-8 words).
- Return ONLY valid JSON in this exact format, no other text:
{"chunks":[{"title":"...","text":"..."}]}

Article text:
`;

/**
 * Generate a reading plan for an article.
 * Uses LLM when API key available, falls back to local splitting.
 */
export async function generateReadingPlan(
    articleId: string,
    text: string,
    apiKey: string,
    model: string,
): Promise<ReadingPlan> {
    const paragraphs = splitParagraphs(text);

    // Try LLM chunking
    if (apiKey) {
        try {
            return await llmChunk(articleId, paragraphs, apiKey, model);
        } catch (err) {
            if (err instanceof MissingApiKeyError) {
                // fall through to local
            } else {
                console.warn('[chunker] LLM failed, falling back to local:', err);
            }
        }
    }

    // Local fallback
    return localChunk(articleId, paragraphs);
}

// ─── LLM chunking ──────────────────────────────────────────────────

async function llmChunk(
    articleId: string,
    paragraphs: string[],
    apiKey: string,
    model: string,
): Promise<ReadingPlan> {
    // If article is very long, process in batches
    const MAX_CHARS = 6000;
    const batches = batchParagraphs(paragraphs, MAX_CHARS);
    const allChunks: Chunk[] = [];
    let order = 0;

    for (const batch of batches) {
        const batchText = batch.join('\n\n');
        const response = await callOpenRouter({
            apiKey,
            model,
            messages: [
                { role: 'system', content: 'You split texts into readable chunks. Reply with JSON only.' },
                { role: 'user', content: CHUNK_PROMPT + batchText },
            ],
            temperature: 0.2,
            max_tokens: 2048,
        });

        const parsed = parseChunkResponse(response);
        for (const c of parsed) {
            allChunks.push({ id: `${articleId}_c${order}`, title: c.title, text: c.text, order: order++ });
        }
    }

    if (allChunks.length === 0) {
        // LLM returned nothing useful — fall back
        return localChunk(articleId, paragraphs);
    }

    return { articleId, createdAt: Date.now(), chunks: allChunks };
}

function parseChunkResponse(raw: string): { title: string; text: string }[] {
    try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [];
        const data = JSON.parse(jsonMatch[0]);
        if (Array.isArray(data.chunks)) {
            return data.chunks.filter((c: any) => c.text && typeof c.text === 'string');
        }
        return [];
    } catch {
        return [];
    }
}

// ─── Local fallback chunking ────────────────────────────────────────

function localChunk(articleId: string, paragraphs: string[]): ReadingPlan {
    const TARGET_WORDS = 150;
    const chunks: Chunk[] = [];
    let currentText = '';
    let currentWords = 0;
    let order = 0;

    for (const para of paragraphs) {
        const words = para.split(/\s+/).length;
        currentText += (currentText ? '\n\n' : '') + para;
        currentWords += words;

        if (currentWords >= TARGET_WORDS) {
            chunks.push({
                id: `${articleId}_c${order}`,
                title: `Section ${order + 1}`,
                text: currentText.trim(),
                order: order++,
            });
            currentText = '';
            currentWords = 0;
        }
    }

    // Remaining text
    if (currentText.trim()) {
        chunks.push({
            id: `${articleId}_c${order}`,
            title: `Section ${order + 1}`,
            text: currentText.trim(),
            order: order,
        });
    }

    return { articleId, createdAt: Date.now(), chunks };
}

// ─── Helpers ────────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n|\n(?=[A-Z])/)
        .map(p => p.trim())
        .filter(p => p.length > 20);
}

function batchParagraphs(paragraphs: string[], maxChars: number): string[][] {
    const batches: string[][] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const p of paragraphs) {
        if (currentLen + p.length > maxChars && current.length > 0) {
            batches.push(current);
            current = [];
            currentLen = 0;
        }
        current.push(p);
        currentLen += p.length;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}
