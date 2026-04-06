import { describe, it, expect } from "vitest";
import { buildSearchIndex, fuzzySearch } from "../../plugins/settingsHub/search";
import type { SettingsSchema } from "../../plugins/settingsHub/schema";

// Helper to build minimal SettingsSchema objects for testing
function makeSchema(overrides: Partial<SettingsSchema> & Pick<SettingsSchema, "plugin" | "sections">): SettingsSchema {
    return {
        plugin: overrides.plugin,
        description: overrides.description ?? "test",
        icon: (() => null) as any,
        settings: overrides.settings ?? { def: {}, store: {} } as any,
        sections: overrides.sections,
    };
}

describe("settingsHub/search", () => {
    describe("buildSearchIndex", () => {
        it("creates entries from schema sections/groups/settings", () => {
            const schema = makeSchema({
                plugin: "TestPlugin",
                sections: [{
                    id: "general",
                    label: "General",
                    groups: [{
                        label: "Appearance",
                        settings: [
                            { key: "enabled", label: "Enable Feature", description: "Toggle the feature" },
                            { key: "color", label: "Color", description: "Pick a color" },
                        ],
                    }],
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries).toHaveLength(2);
            expect(entries[0].settingKey).toBe("enabled");
            expect(entries[0].label).toBe("Enable Feature");
            expect(entries[0].description).toBe("Toggle the feature");
            expect(entries[1].settingKey).toBe("color");
        });

        it("handles custom-rendered sections (section.render)", () => {
            const schema = makeSchema({
                plugin: "MyPlugin",
                sections: [{
                    id: "custom",
                    label: "Custom Section",
                    render: (() => null) as any,
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries).toHaveLength(1);
            expect(entries[0].settingKey).toBe("__section_custom");
            expect(entries[0].label).toBe("Custom Section");
            expect(entries[0].description).toBe("MyPlugin — Custom Section");
        });

        it("skips sections with no groups and no render", () => {
            const schema = makeSchema({
                plugin: "EmptyPlugin",
                sections: [{
                    id: "empty",
                    label: "Empty",
                    // no groups, no render
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries).toHaveLength(0);
        });

        it("generates correct anchorIds", () => {
            const schema = makeSchema({
                plugin: "PluginX",
                sections: [
                    {
                        id: "sec1",
                        label: "Section 1",
                        render: (() => null) as any,
                    },
                    {
                        id: "sec2",
                        label: "Section 2",
                        groups: [{
                            settings: [{ key: "myKey" }],
                        }],
                    },
                ],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries).toHaveLength(2);
            // Custom render section: anchor uses section id
            expect(entries[0].anchorId).toBe("settings-PluginX-sec1");
            // Setting entry: anchor uses setting key
            expect(entries[1].anchorId).toBe("settings-PluginX-myKey");
        });

        it("falls back to settings.def for label when setting.label is undefined", () => {
            const schema = makeSchema({
                plugin: "FallbackPlugin",
                settings: {
                    def: {
                        myKey: { description: "From def" },
                    },
                    store: {},
                } as any,
                sections: [{
                    id: "s",
                    label: "S",
                    groups: [{
                        settings: [{ key: "myKey" }], // no label
                    }],
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries[0].label).toBe("From def");
        });

        it("falls back to key name when no label and no def description", () => {
            const schema = makeSchema({
                plugin: "NoLabel",
                sections: [{
                    id: "s",
                    label: "S",
                    groups: [{
                        settings: [{ key: "orphanKey" }],
                    }],
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries[0].label).toBe("orphanKey");
        });

        it("includes tags from setting config", () => {
            const schema = makeSchema({
                plugin: "Tagged",
                sections: [{
                    id: "s",
                    label: "S",
                    groups: [{
                        settings: [{ key: "k", tags: ["foo", "bar"] }],
                    }],
                }],
            });

            const entries = buildSearchIndex([schema]);
            expect(entries[0].tags).toEqual(["foo", "bar"]);
        });
    });

    describe("fuzzySearch", () => {
        // Build a reusable index for search tests
        const schemas: SettingsSchema[] = [
            makeSchema({
                plugin: "ChannelTabs",
                sections: [{
                    id: "appearance",
                    label: "Appearance",
                    groups: [{
                        settings: [
                            { key: "showIcons", label: "Show Icons", description: "Display channel icons in tabs", tags: ["icon", "visual"] },
                            { key: "tabWidth", label: "Tab Width", description: "Maximum width of each tab", tags: ["size"] },
                            { key: "autoClose", label: "Auto Close", description: "Automatically close inactive tabs" },
                        ],
                    }],
                }],
            }),
            makeSchema({
                plugin: "SettingsHub",
                sections: [{
                    id: "search",
                    label: "Search",
                    groups: [{
                        settings: [
                            { key: "fuzzyThreshold", label: "Fuzzy Threshold", description: "Minimum score for search results" },
                        ],
                    }],
                }],
            }),
        ];

        const entries = buildSearchIndex(schemas);

        it("returns empty for empty query", () => {
            expect(fuzzySearch(entries, "")).toEqual([]);
        });

        it("returns empty for whitespace query", () => {
            expect(fuzzySearch(entries, "   ")).toEqual([]);
        });

        it("exact substring match scores highest", () => {
            const results = fuzzySearch(entries, "Show Icons");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].settingKey).toBe("showIcons");
        });

        it("matches near start score higher than matches later", () => {
            // "tab" matches "Tab Width" at position 0 (label) and also appears in "ChannelTabs" at a later position
            // Both showIcons and tabWidth are in ChannelTabs. "tab" substring in "tab width" starts at 0 => score 100
            // "tab" in "channeltabs" starts at index 7 => score 93
            const results = fuzzySearch(entries, "tab");
            expect(results.length).toBeGreaterThan(0);
            // tabWidth's label "tab width" has "tab" at index 0 => score 100
            expect(results[0].settingKey).toBe("tabWidth");
        });

        it("word prefix match works", () => {
            // "auto" is a word prefix in "auto close" and "automatically"
            const results = fuzzySearch(entries, "auto");
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.settingKey === "autoClose")).toBe(true);
        });

        it("subsequence match works", () => {
            // "shic" matches s-h-i-c in "show icons" as subsequence
            const results = fuzzySearch(entries, "shic");
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.settingKey === "showIcons")).toBe(true);
        });

        it("results are sorted by score descending", () => {
            // "tab" matches tabWidth (exact at start, high score) and other entries (lower scores)
            const results = fuzzySearch(entries, "tab");
            // First result should be tabWidth (best match)
            expect(results[0].settingKey).toBe("tabWidth");
        });

        it("matches across label, description, pluginName, and tags", () => {
            // "icon" appears in showIcons label, description, and tags
            const resultsByTag = fuzzySearch(entries, "visual"); // tag
            expect(resultsByTag.some(r => r.settingKey === "showIcons")).toBe(true);

            const resultsByPlugin = fuzzySearch(entries, "ChannelTabs"); // pluginName
            expect(resultsByPlugin.length).toBeGreaterThan(0);

            const resultsByDesc = fuzzySearch(entries, "inactive"); // description
            expect(resultsByDesc.some(r => r.settingKey === "autoClose")).toBe(true);
        });

        it("is case-insensitive", () => {
            const upper = fuzzySearch(entries, "SHOW ICONS");
            const lower = fuzzySearch(entries, "show icons");
            const mixed = fuzzySearch(entries, "Show Icons");

            expect(upper).toHaveLength(lower.length);
            expect(upper[0].settingKey).toBe(lower[0].settingKey);
            expect(upper[0].settingKey).toBe(mixed[0].settingKey);
        });
    });
});
