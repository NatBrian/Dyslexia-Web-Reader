/* ===================================================================
 * chunker/ — Split article text into guided reading chunks.
 *
 * Strategy:
 *   1. Pre-split text into paragraphs locally (robust multi-strategy).
 *   2. If LLM available: ask LLM to group paragraphs into titled chunks.
 *      - Retry once if JSON parse fails.
 *      - Validate chunk count (≥ 3, else fallback).
 *   3. Fallback: group paragraphs by ~120-180 words each.
 * =================================================================== */

import { callOpenRouter, MissingApiKeyError } from '@modules/llmClient';
import type { ReadingPlan, Chunk } from '@shared/types';

const CHUNK_PROMPT = `You are a reading assistant. Split the following article text into short, easy-to-read sections for someone with dyslexia. Each section should be 80-180 words.

Rules:
- Preserve the original order and wording exactly (do not rewrite).
- Give each chunk a short, clear title (3-8 words).
- You MUST create multiple chunks (aim for 8-15 chunks per article).
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
    console.log(`[chunker] Article "${articleId}": ${text.length} chars, ${paragraphs.length} paragraphs detected`);

    // Try LLM chunking
    if (apiKey) {
        try {
            const plan = await llmChunk(articleId, paragraphs, apiKey, model);
            console.log(`[chunker] LLM produced ${plan.chunks.length} chunks`);

            // Validate: if LLM returned too few chunks, fall back to local
            if (plan.chunks.length < 3 && paragraphs.length >= 3) {
                console.warn(`[chunker] LLM returned only ${plan.chunks.length} chunks for ${paragraphs.length} paragraphs — falling back to local`);
                return localChunk(articleId, paragraphs);
            }
            return plan;
        } catch (err) {
            if (err instanceof MissingApiKeyError) {
                // fall through to local
            } else {
                console.warn('[chunker] LLM failed, falling back to local:', err);
            }
        }
    }

    // Local fallback
    const plan = localChunk(articleId, paragraphs);
    console.log(`[chunker] Local fallback produced ${plan.chunks.length} chunks`);
    return plan;
}

// ─── LLM chunking ──────────────────────────────────────────────────

async function llmChunk(
    articleId: string,
    paragraphs: string[],
    apiKey: string,
    model: string,
): Promise<ReadingPlan> {
    // Split into batches to stay within token limits
    const MAX_CHARS = 5000;
    const batches = batchParagraphs(paragraphs, MAX_CHARS);
    const allChunks: Chunk[] = [];
    let order = 0;

    console.log(`[chunker] Processing ${batches.length} batch(es) via LLM`);

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const batchText = batch.join('\n\n');
        console.log(`[chunker] Batch ${bi + 1}/${batches.length}: ${batchText.length} chars, ${batch.length} paragraphs`);

        let parsed: { title: string; text: string }[] = [];

        // Attempt 1
        const prompt = CHUNK_PROMPT + batchText;
        console.log(`[chunker] Sending prompt (${prompt.length} chars): "${prompt.slice(0, 200)}..."`);

        const response = await callOpenRouter({
            apiKey,
            model,
            messages: [
                { role: 'system', content: 'You split texts into readable chunks. Reply with valid JSON only, no markdown fences.' },
                { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 4096,
        });

        console.log(`[chunker] Raw LLM response (${response.length} chars): "${response.slice(0, 300)}..."`);

        parsed = parseChunkResponse(response);
        console.log(`[chunker] Parsed ${parsed.length} chunks from attempt 1`);

        // Retry once if parsing failed
        if (parsed.length === 0) {
            console.warn('[chunker] JSON parse failed on attempt 1 — retrying with explicit JSON instruction');
            const retryResponse = await callOpenRouter({
                apiKey,
                model,
                messages: [
                    { role: 'system', content: 'You split texts into readable chunks. You MUST return ONLY valid JSON, no explanations, no markdown code fences.' },
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: response },
                    { role: 'user', content: 'That response was not valid JSON. Please return ONLY the JSON object with the chunks array. Format: {"chunks":[{"title":"...","text":"..."}]}' },
                ],
                temperature: 0.1,
                max_tokens: 4096,
            });

            console.log(`[chunker] Retry response (${retryResponse.length} chars): "${retryResponse.slice(0, 300)}..."`);
            parsed = parseChunkResponse(retryResponse);
            console.log(`[chunker] Parsed ${parsed.length} chunks from retry`);
        }

        for (const c of parsed) {
            allChunks.push({ id: `${articleId}_c${order}`, title: c.title, text: c.text, order: order++ });
        }
    }

    if (allChunks.length === 0) {
        console.warn('[chunker] LLM returned 0 chunks across all batches — falling back to local');
        return localChunk(articleId, paragraphs);
    }

    return { articleId, createdAt: Date.now(), chunks: allChunks };
}

function parseChunkResponse(raw: string): { title: string; text: string }[] {
    try {
        // Strip markdown code fences if present
        let cleaned = raw.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

        // Extract JSON object
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[chunker] No JSON object found in response');
            return [];
        }
        const data = JSON.parse(jsonMatch[0]);
        if (Array.isArray(data.chunks)) {
            const valid = data.chunks.filter((c: any) =>
                c.text && typeof c.text === 'string' && c.text.trim().length > 10
            );
            return valid;
        }
        console.warn('[chunker] JSON parsed but no chunks array found');
        return [];
    } catch (err) {
        console.warn('[chunker] JSON parse error:', err);
        return [];
    }
}

// ─── Local fallback chunking ────────────────────────────────────────

function localChunk(articleId: string, paragraphs: string[]): ReadingPlan {
    const TARGET_WORDS = 120;
    const MAX_WORDS = 200;
    const chunks: Chunk[] = [];
    let currentText = '';
    let currentWords = 0;
    let order = 0;

    for (const para of paragraphs) {
        const words = para.split(/\s+/).length;

        // If single paragraph is very long, split it by sentences
        if (words > MAX_WORDS) {
            // Flush current accumulator first
            if (currentText.trim()) {
                chunks.push({
                    id: `${articleId}_c${order}`,
                    title: `Section ${order + 1}`,
                    text: currentText.trim(),
                    order: order++,
                });
                currentText = '';
                currentWords = 0;
            }

            // Split long paragraph into sentence-based chunks
            const sentenceChunks = splitBySentences(para, TARGET_WORDS);
            for (const sc of sentenceChunks) {
                chunks.push({
                    id: `${articleId}_c${order}`,
                    title: `Section ${order + 1}`,
                    text: sc.trim(),
                    order: order++,
                });
            }
            continue;
        }

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

    // Safety: if still only 1 chunk, force sentence-level splitting
    if (chunks.length <= 1 && paragraphs.length > 0) {
        console.warn('[chunker] Local fallback produced ≤1 chunk — force-splitting by sentences');
        const allText = paragraphs.join('\n\n');
        const sentenceChunks = splitBySentences(allText, TARGET_WORDS);
        return {
            articleId,
            createdAt: Date.now(),
            chunks: sentenceChunks.map((text, i) => ({
                id: `${articleId}_c${i}`,
                title: `Section ${i + 1}`,
                text: text.trim(),
                order: i,
            })),
        };
    }

    return { articleId, createdAt: Date.now(), chunks };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Robustly split text into paragraphs. Uses multiple strategies:
 * 1. Double newline (standard)
 * 2. Single newline followed by uppercase (common in textContent)
 * 3. If those produce too few, split on single newlines
 * 4. If still just 1 block, split by sentences
 */
function splitParagraphs(text: string): string[] {
    // Strategy 1: double newline
    let paragraphs = text.split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 20);

    if (paragraphs.length >= 3) return paragraphs;

    // Strategy 2: single newline (textContent from DOM often uses single \n)
    paragraphs = text.split(/\n/)
        .map(p => p.trim())
        .filter(p => p.length > 30);

    if (paragraphs.length >= 3) return paragraphs;

    // Strategy 3: split by sentence boundaries (. followed by space and uppercase)
    paragraphs = text.split(/(?<=\.)\s+(?=[A-Z])/)
        .map(p => p.trim())
        .filter(p => p.length > 40);

    // Group into ~3-sentence blocks if we got too many tiny ones
    if (paragraphs.length > 30) {
        const grouped: string[] = [];
        for (let i = 0; i < paragraphs.length; i += 3) {
            grouped.push(paragraphs.slice(i, i + 3).join(' '));
        }
        return grouped.filter(p => p.length > 20);
    }

    if (paragraphs.length >= 3) return paragraphs;

    // Strategy 4: just return the whole text as one block (localChunk will sentence-split)
    return [text.trim()].filter(p => p.length > 20);
}

/**
 * Split text into chunks of ~targetWords by sentences.
 */
function splitBySentences(text: string, targetWords: number): string[] {
    // Split on sentence endings
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';
    let currentWords = 0;

    for (const sentence of sentences) {
        const words = sentence.split(/\s+/).length;
        current += (current ? ' ' : '') + sentence;
        currentWords += words;

        if (currentWords >= targetWords) {
            chunks.push(current.trim());
            current = '';
            currentWords = 0;
        }
    }

    if (current.trim()) {
        // Merge tiny remainder with last chunk
        if (chunks.length > 0 && currentWords < targetWords / 3) {
            chunks[chunks.length - 1] += ' ' + current.trim();
        } else {
            chunks.push(current.trim());
        }
    }

    return chunks.filter(c => c.length > 20);
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
