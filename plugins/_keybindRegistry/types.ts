/*
 * Vencord userplugin — _keybindRegistry
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** A single registered keybind entry. */
export interface RegisteredKeybind {
    /** Globally unique ID: "pluginName.actionName" */
    id: string;
    /** Plugin that owns this keybind */
    plugin: string;
    /** Human-readable action name (e.g., "Close active tab") */
    action: string;
    /** Current key combo in e.code format (e.g., "ctrl+shift+KeyW") */
    keys: string;
    /** Original default for "Reset to default" */
    defaultKeys: string;
    /** Whether this keybind is currently enabled */
    enabled: boolean;
    /** Plugin-declared default enabled state */
    defaultEnabled: boolean;
    /** Handler called when the keybind fires */
    handler: (e: KeyboardEvent) => void;
    /** How to handle text input focus */
    textInputBehavior: TextInputBehavior;
}

export type TextInputBehavior = "block" | "allow";

/** Handler type for modifier-layer keybinds (hold modifier + press digit). */
export interface LayerHandler {
    type: "layer";
    handler: (e: KeyboardEvent, digit: number) => void;
}

/** Handler type for two-step chord keybinds. */
export interface ChordHandler {
    type: "chord";
    timeout: () => number;
    firstHandler: (e: KeyboardEvent, digit: number) => void;
    secondHandler: (e: KeyboardEvent, digit: number) => void;
    cancelOnEscape: boolean;
}

/** A per-combo conflict resolution (which keybind ID wins). */
export interface ConflictResolution {
    /** The conflicting key combo */
    keys: string;
    /** The keybind ID that should win */
    winner: string;
}

/** Options passed to register(). */
export interface RegistrationOptions {
    /** Plugin name (must match definePlugin name) */
    plugin: string;
    /** Keybind declarations. Key is the action suffix (e.g., "closeTab"). */
    keybinds: Record<string, KeybindDeclaration>;
}

/** A single keybind declaration within registration options. */
export interface KeybindDeclaration {
    /** Human-readable action name */
    action: string;
    /** Default key combo in e.code format */
    defaultKeys: string;
    /** Default enabled state (default: true) */
    defaultEnabled?: boolean;
    /** Handler — plain function, LayerHandler, or ChordHandler */
    handler: ((e: KeyboardEvent) => void) | LayerHandler | ChordHandler;
    /** Text input behavior (default: "block") */
    textInputBehavior?: TextInputBehavior;
}

/** Public API shape exposed on window.__keybindRegistry. */
export interface KeybindRegistryAPI {
    register(opts: RegistrationOptions): void;
    unregister(plugin: string): void;
    getAll(): readonly RegisteredKeybind[];
    getConflicts(): Map<string, RegisteredKeybind[]>;
    resolve(keys: string, winnerId: string): void;
    updateKeys(id: string, newKeys: string): void;
    setEnabled(id: string, enabled: boolean): void;
    onModifierHold(fn: (mods: HeldModifiers) => void): () => void;
    onChange(fn: () => void): () => void;
}

export interface HeldModifiers {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
}
