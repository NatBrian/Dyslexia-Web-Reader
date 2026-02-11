/* ===================================================================
 * simplifier/ — Rewrite a chunk into dyslexia-friendly text.
 *
 * LLM mode: short sentences, bullets, define hard words.
 * Local fallback: basic sentence splitting + bullet-ification.
 * =================================================================== */

import { callOpenRouter, MissingApiKeyError } from '@modules/llmClient';
import type { SimplifiedChunk, GlossaryEntry } from '@shared/types';

const SIMPLIFY_PROMPT = `You are a reading assistant for people with dyslexia. Rewrite the following text to be much easier to read.

Rules:
- Use short, simple sentences (max 12 words each).
- Break complex ideas into bullet points.
- Define any hard or uncommon words in a glossary section.
- Keep the same meaning — do not add new information.
- Return ONLY valid JSON in this exact format, no other text:
{"simplifiedText":"...","bullets":["...","..."],"glossary":[{"term":"...","definition":"..."}]}

Text to simplify:
`;

/**
 * Simplify a reading chunk.
 */
export async function simplifyChunk(
    chunkId: string,
    chunkText: string,
    apiKey: string,
    model: string,
): Promise<SimplifiedChunk> {
    if (apiKey) {
        try {
            return await llmSimplify(chunkId, chunkText, apiKey, model);
        } catch (err) {
            if (!(err instanceof MissingApiKeyError)) {
                console.warn('[simplifier] LLM failed, falling back to local:', err);
            }
        }
    }
    return localSimplify(chunkId, chunkText);
}

// ─── LLM simplification ────────────────────────────────────────────

async function llmSimplify(
    chunkId: string,
    text: string,
    apiKey: string,
    model: string,
): Promise<SimplifiedChunk> {
    const response = await callOpenRouter({
        apiKey,
        model,
        messages: [
            { role: 'system', content: 'You simplify text for dyslexia-friendly reading. Reply with JSON only.' },
            { role: 'user', content: SIMPLIFY_PROMPT + text },
        ],
        temperature: 0.3,
        max_tokens: 1500,
    });

    const parsed = parseSimplifyResponse(response);
    return {
        chunkId,
        simplifiedText: parsed.simplifiedText || text,
        bullets: parsed.bullets,
        glossary: parsed.glossary,
    };
}

function parseSimplifyResponse(raw: string): {
    simplifiedText: string;
    bullets?: string[];
    glossary?: GlossaryEntry[];
} {
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { simplifiedText: raw };
        const data = JSON.parse(jsonMatch[0]);
        return {
            simplifiedText: data.simplifiedText || raw,
            bullets: Array.isArray(data.bullets) ? data.bullets : undefined,
            glossary: Array.isArray(data.glossary) ? data.glossary : undefined,
        };
    } catch {
        return { simplifiedText: raw };
    }
}

// ─── Local fallback ─────────────────────────────────────────────────

function localSimplify(chunkId: string, text: string): SimplifiedChunk {
    // Split into sentences
    const sentences = text
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Break long sentences at commas
    const shortened: string[] = [];
    for (const sentence of sentences) {
        if (sentence.length > 80) {
            const parts = sentence.split(/,\s*/);
            shortened.push(...parts.map(p => p.trim()).filter(p => p.length > 0));
        } else {
            shortened.push(sentence);
        }
    }

    return {
        chunkId,
        simplifiedText: shortened.join(' '),
        bullets: shortened.slice(0, 8), // top 8 as bullets
        glossary: [],
    };
}
