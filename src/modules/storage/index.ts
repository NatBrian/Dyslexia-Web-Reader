/* ===================================================================
 * storage/ — Unified wrapper for chrome.storage.
 *
 * sync  → user settings + API key (small, synced across devices)
 * local → cached articles, reading plans, simplified chunks, glossary
 * =================================================================== */

import type {
    Article, ReaderSettings, ReadingPlan, SimplifiedChunk,
    GlossaryEntry,
} from '@shared/types';

// ─── Settings (sync) ────────────────────────────────────────────────

export async function getSettings(): Promise<ReaderSettings> {
    const { readerSettings } = await chrome.storage.sync.get('readerSettings');
    return { ...(await getDefaults()), ...(readerSettings || {}) };
}

export async function saveSettings(partial: Partial<ReaderSettings>): Promise<void> {
    const current = await getSettings();
    await chrome.storage.sync.set({ readerSettings: { ...current, ...partial } });
}

async function getDefaults(): Promise<ReaderSettings> {
    // Import at runtime to avoid circular — inline copy of DEFAULT_SETTINGS
    return {
        fontSize: 18,
        lineSpacing: 1.8,
        letterSpacing: 0.05,
        wordSpacing: 0.1,
        marginWidth: 120,
        theme: 'cream',
        openDyslexic: false,
        highlightFocus: false,
        rulerMode: 'off',
        ttsEngine: 'web',
        ttsRate: 1.0,
    };
}

// ─── OpenRouter config (sync) ───────────────────────────────────────

export async function getApiConfig(): Promise<{ apiKey: string; model: string }> {
    const result = await chrome.storage.sync.get(['openRouterApiKey', 'openRouterModel']);
    return {
        apiKey: (result.openRouterApiKey as string) || '',
        model: (result.openRouterModel as string) || 'openrouter/auto',
    };
}

export async function saveApiConfig(apiKey: string, model: string): Promise<void> {
    await chrome.storage.sync.set({ openRouterApiKey: apiKey, openRouterModel: model });
}

// ─── Article cache (local) ──────────────────────────────────────────

export async function getCachedArticle(articleId: string): Promise<Article | null> {
    const key = `article_${articleId}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as Article) || null;
}

export async function setCachedArticle(article: Article): Promise<void> {
    await chrome.storage.local.set({ [`article_${article.id}`]: article });
}

// ─── Reading plan cache (local) ─────────────────────────────────────

export async function getCachedPlan(articleId: string): Promise<ReadingPlan | null> {
    const key = `plan_${articleId}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as ReadingPlan) || null;
}

export async function setCachedPlan(plan: ReadingPlan): Promise<void> {
    await chrome.storage.local.set({ [`plan_${plan.articleId}`]: plan });
}

// ─── Simplified chunk cache (local) ─────────────────────────────────

export async function getCachedSimplified(chunkId: string): Promise<SimplifiedChunk | null> {
    const key = `simplified_${chunkId}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as SimplifiedChunk) || null;
}

export async function setCachedSimplified(chunk: SimplifiedChunk): Promise<void> {
    await chrome.storage.local.set({ [`simplified_${chunk.chunkId}`]: chunk });
}

// ─── Glossary (local) ───────────────────────────────────────────────

export async function getGlossary(articleId: string): Promise<GlossaryEntry[]> {
    const key = `glossary_${articleId}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as GlossaryEntry[]) || [];
}

export async function addGlossaryEntry(articleId: string, entry: GlossaryEntry): Promise<GlossaryEntry[]> {
    const entries = await getGlossary(articleId);
    // Avoid duplicates by term
    if (!entries.some(e => e.term.toLowerCase() === entry.term.toLowerCase())) {
        entries.push(entry);
        await chrome.storage.local.set({ [`glossary_${articleId}`]: entries });
    }
    return entries;
}

// ─── Clear all cache ────────────────────────────────────────────────

export async function clearAllCache(): Promise<void> {
    await chrome.storage.local.clear();
}
