// plugins/settingsHub/search.ts

/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SettingsSchema } from "./schema";

export interface SearchEntry {
    pluginName: string;
    sectionId: string;
    settingKey: string;
    label: string;
    description: string;
    tags: string[];
    /** DOM element ID to scroll to */
    anchorId: string;
}

/**
 * Build a flat search index from all registered schemas.
 * Each setting becomes one entry. Section-level items (custom renders)
 * get a single entry for the whole section.
 */
export function buildSearchIndex(schemas: readonly SettingsSchema[]): SearchEntry[] {
    const entries: SearchEntry[] = [];

    for (const schema of schemas) {
        for (const section of schema.sections) {
            if (section.render) {
                // Custom-rendered section — one entry for the whole section
                entries.push({
                    pluginName: schema.plugin,
                    sectionId: section.id,
                    settingKey: `__section_${section.id}`,
                    label: section.label,
                    description: `${schema.plugin} — ${section.label}`,
                    tags: [],
                    anchorId: `settings-${schema.plugin}-${section.id}`,
                });
                continue;
            }

            if (!section.groups) continue;

            for (const group of section.groups) {
                for (const setting of group.settings) {
                    const optDef = (schema.settings?.def as any)?.[setting.key];
                    entries.push({
                        pluginName: schema.plugin,
                        sectionId: section.id,
                        settingKey: setting.key,
                        label: setting.label ?? (optDef as any)?.description ?? setting.key,
                        description: setting.description ?? "",
                        tags: setting.tags ?? [],
                        anchorId: `settings-${schema.plugin}-${setting.key}`,
                    });
                }
            }
        }
    }

    return entries;
}

/**
 * Fuzzy search. Scoring: exact substring > word prefix > subsequence.
 * Returns entries sorted by score (highest first), filtered to score > 0.
 */
export function fuzzySearch(entries: SearchEntry[], query: string): SearchEntry[] {
    if (!query.trim()) return [];

    const q = query.toLowerCase().trim();
    const scored: { entry: SearchEntry; score: number; }[] = [];

    for (const entry of entries) {
        const fields = [
            entry.label,
            entry.description,
            entry.pluginName,
            ...entry.tags,
        ].map(s => s.toLowerCase());

        let bestScore = 0;

        for (const field of fields) {
            // Exact substring match (best)
            if (field.includes(q)) {
                const s = 100 - field.indexOf(q); // prefer matches near start
                bestScore = Math.max(bestScore, s);
                continue;
            }

            // Word prefix match
            const words = field.split(/[\s\-_]+/);
            for (const word of words) {
                if (word.startsWith(q)) {
                    bestScore = Math.max(bestScore, 50);
                }
            }

            // Subsequence match
            if (bestScore < 50) {
                let qi = 0;
                for (let fi = 0; fi < field.length && qi < q.length; fi++) {
                    if (field[fi] === q[qi]) qi++;
                }
                if (qi === q.length) {
                    bestScore = Math.max(bestScore, 10);
                }
            }
        }

        if (bestScore > 0) {
            scored.push({ entry, score: bestScore });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.entry);
}
