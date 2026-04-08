/*
 * Vencord userplugin — settingsHub
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";
import { startDispatcher, stopDispatcher } from "../_libKeybindRegistry";

import definePlugin from "@utils/types";
import { initVcAnim, setPreset, setEnabled, type PresetName } from "../_libAnimationKit";
import { createRoot, Menu } from "@webpack/common";
import { closeAllModals } from "@utils/modal";
import { registerSchema, unregisterSchema, getSchemas } from "./registry";
import type { SettingsSchema } from "./schema";

// ─── Virtual tab: overlay-based settings page ─────────────────────────

const SETTINGS_TAB_PATH = "@@settingsHub";
const SETTINGS_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/></svg>')}`;

let settingsRoot: any = null;
let settingsContainer: HTMLDivElement | null = null;
let headerLabel: HTMLElement | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
let pendingPlugin: string | undefined;
let routeRegistered = false;

function ensureRouteRegistered(): void {
    if (window.__channelTabs && !routeRegistered) {
        window.__channelTabs.registerRoute(SETTINGS_TAB_PATH, {
            label: "Settings",
            icon: SETTINGS_ICON,
            onActivate: () => injectSettingsPage(pendingPlugin),
            onDeactivate: () => cleanupSettingsPage(),
        });
        routeRegistered = true;
    }
}

/** Single source of truth for "user wants to leave settings".
 *  Closes the channelTabs tab (which triggers onDeactivate → cleanupSettingsPage).
 *  Falls back to direct cleanup if channelTabs isn't available. */
function closeSettingsTab(): void {
    if (window.__channelTabs) {
        window.__channelTabs.closeRoute(SETTINGS_TAB_PATH);
    } else {
        cleanupSettingsPage();
    }
}

function openSettingsPage(pluginName?: string): void {
    closeAllModals();
    pendingPlugin = pluginName;

    ensureRouteRegistered();

    if (window.__channelTabs) {
        // Open via channelTabs — creates/activates the virtual tab, which calls onActivate
        window.__channelTabs.openRoute(SETTINGS_TAB_PATH);
    } else {
        // Fallback if channelTabs isn't available — inject overlay directly
        injectSettingsPage(pluginName);
    }
}

function injectSettingsPage(pluginName?: string): void {
    const page = document.querySelector('[class*="page_"]') as HTMLElement;
    if (!page) return;

    cleanupSettingsPage();

    document.body.classList.add("vc-settingsHub-open");

    // Inject "Settings" label into enriched header title bar
    const titleBar = document.querySelector('[class*="bar_"]:not([class*="systemBar"])');
    if (titleBar) {
        headerLabel = document.createElement("span");
        headerLabel.className = "vc-settingsHub-header-label";
        headerLabel.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/></svg>';
        const textNode = document.createElement("span");
        textNode.textContent = "Settings";
        headerLabel.appendChild(textNode);
        // Insert after the sidebar toggles divider
        const breadcrumb = titleBar.querySelector('.vc-channelTabs-headerBreadcrumb');
        if (breadcrumb) {
            titleBar.insertBefore(headerLabel, breadcrumb);
        } else {
            const titleSection = titleBar.querySelector('[class*="title_"]');
            if (titleSection) titleBar.insertBefore(headerLabel, titleSection);
            else titleBar.appendChild(headerLabel);
        }
    }

    // Absolute overlay covers Discord's content; tab bar floats above via z-index
    settingsContainer = document.createElement("div");
    settingsContainer.className = "vc-settingsHub-route-container";
    page.appendChild(settingsContainer);

    const { SettingsPage } = require("./components/SettingsPage");
    settingsRoot = createRoot(settingsContainer);
    settingsRoot.render(
        <SettingsPage
            initialPlugin={pluginName ?? pendingPlugin}
            onClose={() => closeSettingsTab()}
        />
    );

    escapeHandler = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        // Don't close settings if focus is in a text input — blur instead
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
            (active as HTMLElement).blur();
            return;
        }
        closeSettingsTab();
    };
    window.addEventListener("keydown", escapeHandler);

    pendingPlugin = undefined;
}

function cleanupSettingsPage(): void {
    if (headerLabel) {
        headerLabel.remove();
        headerLabel = null;
    }
    if (settingsRoot) {
        settingsRoot.unmount();
        settingsRoot = null;
    }
    if (settingsContainer) {
        settingsContainer.remove();
        settingsContainer = null;
    }
    document.body.classList.remove("vc-settingsHub-open");
    if (escapeHandler) {
        window.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
    }
}

// ─── Animation runtime ────────────────────────────────────────────────

const PRESET_CLASSES = ["vc-anim-minimal", "vc-anim-smooth", "vc-anim-expressive"];
const ANIM_STORAGE_KEY = "vc-anim-settings";

interface AnimSettings {
    enabled: boolean;
    preset: PresetName;
}

function loadAnimSettings(): AnimSettings {
    try {
        const raw = localStorage.getItem(ANIM_STORAGE_KEY);
        if (raw) return JSON.parse(raw) as AnimSettings;
    } catch { /* ignore */ }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { enabled: true, preset: prefersReduced ? "minimal" : "smooth" };
}

function saveAnimSettings(settings: AnimSettings): void {
    try {
        localStorage.setItem(ANIM_STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
}

function applyAnimPreset(preset: PresetName): void {
    for (const cls of PRESET_CLASSES) document.body.classList.remove(cls);
    document.body.classList.add(`vc-anim-${preset}`);
    setPreset(preset);
}

function applyAnimEnabled(enabled: boolean): void {
    document.body.classList.toggle("vc-anim-off", !enabled);
    setEnabled(enabled);
}

let mediaQuery: MediaQueryList | null = null;
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

function initAnimRuntime(): void {
    const settings = loadAnimSettings();
    initVcAnim(settings.preset, settings.enabled);
    applyAnimPreset(settings.preset);
    applyAnimEnabled(settings.enabled);

    mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    mediaHandler = (e: MediaQueryListEvent) => {
        const s = loadAnimSettings();
        if (e.matches && s.preset !== "minimal") {
            s.preset = "minimal";
            saveAnimSettings(s);
            applyAnimPreset("minimal");
        }
    };
    mediaQuery.addEventListener("change", mediaHandler);
}

function cleanupAnimRuntime(): void {
    if (mediaQuery && mediaHandler) {
        mediaQuery.removeEventListener("change", mediaHandler);
        mediaQuery = null;
        mediaHandler = null;
    }
    for (const cls of PRESET_CLASSES) document.body.classList.remove(cls);
    document.body.classList.remove("vc-anim-off");
    delete (globalThis as any).__vcAnim;
}

interface SettingsHubAPI {
    register(schema: SettingsSchema): void;
    unregister(pluginName: string): void;
    open(pluginName?: string): void;
    version: number;
    // Component exports for consumer schema files
    useSettingsReactive: any;
    TriStateToggle: any;
    KeybindTable: any;
    setAnimPreset(preset: PresetName): void;
    setAnimEnabled(enabled: boolean): void;
    getAnimSettings(): AnimSettings;
}

declare global {
    interface Window {
        __settingsHub?: SettingsHubAPI;
        __channelTabs?: {
            registerRoute(path: string, config: {
                label: string;
                icon?: string;
                onActivate?: () => void;
                onDeactivate?: () => void;
            }): void;
            unregisterRoute(path: string): void;
            openRoute(path: string): void;
            closeRoute(path: string): void;
            registerRouteContextMenu?(path: string, builder: () => React.ReactElement[]): void;
            unregisterRouteContextMenu?(path: string): void;
        };
    }
}

// ─── Module-scope API setup ───────────────────────────────────────────
// Set up the basic API at module scope so it's available when consumer plugins'
// start() runs. Module evaluation happens for ALL plugins before any start() is called.
// Component exports (useSettingsReactive, TriStateToggle, etc.) are added in start()
// once webpack modules are ready.
window.__settingsHub = {
    register: registerSchema,
    unregister: unregisterSchema,
    open: openSettingsPage,
    version: 2,
    // Placeholders — populated in start() when webpack modules are available
    useSettingsReactive: null as any,
    TriStateToggle: null as any,
    KeybindTable: null as any,
    setAnimPreset(_preset: PresetName) { /* populated in start() */ },
    setAnimEnabled(_enabled: boolean) { /* populated in start() */ },
    getAnimSettings: loadAnimSettings,
};

export default definePlugin({
    name: "SettingsHub",
    description: "Unified settings page for custom plugins",
    authors: [{ name: "kamaras", id: 132106519264100352n }],

    start() {
        startDispatcher();
        initAnimRuntime();

        // Re-create module-scope API if plugin was stopped and restarted
        // (module evaluation only runs once, so the delete in stop() is permanent
        // unless we restore it here)
        if (!window.__settingsHub) {
            window.__settingsHub = {
                register: registerSchema,
                unregister: unregisterSchema,
                open: openSettingsPage,
                version: 2,
                useSettingsReactive: null as any,
                TriStateToggle: null as any,
                KeybindTable: null as any,
                setAnimPreset(_preset: PresetName) { /* populated below */ },
                setAnimEnabled(_enabled: boolean) { /* populated below */ },
                getAnimSettings: loadAnimSettings,
            };
        }

        const { useSettingsReactive } = require("./hooks");
        const { TriStateToggle } = require("./components/controls/TriStateToggle");
        const { KeybindTable } = require("./components/controls/KeybindTable");

        // Populate component exports and animation API on the already-registered global
        Object.assign(window.__settingsHub!, {
            useSettingsReactive,
            TriStateToggle,
            KeybindTable,
            setAnimPreset(preset: PresetName) {
                const s = loadAnimSettings();
                s.preset = preset;
                saveAnimSettings(s);
                applyAnimPreset(preset);
            },
            setAnimEnabled(enabled: boolean) {
                const s = loadAnimSettings();
                s.enabled = enabled;
                saveAnimSettings(s);
                applyAnimEnabled(enabled);
            },
        });

        ensureRouteRegistered();

        // Register context menu items for the settingsHub virtual tab
        if (window.__channelTabs?.registerRouteContextMenu) {
            window.__channelTabs.registerRouteContextMenu(SETTINGS_TAB_PATH, () => {
                const schemas = getSchemas();
                return schemas.map(schema => (
                    <Menu.MenuItem
                        id={`vc-settingshub-nav-${schema.plugin}`}
                        key={schema.plugin}
                        label={schema.plugin}
                        action={() => {
                            (window as any).__settingsHub?.open(schema.plugin);
                        }}
                    />
                ));
            });
        }
    },

    stop() {
        stopDispatcher();
        cleanupAnimRuntime();

        if (routeRegistered) {
            window.__channelTabs?.unregisterRoute(SETTINGS_TAB_PATH);
            window.__channelTabs?.unregisterRouteContextMenu?.(SETTINGS_TAB_PATH);
            routeRegistered = false;
        }
        cleanupSettingsPage();
        delete window.__settingsHub;
    },

    patches: [],
});
