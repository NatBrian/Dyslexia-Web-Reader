/* ===================================================================
 * Background Service Worker — orchestrator for the extension.
 *
 * Handles all messaging between popup, content script, and reader page.
 * Makes LLM calls so the API key stays in the service worker scope.
 * =================================================================== */

import { onMessage } from '@modules/messaging';
import * as storage from '@modules/storage';
import { generateReadingPlan } from '@modules/chunker';
import { simplifyChunk } from '@modules/simplifier';
import { explainText } from '@modules/explainer';
import { saveGlossaryEntry } from '@modules/glossary';
import { getGlossary } from '@modules/storage';
import { testApiKey } from '@modules/llmClient';
import type { Article, ExtMessage, ExtResponse } from '@shared/types';

// ─── In-memory article cache (fast access, survives tab switches) ──
const articleCache = new Map<string, Article>();

// ─── Message handler ────────────────────────────────────────────────
onMessage(async (message: ExtMessage, sender): Promise<ExtResponse> => {
    switch (message.type) {

        // ── Extract article from active tab ───────────────────────────
        case 'EXTRACT_ARTICLE': {
            try {
                // Get the active tab
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) return { ok: false, error: 'No active tab found' };

                // Inject content script on-demand
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content/index.js'],
                });

                // Retry with delay — the content script listener may not be registered yet
                let response: any = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise(r => setTimeout(r, 150));
                    try {
                        response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' });
                        break;
                    } catch {
                        if (attempt === 2) {
                            return { ok: false, error: 'Content script did not respond. Try reloading the page.' };
                        }
                    }
                }

                if (!response?.ok || !response.data) {
                    return { ok: false, error: response?.error || 'Failed to extract article' };
                }

                const article = response.data as Article;
                articleCache.set(article.id, article);
                await storage.setCachedArticle(article);

                // Open reader page
                const readerUrl = chrome.runtime.getURL(`reader/reader.html?articleId=${article.id}`);
                await chrome.tabs.create({ url: readerUrl });

                return { ok: true, data: { articleId: article.id } };
            } catch (err: any) {
                return { ok: false, error: err?.message || 'Extraction failed' };
            }
        }

        // ── Get cached article ────────────────────────────────────────
        case 'GET_ARTICLE': {
            const articleId = message.articleId;
            let article = articleCache.get(articleId) || null;
            if (!article) {
                article = await storage.getCachedArticle(articleId);
                if (article) articleCache.set(articleId, article);
            }
            return article
                ? { ok: true, data: article }
                : { ok: false, error: 'Article not found in cache' };
        }

        // ── Settings ──────────────────────────────────────────────────
        case 'GET_SETTINGS': {
            const settings = await storage.getSettings();
            const apiConfig = await storage.getApiConfig();
            return { ok: true, data: { ...settings, ...apiConfig } };
        }

        case 'SAVE_SETTINGS': {
            const { openRouterApiKey, openRouterModel, ...readerSettings } = message.settings;
            if (Object.keys(readerSettings).length > 0) {
                await storage.saveSettings(readerSettings);
            }
            if (openRouterApiKey !== undefined || openRouterModel !== undefined) {
                const current = await storage.getApiConfig();
                await storage.saveApiConfig(
                    openRouterApiKey ?? current.apiKey,
                    openRouterModel ?? current.model,
                );
            }
            return { ok: true };
        }

        // ── Reading plan ──────────────────────────────────────────────
        case 'GENERATE_READING_PLAN': {
            try {
                // Check cache first
                const cached = await storage.getCachedPlan(message.articleId);
                if (cached) return { ok: true, data: cached };

                const article = articleCache.get(message.articleId)
                    || await storage.getCachedArticle(message.articleId);
                if (!article) return { ok: false, error: 'Article not found' };

                const { apiKey, model } = await storage.getApiConfig();
                const plan = await generateReadingPlan(article.id, article.text, apiKey, model);
                await storage.setCachedPlan(plan);

                return { ok: true, data: plan };
            } catch (err: any) {
                return { ok: false, error: err?.message || 'Failed to generate reading plan' };
            }
        }

        case 'GET_READING_PLAN': {
            const plan = await storage.getCachedPlan(message.articleId);
            return plan
                ? { ok: true, data: plan }
                : { ok: false, error: 'No reading plan cached' };
        }

        // ── Simplify chunk ────────────────────────────────────────────
        case 'SIMPLIFY_CHUNK': {
            try {
                // Check cache first
                const cached = await storage.getCachedSimplified(message.chunkId);
                if (cached) return { ok: true, data: cached };

                const { apiKey, model } = await storage.getApiConfig();
                const simplified = await simplifyChunk(message.chunkId, message.chunkText, apiKey, model);
                await storage.setCachedSimplified(simplified);

                // Auto-save glossary entries
                if (simplified.glossary?.length) {
                    for (const entry of simplified.glossary) {
                        await saveGlossaryEntry(message.articleId, entry);
                    }
                }

                return { ok: true, data: simplified };
            } catch (err: any) {
                return { ok: false, error: err?.message || 'Simplification failed' };
            }
        }

        // ── Explain selection ─────────────────────────────────────────
        case 'EXPLAIN_SELECTION': {
            try {
                const { apiKey, model } = await storage.getApiConfig();
                const explanation = await explainText(message.text, apiKey, model);
                return { ok: true, data: explanation };
            } catch (err: any) {
                return { ok: false, error: err?.message || 'Explanation failed' };
            }
        }

        // ── Glossary ──────────────────────────────────────────────────
        case 'SAVE_GLOSSARY_ENTRY': {
            const entries = await saveGlossaryEntry(message.articleId, message.entry);
            return { ok: true, data: entries };
        }

        case 'GET_GLOSSARY': {
            const entries = await getGlossary(message.articleId);
            return { ok: true, data: entries };
        }

        // ── Test API ──────────────────────────────────────────────────
        case 'TEST_API': {
            try {
                const { apiKey, model } = await storage.getApiConfig();
                if (!apiKey) return { ok: false, error: 'No API key configured' };
                const success = await testApiKey(apiKey, model);
                return { ok: success, error: success ? undefined : 'API test failed' };
            } catch (err: any) {
                return { ok: false, error: err?.message || 'API test failed' };
            }
        }

        // ── Clear cache ───────────────────────────────────────────────
        case 'CLEAR_CACHE': {
            await storage.clearAllCache();
            articleCache.clear();
            return { ok: true };
        }

        default:
            return { ok: false, error: `Unknown message type: ${(message as any).type}` };
    }
});

console.log('[DRA] Background service worker started');
