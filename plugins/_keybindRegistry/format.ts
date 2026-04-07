/*
 * Vencord userplugin — _keybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MODIFIER_CODES = new Set([
    "ControlLeft", "ControlRight",
    "AltLeft", "AltRight",
    "ShiftLeft", "ShiftRight",
    "MetaLeft", "MetaRight",
]);

/** Convert a KeyboardEvent.code to a human-friendly label. */
export function codeToLabel(code: string): string {
    if (code.startsWith("Control")) return "ctrl";
    if (code.startsWith("Alt")) return "alt";
    if (code.startsWith("Shift")) return "shift";
    if (code.startsWith("Meta")) return "meta";
    if (code.startsWith("Key")) return code.slice(3).toLowerCase();
    if (code.startsWith("Digit")) return code.slice(5);
    return code.toLowerCase();
}

/** Check if a code is a modifier key. */
export function isModifierCode(code: string): boolean {
    return MODIFIER_CODES.has(code);
}

/**
 * Normalize a KeyboardEvent into a canonical key string.
 * Format: "ctrl+alt+shift+meta+KeyCode" (modifiers always in this order).
 * If the pressed key IS a modifier, returns modifier-only string (e.g., "ctrl+alt").
 */
export function normalizeEvent(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    if (e.metaKey) parts.push("meta");

    if (!isModifierCode(e.code)) {
        parts.push(e.code);
    }

    return parts.join("+");
}

/** Split a keybind string into parts. */
export function parseKeybind(keybind: string): string[] {
    return keybind.split("+").map(s => s.trim()).filter(Boolean);
}

/** Join keybind parts into a string. */
export function serializeKeybind(parts: string[]): string {
    return parts.join("+");
}

/**
 * Extract modifier flags and key code from a stored keybind string.
 * Returns { ctrl, alt, shift, meta, code } where code is the non-modifier part (or null for modifier-only).
 */
export function parseKeybindParts(keybind: string): {
    ctrl: boolean; alt: boolean; shift: boolean; meta: boolean;
    code: string | null;
} {
    const parts = parseKeybind(keybind);
    let ctrl = false, alt = false, shift = false, meta = false;
    let code: string | null = null;

    for (const part of parts) {
        switch (part.toLowerCase()) {
            case "ctrl": ctrl = true; break;
            case "alt": alt = true; break;
            case "shift": shift = true; break;
            case "meta": meta = true; break;
            default: code = part; break;
        }
    }

    return { ctrl, alt, shift, meta, code };
}
