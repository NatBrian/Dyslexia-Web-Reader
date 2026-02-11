/* ===================================================================
 * llmClient/ — Thin OpenRouter REST wrapper.
 * All LLM calls go through this single function.
 * =================================================================== */

export interface OpenRouterRequest {
    apiKey: string;
    model: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    max_tokens?: number;
}

export class MissingApiKeyError extends Error {
    constructor() { super('OpenRouter API key is not set. Go to extension Settings to add it.'); }
}

/**
 * Call the OpenRouter chat completions API.
 * Returns the raw text content of the first choice.
 */
export async function callOpenRouter(req: OpenRouterRequest): Promise<string> {
    if (!req.apiKey) throw new MissingApiKeyError();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${req.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'chrome-extension://dyslexia-reading-assistant',
            'X-Title': 'Dyslexia Reading Assistant',
        },
        body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            temperature: req.temperature ?? 0.3,
            max_tokens: req.max_tokens ?? 2048,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${body}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error('Unexpected OpenRouter response format');
    }
    return content;
}

/**
 * Quick test call to verify the API key works.
 */
export async function testApiKey(apiKey: string, model: string): Promise<boolean> {
    const result = await callOpenRouter({
        apiKey,
        model,
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        max_tokens: 10,
    });
    return result.trim().toLowerCase().includes('ok');
}
