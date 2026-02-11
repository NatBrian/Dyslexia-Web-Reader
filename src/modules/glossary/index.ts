/* ===================================================================
 * glossary/ — Per-article glossary storage.
 * Thin convenience layer over storage module.
 * =================================================================== */

import { addGlossaryEntry, getGlossary } from '@modules/storage';
import type { GlossaryEntry } from '@shared/types';

export { getGlossary } from '@modules/storage';

/**
 * Add a glossary entry for an article; deduplicates by term.
 */
export async function saveGlossaryEntry(
    articleId: string,
    entry: GlossaryEntry,
): Promise<GlossaryEntry[]> {
    return addGlossaryEntry(articleId, entry);
}

/**
 * Merge multiple glossary entries (e.g. from a simplification response).
 */
export async function mergeGlossaryEntries(
    articleId: string,
    entries: GlossaryEntry[],
): Promise<GlossaryEntry[]> {
    let latest: GlossaryEntry[] = [];
    for (const entry of entries) {
        latest = await addGlossaryEntry(articleId, entry);
    }
    return latest;
}
