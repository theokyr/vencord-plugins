/*
 * Vencord userplugin — _libKeybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { HeldModifiers, LayerHandler, ChordHandler } from "./types";
import { normalizeEvent, isModifierCode } from "./format";
import { getAll, getResolution, getDeclaration } from "./registry";

let listening = false;
const modHoldListeners = new Set<(mods: HeldModifiers) => void>();

// ─── Chord state ─────────────────────────────────────────────────────────

let activeChord: {
    keybindId: string;
    declaration: ChordHandler;
    timer: ReturnType<typeof setTimeout>;
} | null = null;

function clearChord(): void {
    if (activeChord) {
        clearTimeout(activeChord.timer);
        activeChord = null;
    }
}

// ─── Text input detection ────────────────────────────────────────────────

/**
 * Check if the currently active element is a text input.
 * Uses document.activeElement as fallback because manually dispatched events
 * via document.dispatchEvent() won't have e.target set to the focused input.
 */
function isTextInput(target: EventTarget | null): boolean {
    const el = (target instanceof HTMLElement && target !== document.documentElement && target !== document.body)
        ? target
        : document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (el.getAttribute("role") === "textbox") return true;
    if (el.isContentEditable) return true;
    return false;
}

// ─── Digit extraction ────────────────────────────────────────────────────

function extractDigit(code: string): number | null {
    const match = code.match(/^Digit([1-9])$/);
    return match ? parseInt(match[1]) : null;
}

// ─── Main dispatch ───────────────────────────────────────────────────────

function dispatch(e: KeyboardEvent): void {
    // Chord pending — intercept second keypress
    if (activeChord) {
        if (e.key === "Escape" && activeChord.declaration.cancelOnEscape) {
            clearChord();
            e.preventDefault();
            return;
        }
        const digit = extractDigit(e.code);
        if (digit !== null) {
            const { declaration } = activeChord;
            clearChord();
            e.preventDefault();
            e.stopPropagation();
            declaration.secondHandler(e, digit);
            return;
        }
        // Non-digit, non-escape: cancel chord and fall through
        clearChord();
    }

    const normalized = normalizeEvent(e);
    const textFocused = isTextInput(e.target);

    // Check layer keybinds (modifier-only match + digit)
    const digit = extractDigit(e.code);
    if (digit !== null) {
        const parts: string[] = [];
        if (e.ctrlKey) parts.push("ctrl");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");
        if (e.metaKey) parts.push("meta");
        const modString = parts.join("+");

        for (const kb of getAll()) {
            if (!kb.enabled) continue;
            if (!kb.keys) continue; // skip keybinds with no keys (e.g. disabled defaults)
            if (textFocused && kb.textInputBehavior === "block") continue;
            if (kb.keys !== modString) continue;

            const decl = getDeclaration(kb.id);
            if (decl && typeof decl.handler === "object" && "type" in decl.handler) {
                if (decl.handler.type === "layer") {
                    e.preventDefault();
                    e.stopPropagation();
                    (decl.handler as LayerHandler).handler(e, digit);
                    return;
                }
                if (decl.handler.type === "chord") {
                    const chord = decl.handler as ChordHandler;
                    e.preventDefault();
                    e.stopPropagation();
                    chord.firstHandler(e, digit);
                    activeChord = {
                        keybindId: kb.id,
                        declaration: chord,
                        timer: setTimeout(clearChord, chord.timeout()),
                    };
                    return;
                }
            }
        }
    }

    // Collect matching enabled keybinds (exact combo match)
    const matches = getAll().filter(kb => {
        if (!kb.enabled) return false;
        if (kb.keys !== normalized) return false;
        if (textFocused && kb.textInputBehavior === "block") return false;
        return true;
    });

    if (matches.length === 0) return;

    if (matches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        matches[0].handler(e);
        return;
    }

    // Conflict — check resolution
    const winner = getResolution(normalized);
    if (winner) {
        const winnerKb = matches.find(m => m.id === winner);
        if (winnerKb) {
            e.preventDefault();
            e.stopPropagation();
            winnerKb.handler(e);
            return;
        }
    }

    // Unresolved conflict — call nothing, log warning
    console.warn(
        `[_keybindRegistry] Unresolved conflict for "${normalized}":`,
        matches.map(m => m.id).join(", "),
        "— resolve in settingsHub Keybinds page"
    );
}

// ─── Modifier hold tracking ──────────────────────────────────────────────

let lastMods: HeldModifiers = { ctrl: false, alt: false, shift: false, meta: false };

function onModKey(e: KeyboardEvent): void {
    if (!isModifierCode(e.code)) return;

    const mods: HeldModifiers = {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
    };

    // For keyup, the released modifier's flag is already false in the event
    if (e.type === "keyup") {
        if (e.code.startsWith("Control")) mods.ctrl = false;
        else if (e.code.startsWith("Alt")) mods.alt = false;
        else if (e.code.startsWith("Shift")) mods.shift = false;
        else if (e.code.startsWith("Meta")) mods.meta = false;
    }

    if (mods.ctrl !== lastMods.ctrl || mods.alt !== lastMods.alt ||
        mods.shift !== lastMods.shift || mods.meta !== lastMods.meta) {
        lastMods = mods;
        modHoldListeners.forEach(fn => fn(mods));
    }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

export function startDispatcher(): void {
    if (listening) return;
    document.addEventListener("keydown", dispatch, true);
    document.addEventListener("keydown", onModKey);
    document.addEventListener("keyup", onModKey);
    listening = true;
}

export function stopDispatcher(): void {
    if (!listening) return;
    document.removeEventListener("keydown", dispatch, true);
    document.removeEventListener("keydown", onModKey);
    document.removeEventListener("keyup", onModKey);
    listening = false;
    clearChord();
    lastMods = { ctrl: false, alt: false, shift: false, meta: false };
}

export function onModifierHold(fn: (mods: HeldModifiers) => void): () => void {
    modHoldListeners.add(fn);
    return () => { modHoldListeners.delete(fn); };
}
