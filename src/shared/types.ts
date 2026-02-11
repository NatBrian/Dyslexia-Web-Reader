/* ===================================================================
 * Shared types — the stable data contract for all modules.
 * Every module imports from here; never define ad-hoc message shapes.
 * =================================================================== */

// ─── Article ────────────────────────────────────────────────────────
export interface Article {
    id: string;            // deterministic hash from URL
    url: string;
    title: string;
    byline?: string;
    contentHtml: string;   // sanitised HTML
    text: string;          // plain-text for LLM
    extractedAt: number;   // Date.now()
}

// ─── Reader Settings ────────────────────────────────────────────────
export interface ReaderSettings {
    fontSize: number;           // px, default 18
    lineSpacing: number;        // unitless multiplier, default 1.8
    letterSpacing: number;      // em, default 0.05
    wordSpacing: number;        // em, default 0.1
    marginWidth: number;        // px each side, default 120
    theme: 'cream' | 'gray' | 'dark';
    openDyslexic: boolean;
    highlightFocus: boolean;
    rulerMode: 'off' | 'line' | 'paragraph';
    ttsEngine: 'web' | 'elevenlabs';
    ttsRate: number;            // 0.5–2.0, default 1.0
    elevenLabsApiKey?: string;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
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

// ─── Reading Plan & Chunks ──────────────────────────────────────────
export interface Chunk {
    id: string;
    title?: string;
    text: string;
    order: number;
}

export interface ReadingPlan {
    articleId: string;
    createdAt: number;
    chunks: Chunk[];
}

export interface SimplifiedChunk {
    chunkId: string;
    simplifiedText: string;
    bullets?: string[];
    glossary?: GlossaryEntry[];
}

export interface GlossaryEntry {
    term: string;
    definition: string;
    example?: string;
}

// ─── Explainer ──────────────────────────────────────────────────────
export interface Explanation {
    text: string;
    explanation: string;
    example?: string;
}

// ─── LLM Config ─────────────────────────────────────────────────────
export interface LlmConfig {
    apiKey: string;
    model: string;
}

export const DEFAULT_MODEL = 'openrouter/auto';

// ─── Messages (discriminated union) ─────────────────────────────────
export type MessageType =
    | 'EXTRACT_ARTICLE'
    | 'GET_ARTICLE'
    | 'GET_SETTINGS'
    | 'SAVE_SETTINGS'
    | 'GENERATE_READING_PLAN'
    | 'GET_READING_PLAN'
    | 'SIMPLIFY_CHUNK'
    | 'EXPLAIN_SELECTION'
    | 'SAVE_GLOSSARY_ENTRY'
    | 'GET_GLOSSARY'
    | 'TEST_API'
    | 'CLEAR_CACHE';

export interface ExtractArticleMsg { type: 'EXTRACT_ARTICLE' }
export interface GetArticleMsg { type: 'GET_ARTICLE'; articleId: string }
export interface GetSettingsMsg { type: 'GET_SETTINGS' }
export interface SaveSettingsMsg { type: 'SAVE_SETTINGS'; settings: Partial<ReaderSettings> & { openRouterApiKey?: string; openRouterModel?: string } }
export interface GenerateReadingPlanMsg { type: 'GENERATE_READING_PLAN'; articleId: string; forceRegenerate?: boolean }
export interface GetReadingPlanMsg { type: 'GET_READING_PLAN'; articleId: string }
export interface SimplifyChunkMsg { type: 'SIMPLIFY_CHUNK'; chunkId: string; chunkText: string; articleId: string }
export interface ExplainSelectionMsg { type: 'EXPLAIN_SELECTION'; text: string }
export interface SaveGlossaryEntryMsg { type: 'SAVE_GLOSSARY_ENTRY'; articleId: string; entry: GlossaryEntry }
export interface GetGlossaryMsg { type: 'GET_GLOSSARY'; articleId: string }
export interface TestApiMsg { type: 'TEST_API' }
export interface ClearCacheMsg { type: 'CLEAR_CACHE' }

export type ExtMessage =
    | ExtractArticleMsg
    | GetArticleMsg
    | GetSettingsMsg
    | SaveSettingsMsg
    | GenerateReadingPlanMsg
    | GetReadingPlanMsg
    | SimplifyChunkMsg
    | ExplainSelectionMsg
    | SaveGlossaryEntryMsg
    | GetGlossaryMsg
    | TestApiMsg
    | ClearCacheMsg;

// ─── Generic response wrapper ───────────────────────────────────────
export interface ExtResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
}
