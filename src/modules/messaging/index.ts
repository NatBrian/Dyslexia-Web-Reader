/* ===================================================================
 * messaging/ — Typed wrappers for chrome.runtime messaging.
 * =================================================================== */

import type { ExtMessage, ExtResponse } from '@shared/types';

/**
 * Send a typed message to the background service worker.
 * Returns a typed response.
 */
export function sendMessage<T = unknown>(message: ExtMessage): Promise<ExtResponse<T>> {
    return chrome.runtime.sendMessage(message);
}

/**
 * Send a message to a specific tab's content script.
 */
export function sendTabMessage<T = unknown>(tabId: number, message: ExtMessage): Promise<ExtResponse<T>> {
    return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Register a message handler in the background service worker.
 * The handler should return a response or a Promise<response>.
 */
export function onMessage(
    handler: (
        message: ExtMessage,
        sender: chrome.runtime.MessageSender,
    ) => Promise<ExtResponse> | ExtResponse | void,
): void {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        const result = handler(msg as ExtMessage, sender);
        if (result instanceof Promise) {
            result.then(sendResponse).catch(err => {
                sendResponse({ ok: false, error: err?.message || String(err) });
            });
            return true; // keep channel open for async response
        }
        if (result !== undefined) {
            sendResponse(result);
        }
        return false;
    });
}
