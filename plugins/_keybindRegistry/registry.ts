/*
 * Vencord userplugin — _keybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type {
    RegisteredKeybind, RegistrationOptions, ConflictResolution,
    KeybindDeclaration, LayerHandler, ChordHandler,
} from "./types";

const keybinds: RegisteredKeybind[] = [];
const RESOLUTIONS_STORAGE_KEY = "vc-keybindRegistry-resolutions";
let resolutions: ConflictResolution[];
try { resolutions = loadResolutions(); } catch { resolutions = []; }
const listeners = new Set<() => void>();

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

export function register(opts: RegistrationOptions): void {
    // Remove existing entries for this plugin (re-register)
    unregister(opts.plugin, true);

    for (const [suffix, decl] of Object.entries(opts.keybinds)) {
        const id = `${opts.plugin}.${suffix}`;
        const handler = typeof decl.handler === "function"
            ? decl.handler as (e: KeyboardEvent) => void
            : () => {};

        const entry: RegisteredKeybind = {
            id,
            plugin: opts.plugin,
            action: decl.action,
            keys: decl.defaultKeys,
            defaultKeys: decl.defaultKeys,
            enabled: decl.defaultEnabled !== false,
            defaultEnabled: decl.defaultEnabled !== false,
            handler,
            textInputBehavior: decl.textInputBehavior ?? "block",
        };

        // Attach layer/chord metadata for dispatcher to read
        (entry as any)._declaration = decl;

        keybinds.push(entry);
    }

    notify();
}

export function unregister(plugin: string, silent = false): void {
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
        notify();
    }
}

export function setEnabled(id: string, enabled: boolean): void {
    const entry = keybinds.find(k => k.id === id);
    if (entry) {
        entry.enabled = enabled;
        notify();
    }
}

export function onChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Test-only: reset all state. */
export function _reset(): void {
    keybinds.length = 0;
    resolutions = [];
    listeners.clear();
}
