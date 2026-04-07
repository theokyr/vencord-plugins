/*
 * Vencord userplugin — _keybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type {
    RegisteredKeybind, RegistrationOptions, KeybindDeclaration,
    ConflictResolution, LayerHandler, ChordHandler,
    HeldModifiers, KeybindRegistryAPI, TextInputBehavior,
} from "./types";

export {
    register, unregister, getAll, getConflicts,
    resolve, updateKeys, setEnabled, onChange,
} from "./registry";

export { startDispatcher, stopDispatcher, onModifierHold } from "./dispatcher";
export { codeToLabel, normalizeEvent, parseKeybind, serializeKeybind, parseKeybindParts, isModifierCode } from "./format";

// ─── Module-scope global ─────────────────────────────────────────────────
// Set up window.__keybindRegistry at module evaluation time, before any
// plugin's start() runs. Same pattern as _animationKit's globalThis.__vcAnim.

import type { KeybindRegistryAPI } from "./types";
import {
    register, unregister, getAll, getConflicts,
    resolve, updateKeys, setEnabled, onChange,
} from "./registry";
import { startDispatcher, stopDispatcher, onModifierHold } from "./dispatcher";

declare global {
    interface Window {
        __keybindRegistry?: KeybindRegistryAPI;
    }
}

window.__keybindRegistry = {
    register,
    unregister,
    getAll,
    getConflicts,
    resolve,
    updateKeys,
    setEnabled,
    onModifierHold,
    onChange,
};

// Start the dispatcher immediately — keybinds registered in start() will
// be dispatched as soon as they're added.
startDispatcher();
