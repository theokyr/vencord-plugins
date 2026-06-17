/*
 * Vencord userplugin — _libKeybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type {
    RegisteredKeybind, RegistrationOptions, ConflictResolution,
    KeybindDeclaration, LayerHandler, ChordHandler,
} from "./types";
import type { DefinedSettings } from "@api/Settings";

const keybinds: RegisteredKeybind[] = [];
const entrySettings = new Map<string, {
    settings: DefinedSettings;
    keysKey: string;
    enabledKey: string;
    cleanups: (() => void)[];
}>();
const RESOLUTIONS_STORAGE_KEY = "vc-keybindRegistry-resolutions";
let resolutions: ConflictResolution[];
try { resolutions = loadResolutions(); } catch { resolutions = []; }
const listeners = new Set<() => void>();
const settingChangeHandlers = new WeakMap<object, Set<(value: any) => void>>();

function loadResolutions(): ConflictResolution[] {
    try {
        const raw = localStorage.getItem(RESOLUTIONS_STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ConflictResolution[];
    } catch { /* ignore */ }
    return [];
}

function saveResolutions(): void {
    try {
        localStorage.setItem(RESOLUTIONS_STORAGE_KEY, JSON.stringify(resolutions));
    } catch { /* ignore */ }
}

function notify(): void {
    listeners.forEach(fn => fn());
}

function readStoredKeys(settings: DefinedSettings | undefined, key: string, fallback: string): string {
    const value = settings?.store?.[key];
    return typeof value === "string" ? value : fallback;
}

function readStoredEnabled(settings: DefinedSettings | undefined, key: string, fallback: boolean): boolean {
    const value = settings?.store?.[key];
    return typeof value === "boolean" ? value : fallback;
}

function addSettingChangeHandler(settings: DefinedSettings, key: string, handler: (value: any) => void): () => void {
    const opt = (settings.def as Record<string, any> | undefined)?.[key];
    if (!opt || typeof opt !== "object") return () => {};

    let handlers = settingChangeHandlers.get(opt);
    if (!handlers) {
        handlers = new Set();
        settingChangeHandlers.set(opt, handlers);
        const original = opt.onChange;
        opt.onChange = (value: any) => {
            original?.(value);
            settingChangeHandlers.get(opt)?.forEach(fn => fn(value));
        };
    }

    handlers.add(handler);
    return () => { handlers?.delete(handler); };
}

function cleanupEntrySettings(plugin: string): void {
    for (const [id, meta] of [...entrySettings.entries()]) {
        if (!id.startsWith(`${plugin}.`)) continue;
        meta.cleanups.forEach(cleanup => cleanup());
        entrySettings.delete(id);
    }
}

export function register(opts: RegistrationOptions): void {
    // Remove existing entries for this plugin (re-register)
    unregister(opts.plugin, true);

    for (const [suffix, decl] of Object.entries(opts.keybinds)) {
        const id = `${opts.plugin}.${suffix}`;
        const keysKey = `keybind_${suffix}`;
        const enabledKey = `keybind_${suffix}_enabled`;
        const defaultEnabled = decl.defaultEnabled !== false;
        const handler = typeof decl.handler === "function"
            ? decl.handler as (e: KeyboardEvent) => void
            : () => {};

        const entry: RegisteredKeybind = {
            id,
            plugin: opts.plugin,
            action: decl.action,
            keys: readStoredKeys(opts.settings, keysKey, decl.defaultKeys),
            defaultKeys: decl.defaultKeys,
            enabled: readStoredEnabled(opts.settings, enabledKey, defaultEnabled),
            defaultEnabled,
            handler,
            textInputBehavior: decl.textInputBehavior ?? "block",
        };

        // Attach layer/chord metadata for dispatcher to read
        (entry as any)._declaration = decl;

        keybinds.push(entry);

        if (opts.settings) {
            entrySettings.set(id, {
                settings: opts.settings,
                keysKey,
                enabledKey,
                cleanups: [
                    addSettingChangeHandler(opts.settings, keysKey, value => {
                        if (typeof value !== "string") return;
                        entry.keys = value;
                        notify();
                    }),
                    addSettingChangeHandler(opts.settings, enabledKey, value => {
                        if (typeof value !== "boolean") return;
                        entry.enabled = value;
                        notify();
                    }),
                ],
            });
        }
    }

    notify();
}

export function unregister(plugin: string, silent = false): void {
    cleanupEntrySettings(plugin);
    const before = keybinds.length;
    for (let i = keybinds.length - 1; i >= 0; i--) {
        if (keybinds[i].plugin === plugin) keybinds.splice(i, 1);
    }
    if (!silent && keybinds.length !== before) notify();
}

export function getAll(): readonly RegisteredKeybind[] {
    return keybinds;
}

/** Get declaration metadata for a keybind (layer/chord info). */
export function getDeclaration(id: string): KeybindDeclaration | undefined {
    const entry = keybinds.find(k => k.id === id);
    return entry ? (entry as any)._declaration : undefined;
}

/**
 * Find all key combos that are bound by more than one enabled keybind.
 * Returns a map of keyCombo -> array of conflicting entries.
 */
export function getConflicts(): Map<string, RegisteredKeybind[]> {
    const byKeys = new Map<string, RegisteredKeybind[]>();

    for (const kb of keybinds) {
        if (!kb.enabled) continue;
        const list = byKeys.get(kb.keys) ?? [];
        list.push(kb);
        byKeys.set(kb.keys, list);
    }

    const conflicts = new Map<string, RegisteredKeybind[]>();
    for (const [keys, entries] of byKeys) {
        if (entries.length > 1) conflicts.set(keys, entries);
    }
    return conflicts;
}

export function getResolution(keys: string): string | undefined {
    return resolutions.find(r => r.keys === keys)?.winner;
}

export function resolve(keys: string, winnerId: string): void {
    const idx = resolutions.findIndex(r => r.keys === keys);
    if (idx >= 0) resolutions[idx].winner = winnerId;
    else resolutions.push({ keys, winner: winnerId });
    saveResolutions();
    notify();
}

export function updateKeys(id: string, newKeys: string): void {
    const entry = keybinds.find(k => k.id === id);
    if (entry) {
        entry.keys = newKeys;
        const meta = entrySettings.get(id);
        if (meta) meta.settings.store[meta.keysKey] = newKeys;
        notify();
    }
}

export function setEnabled(id: string, enabled: boolean): void {
    const entry = keybinds.find(k => k.id === id);
    if (entry) {
        entry.enabled = enabled;
        const meta = entrySettings.get(id);
        if (meta) meta.settings.store[meta.enabledKey] = enabled;
        notify();
    }
}

export function onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Test-only: reset all state. */
export function _reset(): void {
    for (const meta of entrySettings.values()) {
        meta.cleanups.forEach(cleanup => cleanup());
    }
    entrySettings.clear();
    keybinds.length = 0;
    resolutions = [];
    listeners.clear();
}
