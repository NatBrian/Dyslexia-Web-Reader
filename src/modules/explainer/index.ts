/* ===================================================================
 * explainer/ — One-click explain for selected text.
 *
 * LLM mode: 2-3 simple sentences + optional example.
 * Local fallback: generic message prompting user to add API key.
 * =================================================================== */

import { callOpenRouter, MissingApiKeyError } from '@modules/llmClient';
import type { Explanation } from '@shared/types';

const EXPLAIN_PROMPT = `You are a helpful reading tutor. Explain the following word or phrase in 2-3 very simple sentences that a 10-year-old could understand. If possible, give a short example.

Return ONLY valid JSON in this exact format:
{"explanation":"...","example":"..."}

Word/phrase to explain:
`;

/**
 * Explain a selected word or phrase.
 */
export async function explainText(
    text: string,
    apiKey: string,
    model: string,
): Promise<Explanation> {
    if (apiKey) {
        try {
            return await llmExplain(text, apiKey, model);
        } catch (err) {
            if (!(err instanceof MissingApiKeyError)) {
                console.warn('[explainer] LLM failed, using local fallback:', err);
            }
        }
    }
    return localExplain(text);
}

// ─── LLM explanation ────────────────────────────────────────────────

async function llmExplain(
    text: string,
    apiKey: string,
    model: string,
): Promise<Explanation> {
    const response = await callOpenRouter({
        apiKey,
        model,
        messages: [
            { role: 'system', content: 'You explain words simply. Reply with JSON only.' },
            { role: 'user', content: EXPLAIN_PROMPT + `"${text}"` },
        ],
        temperature: 0.3,
        max_tokens: 300,
    });

    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            return {
                text,
                explanation: data.explanation || response,
                example: data.example || undefined,
            };
        }
    } catch { /* fall through */ }

    return { text, explanation: response };
}

// ─── Local fallback ─────────────────────────────────────────────────

function localExplain(text: string): Explanation {
    return {
        text,
        explanation: `"${text}" — To get a detailed explanation, add your OpenRouter API key in Settings.`,
        example: undefined,
    };
}
