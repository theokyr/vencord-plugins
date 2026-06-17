import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginsRoot = join(repoRoot, "plugins");
const pluginsIndex = JSON.parse(readFileSync(join(repoRoot, "plugins.json"), "utf8")) as {
    plugins: Record<string, { optionalDependencies?: string[]; }>;
};

function read(path: string): string {
    return readFileSync(path, "utf8");
}

function pluginDirs(): string[] {
    return readdirSync(pluginsRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith("_"));
}

function pluginFiles(plugin: string): string[] {
    return readdirSync(join(pluginsRoot, plugin), { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
        .map(entry => join(pluginsRoot, plugin, entry.name));
}

function indexPath(plugin: string): string {
    const tsx = join(pluginsRoot, plugin, "index.tsx");
    return existsSync(tsx) ? tsx : join(pluginsRoot, plugin, "index.ts");
}

function schemaPath(plugin: string): string {
    return join(pluginsRoot, plugin, "settingsSchema.tsx");
}

function hasDefinedSettings(plugin: string): boolean {
    return pluginFiles(plugin).some(file => /definePluginSettings\s*\(/.test(read(file)));
}

function definePluginName(plugin: string): string {
    const match = read(indexPath(plugin)).match(/definePlugin\s*\(\s*\{\s*name:\s*"([^"]+)"/s);
    if (!match) throw new Error(`Could not find definePlugin name for ${plugin}`);
    return match[1];
}

function findSettingsObject(source: string): string {
    const callMatch = /definePluginSettings\s*\(/.exec(source);
    const callStart = callMatch?.index ?? -1;
    if (callStart < 0) return "";

    const objectStart = source.indexOf("{", callStart);
    if (objectStart < 0) return "";

    let depth = 0;
    let quote: string | null = null;
    let escaped = false;

    for (let i = objectStart; i < source.length; i++) {
        const ch = source[i];

        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === "\"" || ch === "'" || ch === "`") {
            quote = ch;
            continue;
        }

        if (ch === "{") depth++;
        if (ch === "}") depth--;

        if (depth === 0) {
            return source.slice(objectStart, i + 1);
        }
    }

    throw new Error("Unterminated definePluginSettings object");
}

interface SettingDefInfo {
    key: string;
    hidden: boolean;
}

function settingDefs(plugin: string): SettingDefInfo[] {
    const defs: SettingDefInfo[] = [];

    for (const file of pluginFiles(plugin)) {
        const object = findSettingsObject(read(file));
        for (const match of object.matchAll(/^    ([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/gm)) {
            const start = match.index ?? 0;
            const next = object.slice(start + 1).search(/\n    [A-Za-z_][A-Za-z0-9_]*\s*:\s*\{/);
            const block = next >= 0 ? object.slice(start, start + 1 + next) : object.slice(start);
            defs.push({
                key: match[1],
                hidden: /\bhidden:\s*true\b/.test(block),
            });
        }
    }

    return defs;
}

function settingsKeys(plugin: string): Set<string> {
    return new Set(settingDefs(plugin).map(def => def.key));
}

function schemaKeys(plugin: string): Set<string> {
    const keys = new Set<string>();
    const source = read(schemaPath(plugin));
    for (const match of source.matchAll(/\bkey:\s*"([^"]+)"/g)) {
        keys.add(match[1]);
    }
    for (const match of source.matchAll(/\bsettingKey="([^"]+)"/g)) {
        keys.add(match[1]);
    }
    return keys;
}

function keybindBases(plugin: string): Set<string> {
    const bases = new Set<string>();
    for (const { key } of settingDefs(plugin)) {
        const match = key.match(/^keybind_(.+?)(?:_enabled)?$/);
        if (match) bases.add(match[1]);
    }
    return bases;
}

function registeredKeybindBases(plugin: string): Set<string> {
    const bases = new Set<string>();
    const registration = keybindRegistrationBlock(plugin);
    if (!registration) return bases;

    const keybinds = registration.match(/\bkeybinds:\s*\{([\s\S]*)/);
    if (!keybinds) return bases;

    for (const match of keybinds[1].matchAll(/^\s{16}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/gm)) {
        bases.add(match[1]);
    }

    return bases;
}

function keybindRegistrationBlock(plugin: string): string | null {
    return read(indexPath(plugin)).match(/__keybindRegistry\?\.register\s*\(\s*\{([\s\S]*?)\n\s*\}\s*\);/)?.[0] ?? null;
}

const settingsPlugins = pluginDirs().filter(hasDefinedSettings);

describe("settingsHub plugin integration", () => {
    it("gives every settings-bearing plugin a settingsHub schema and optional dependency", () => {
        for (const plugin of settingsPlugins) {
            expect(existsSync(schemaPath(plugin)), `${plugin} is missing settingsSchema.tsx`).toBe(true);
            expect(
                pluginsIndex.plugins[plugin]?.optionalDependencies ?? [],
                `${plugin} should list settingsHub as an optional dependency`,
            ).toContain("settingsHub");
        }
    });

    it("registers, unregisters, and exposes settingsHub from Vencord plugin settings", () => {
        for (const plugin of settingsPlugins) {
            const source = read(indexPath(plugin));
            const pluginName = definePluginName(plugin);

            expect(source, `${plugin} must register its settingsHub schema`).toContain("__settingsHub?.register");
            expect(source, `${plugin} must unregister its settingsHub schema`).toContain("__settingsHub?.unregister");
            expect(source, `${plugin} should expose an Open Full Settings bridge`).toContain("settingsAboutComponent");
            expect(source, `${plugin} should open settingsHub with its definePlugin name`).toContain(`__settingsHub?.open("${pluginName}")`);
            expect(source, `${plugin} should unregister by its definePlugin name`).toContain(`__settingsHub?.unregister("${pluginName}")`);
            expect(read(schemaPath(plugin)), `${plugin} schema plugin name should match definePlugin name`).toContain(`plugin: "${pluginName}"`);
        }
    });

    it("only registers setting keys that exist in definePluginSettings", () => {
        for (const plugin of settingsPlugins) {
            const knownKeys = settingsKeys(plugin);
            const invalidKeys = [...schemaKeys(plugin)].filter(key => !knownKeys.has(key));

            expect(invalidKeys, `${plugin} schema references missing settings`).toEqual([]);
        }
    });

    it("exposes every visible non-keybind setting in settingsHub", () => {
        for (const plugin of settingsPlugins) {
            const visibleKeys = settingDefs(plugin)
                .filter(def => !def.hidden)
                .map(def => def.key)
                .filter(key => !key.startsWith("keybind_"));
            const exposedKeys = schemaKeys(plugin);
            const missingKeys = visibleKeys.filter(key => !exposedKeys.has(key));

            expect(missingKeys, `${plugin} has visible settings missing from settingsHub`).toEqual([]);
        }
    });

    it("routes every keybind setting through the central keybind registry with settings backing", () => {
        for (const plugin of settingsPlugins) {
            const bases = keybindBases(plugin);
            if (bases.size === 0) continue;

            const settingKeys = settingsKeys(plugin);
            const registeredBases = registeredKeybindBases(plugin);
            const registration = keybindRegistrationBlock(plugin);

            expect([...registeredBases].sort(), `${plugin} keybind registry declarations`).toEqual([...bases].sort());
            for (const base of bases) {
                expect(settingKeys, `${plugin} missing keybind_${base}`).toContain(`keybind_${base}`);
                expect(settingKeys, `${plugin} missing keybind_${base}_enabled`).toContain(`keybind_${base}_enabled`);
            }
            expect(registration, `${plugin} keybind registration must pass the plugin settings object`).toContain("\n            settings,");
        }
    });
});

describe("settingsHub control support", () => {
    it("supports Vencord component settings", () => {
        expect(read(join(pluginsRoot, "settingsHub", "schema.ts"))).toContain("\"component\"");
        const settingsGroupSource = read(join(pluginsRoot, "settingsHub", "components", "SettingsGroup.tsx"));
        expect(settingsGroupSource).toContain("case \"component\"");
        expect(settingsGroupSource).toContain("OptionType.COMPONENT");
    });
});
