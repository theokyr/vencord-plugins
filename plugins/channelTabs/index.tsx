/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_animationKit/animations.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { createChannelTabsSchema } from "./settingsSchema";
import {
    ChannelRouter,
    ChannelStore,
    createRoot,
    FluxDispatcher,
    GuildStore,
    NavigationRouter,
    ReadStateStore,
    SelectedChannelStore,
    SelectedGuildStore,
    useCallback,
    useEffect,
    UserStore,
    useState,
} from "@webpack/common";

import { TabBar, ROUTE_ICONS } from "./tabBar";
import type { Tab, ChannelTab, RouteTab } from "./types";
import { findByPropsLazy, findLazy } from "@webpack";

const AckUtils = findByPropsLazy("ack") as { ack: (channelId: string, messageId: string) => void; };

/** Overflow triggers when title bar children fill beyond this fraction of the bar width */
const OVERFLOW_THRESHOLD = 0.9;
const QuickSwitcherKeybind = findLazy(m => m?.R?.action && m?.R?.binds?.some?.((b: string) => b === "mod+k")) as { R: { action: () => void; }; };

/** Known Discord routes that can be represented as tabs */
const ROUTE_TAB_CONFIG: Record<string, { label: string }> = {
    "/channels/@me": { label: "Friends" },
    "/message-requests": { label: "Message Requests" },
    "/store": { label: "Nitro" },
    "/shop": { label: "Shop" },
    "/quest-home": { label: "Quests" },
};

// ─── External route registration API ────────────────────────────────────

/** Config for an externally registered route tab */
interface ExternalRouteConfig {
    /** Tab label shown in the tab bar */
    label: string;
    /** SVG data URI for the tab icon */
    icon?: string;
    /**
     * Called when the tab is activated (clicked or switched to).
     * If provided, the tab becomes "virtual" — no NavigationRouter.transitionTo is called.
     * The plugin is responsible for showing its own UI (e.g. overlay on page_).
     */
    onActivate?: () => void;
    /**
     * Called when the user navigates away from a virtual tab (clicks another tab,
     * channel, or route). Use this to clean up any overlay UI.
     */
    onDeactivate?: () => void;
}

const externalRouteCallbacks = new Map<string, ExternalRouteConfig>();

function registerExternalRoute(path: string, config: ExternalRouteConfig) {
    ROUTE_TAB_CONFIG[path] = { label: config.label };
    if (config.icon) ROUTE_ICONS[path] = config.icon;
    externalRouteCallbacks.set(path, config);
}

function closeExternalRoute(path: string) {
    const idx = tabs.findIndex(t => t.type === "route" && t.path === path);
    if (idx !== -1) closeTab(idx);
}

function unregisterExternalRoute(path: string) {
    // Deactivate if currently active
    const activeTab = tabs[activeTabIndex];
    if (activeTab?.type === "route" && activeTab.path === path) {
        externalRouteCallbacks.get(path)?.onDeactivate?.();
    }
    delete ROUTE_TAB_CONFIG[path];
    delete ROUTE_ICONS[path];
    externalRouteCallbacks.delete(path);
    // Close any open tabs for this route
    const idx = tabs.findIndex(t => t.type === "route" && t.path === path);
    if (idx !== -1) closeTab(idx);
}

interface ChannelTabsAPI {
    /**
     * Register a custom route tab. If `onActivate` is provided, the tab is "virtual" —
     * clicking it calls your callback instead of navigating Discord's router.
     */
    registerRoute(path: string, config: ExternalRouteConfig): void;
    /** Unregister a custom route tab. Calls onDeactivate if the tab is active. */
    unregisterRoute(path: string): void;
    /** Programmatically open/switch to a route tab. */
    openRoute(path: string): void;
    /** Close the tab for a route (without unregistering). Navigates to the next tab. */
    closeRoute(path: string): void;
}

declare global {
    interface Window {
        __channelTabs?: ChannelTabsAPI;
    }
}

function openQuickSwitcher() {
    try { QuickSwitcherKeybind.R.action(); } catch { }
}

function openChannelTabsSettings() {
    if ((window as any).__settingsHub) {
        (window as any).__settingsHub.open("ChannelTabs");
    } else {
        try {
            const { openPluginModal } = require("@components/settings");
            openPluginModal(plugin);
        } catch (e) {
            logger.warn("Failed to open settings modal:", e);
        }
    }
}

const logger = new Logger("ChannelTabs");

// ─── Simple tab state (no PaneManager overhead) ──────────────────────────

let tabs: Tab[] = [];
let activeTabIndex = -1;
let idCounter = 0;
const listeners = new Set<() => void>();

let notifyRaf = 0;
function notify() {
    if (notifyRaf) return;
    notifyRaf = requestAnimationFrame(() => {
        notifyRaf = 0;
        listeners.forEach(fn => fn());
    });
}
function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }

function openTab(channelId: string, guildId: string | null) {
    const existing = tabs.findIndex(t => t.type === "channel" && t.channelId === channelId);
    if (existing !== -1) {
        activeTabIndex = existing;
        notify();
        return;
    }

    tabs.push({
        type: "channel",
        id: `tab-${++idCounter}`,
        channelId,
        guildId,
        pinned: false,
    });
    activeTabIndex = tabs.length - 1;
    notify();
    scheduleSave();
}

function openRouteTab(path: string, navigate = false) {
    const config = ROUTE_TAB_CONFIG[path];
    if (!config) return;

    const existing = tabs.findIndex(t => t.type === "route" && t.path === path);
    if (existing !== -1) {
        activeTabIndex = existing;
        notify();
        if (navigate) navigateTo(tabs[existing]);
        return;
    }

    tabs.push({
        type: "route",
        id: `tab-${++idCounter}`,
        path,
        label: config.label,
        pinned: false,
    });
    activeTabIndex = tabs.length - 1;
    notify();
    scheduleSave();
    if (navigate) navigateTo(tabs[activeTabIndex]);
}

function openTabBackground(channelId: string, guildId: string | null) {
    const existing = tabs.findIndex(t => t.type === "channel" && t.channelId === channelId);
    if (existing !== -1) return;

    tabs.push({
        type: "channel",
        id: `tab-${++idCounter}`,
        channelId,
        guildId,
        pinned: false,
    });
    notify();
    scheduleSave();
}

function closeTab(index: number) {
    if (index < 0 || index >= tabs.length || tabs[index].pinned) return;
    // Deactivate virtual tab BEFORE removing (onDeactivate needs the tab in the array)
    if (index === activeTabIndex) deactivateVirtualTab(index);
    tabs.splice(index, 1);

    if (tabs.length === 0) {
        activeTabIndex = -1;
    } else if (activeTabIndex >= tabs.length) {
        activeTabIndex = tabs.length - 1;
    } else if (index < activeTabIndex) {
        activeTabIndex--;
    }

    notify();
    scheduleSave();

    // Navigate to the new active tab
    const tab = tabs[activeTabIndex];
    if (tab) navigateTo(tab);
}

function activateTab(index: number) {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    notify();
    scheduleSave();
}

function nextTab() {
    if (tabs.length <= 1) return;
    activeTabIndex = (activeTabIndex + 1) % tabs.length;
    notify();
    navigateTo(tabs[activeTabIndex]);
}

function prevTab() {
    if (tabs.length <= 1) return;
    activeTabIndex = (activeTabIndex - 1 + tabs.length) % tabs.length;
    notify();
    navigateTo(tabs[activeTabIndex]);
}

function pinTab(index: number) {
    if (index < 0 || index >= tabs.length) return;
    const tab = tabs[index];
    tab.pinned = !tab.pinned;
    if (tab.pinned) {
        tabs.splice(index, 1);
        const insertAt = tabs.findIndex(t => !t.pinned);
        tabs.splice(insertAt === -1 ? tabs.length : insertAt, 0, tab);
        activeTabIndex = tabs.indexOf(tab);
    }
    notify();
    scheduleSave();
}

function closeOtherTabs(keepIndex: number) {
    const keptTab = tabs[keepIndex];
    const wasActive = keepIndex === activeTabIndex;
    const kept = tabs.filter((t, i) => i === keepIndex || t.pinned);
    activeTabIndex = kept.findIndex(t => t.id === keptTab?.id);
    tabs = kept;
    notify();
    scheduleSave();
    if (!wasActive) {
        const tab = tabs[activeTabIndex];
        if (tab) navigateTo(tab);
    }
}

function closeTabsToLeft(fromIndex: number) {
    const activeTab = tabs[activeTabIndex];
    tabs = tabs.filter((t, i) => i >= fromIndex || t.pinned);
    // Find the active tab in the new array, or clamp to end
    activeTabIndex = activeTab ? Math.max(0, tabs.indexOf(activeTab)) : Math.min(activeTabIndex, tabs.length - 1);
    if (activeTabIndex >= tabs.length) activeTabIndex = tabs.length - 1;
    notify();
    scheduleSave();
    const tab = tabs[activeTabIndex];
    if (tab) navigateTo(tab);
}

function closeTabsToRight(fromIndex: number) {
    const activeTab = tabs[activeTabIndex];
    tabs = tabs.filter((t, i) => i <= fromIndex || t.pinned);
    activeTabIndex = activeTab ? Math.max(0, tabs.indexOf(activeTab)) : Math.min(activeTabIndex, tabs.length - 1);
    notify();
    scheduleSave();
    const tab = tabs[activeTabIndex];
    if (tab) navigateTo(tab);
}

function moveTab(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= tabs.length) return;
    // Clamp target to valid range (after source removal, max is length-1)
    const clampedTo = Math.min(to, tabs.length - 1);
    const [tab] = tabs.splice(from, 1);
    tabs.splice(clampedTo, 0, tab);
    if (activeTabIndex === from) activeTabIndex = clampedTo;
    else if (from < activeTabIndex && clampedTo >= activeTabIndex) activeTabIndex--;
    else if (from > activeTabIndex && clampedTo <= activeTabIndex) activeTabIndex++;
    notify();
    scheduleSave();
}

// ─── Mark as read ─────────────────────────────────────────────────────────

function markAsRead(indices: number[]) {
    for (const i of indices) {
        const tab = tabs[i];
        if (!tab || tab.type !== "channel") continue;
        const lastMsg = ReadStateStore.lastMessageId(tab.channelId);
        if (lastMsg) AckUtils.ack(tab.channelId, lastMsg);
    }
    notify();
}

function markTabAsRead(index: number) { markAsRead([index]); }
function markAllAsRead() { markAsRead(tabs.map((_, i) => i)); }
function markOthersAsRead(index: number) { markAsRead(tabs.map((_, i) => i).filter(i => i !== index)); }
function markToLeftAsRead(index: number) { markAsRead(tabs.map((_, i) => i).filter(i => i < index)); }
function markToRightAsRead(index: number) { markAsRead(tabs.map((_, i) => i).filter(i => i > index)); }

// ─── Settings ─────────────────────────────────────────────────────────────

/** Build CSS custom properties from settings — applied inline on the tab bar container */
function getStyleVars(): Record<string, string> {
    const s = settings.store;
    return {
        "--vc-channelTabs-fontSize": s.fontSize + "px",
        "--vc-channelTabs-tabHeight": s.tabHeight + "px",
        "--vc-channelTabs-barHeight": (s.tabHeight + 6) + "px",
        "--vc-channelTabs-iconSize": s.iconSize + "px",
        "--vc-channelTabs-tabGap": s.tabGap + "px",
        "--vc-channelTabs-tabPadding": s.tabPadding + "px",
        "--vc-channelTabs-tabRadius": s.tabRadius + "px",
        "--vc-channelTabs-bottomMargin": s.bottomMargin + "px",
        "--vc-channelTabs-pinOpacity": String(s.pinIconOpacity ?? 0.4),
        "--vc-channelTabs-closeOpacity": String(s.closeIconOpacity ?? 0),
    };
}

export const settings = definePluginSettings({
    tabBarPosition: {
        type: OptionType.SELECT,
        description: "Position the tab bar at the top or bottom of the content area",
        options: [
            { label: "Top", value: "top", default: true },
            { label: "Bottom", value: "bottom" },
        ],
        onChange: () => repositionTabBar(),
    },
    showServerIcon: {
        type: OptionType.BOOLEAN,
        description: "Show server/user icon in tab labels",
        default: true,
    },
    autoOpenDMs: {
        type: OptionType.BOOLEAN,
        description: "Auto-open tabs for new DMs (opens in background)",
        default: false,
    },
    autoOpenMentions: {
        type: OptionType.BOOLEAN,
        description: "Auto-open tabs for @mentions (opens in background)",
        default: false,
    },
    restoreTabs: {
        type: OptionType.BOOLEAN,
        description: "Restore tabs on Discord restart",
        default: true,
    },
    tabOverflowMode: {
        type: OptionType.SELECT,
        description: "How to handle too many tabs",
        options: [
            { label: "Scroll", value: "scroll", default: true },
            { label: "Compress", value: "compress" },
            { label: "Dropdown menu", value: "dropdown" },
        ],
        onChange: notify,
    },
    showSidebarToggles: {
        type: OptionType.BOOLEAN,
        description: "Show sidebar toggle buttons on the left of the tab bar",
        default: true,
        onChange: notify,
    },
    enrichedHeader: {
        type: OptionType.BOOLEAN,
        description: "Enrich title bar with channel header content (saves ~48px)",
        default: false,
        restartNeeded: true,
    },
    sidebarTogglePosition: {
        type: OptionType.SELECT,
        description: "Sidebar toggle position in enriched header",
        options: [
            { label: "Left (after nav buttons)", value: "left", default: true },
            { label: "Right (before trailing icons)", value: "right" },
        ],
        restartNeeded: true,
    },
    guildNameStyle: {
        type: OptionType.SELECT,
        description: "Guild name display in enriched header",
        options: [
            { label: "Hidden", value: "none", default: true },
            { label: "Breadcrumb (Server > #channel)", value: "breadcrumb" },
        ],
        restartNeeded: true,
    },
    navButtonsStyle: {
        type: OptionType.SELECT,
        description: "Back/forward navigation buttons in enriched header",
        options: [
            { label: "Show", value: "show", default: true },
            { label: "Compact (smaller)", value: "compact" },
            { label: "Hidden", value: "hidden" },
        ],
        restartNeeded: true,
    },
    hideGuildSidebar: {
        type: OptionType.BOOLEAN,
        description: "Hide the guild (server) sidebar",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-channelTabs-hideGuilds", val),
    },
    hideChannelList: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel list sidebar",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-channelTabs-hideChannels", val),
    },
    fontSize: {
        type: OptionType.NUMBER,
        description: "Tab font size (px)",
        default: 12,
        onChange: notify,
    },
    tabHeight: {
        type: OptionType.NUMBER,
        description: "Tab height (px)",
        default: 26,
        onChange: notify,
    },
    iconSize: {
        type: OptionType.NUMBER,
        description: "Icon size (px)",
        default: 16,
        onChange: notify,
    },
    tabGap: {
        type: OptionType.NUMBER,
        description: "Gap between tabs (px)",
        default: 2,
        onChange: notify,
    },
    tabPadding: {
        type: OptionType.NUMBER,
        description: "Tab horizontal padding (px)",
        default: 8,
        onChange: notify,
    },
    tabRadius: {
        type: OptionType.NUMBER,
        description: "Tab corner radius (px)",
        default: 4,
        onChange: notify,
    },
    bottomMargin: {
        type: OptionType.NUMBER,
        description: "Gap below tab bar (px)",
        default: 4,
        onChange: notify,
    },
    animationSpeed: {
        type: OptionType.NUMBER,
        description: "Animation speed in ms (0 to disable)",
        default: 150,
        onChange: notify,
    },
    tabMaxWidth: {
        type: OptionType.NUMBER,
        description: "Maximum tab width in pixels (0 = no limit)",
        default: 0,
        onChange: notify,
    },
    closeButtonVisibility: {
        type: OptionType.SELECT,
        description: "When to show the tab close button",
        options: [
            { label: "Always", value: "always", default: true },
            { label: "On hover", value: "hover" },
            { label: "Never", value: "never" },
        ],
        onChange: notify,
    },
    activeTabStyle: {
        type: OptionType.SELECT,
        description: "Visual style for the active tab",
        options: [
            { label: "Solid background", value: "solid", default: true },
            { label: "Bottom underline", value: "underline" },
            { label: "Pill shape", value: "pill" },
        ],
        onChange: notify,
    },
    doubleClickAction: {
        type: OptionType.SELECT,
        description: "Action when double-clicking a tab",
        options: [
            { label: "Pin/unpin tab", value: "pin", default: true },
            { label: "Close tab", value: "close" },
            { label: "None", value: "none" },
        ],
    },
    pinIconOpacity: {
        type: OptionType.SLIDER,
        description: "Pin icon opacity (0 = hidden, 1 = fully visible)",
        default: 0.4,
        markers: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        onChange: notify,
    },
    closeIconOpacity: {
        type: OptionType.SLIDER,
        description: "Close button opacity (0 = hidden, 1 = fully visible)",
        default: 0,
        markers: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        onChange: notify,
    },
    savedTabs: {
        type: OptionType.STRING,
        description: "Saved tabs (internal)",
        default: "",
        hidden: true,
    },
});

// ─── Navigation ──────────────────────────────────────────────────────────

let originalTransitionToChannel: ((...args: any[]) => any) | null = null;
let originalTransitionToGuild: ((...args: any[]) => any) | null = null;

function deactivateVirtualTab(prevIndex?: number) {
    const idx = prevIndex ?? activeTabIndex;
    const prev = tabs[idx];
    if (prev?.type === "route") {
        externalRouteCallbacks.get(prev.path)?.onDeactivate?.();
    }
}

function navigateTo(tab: Tab, prevIndex?: number) {
    // Deactivate any previously-active virtual tab before switching
    deactivateVirtualTab(prevIndex);

    navigating = true;
    if (tab.type === "channel") {
        if (originalTransitionToGuild && tab.guildId) {
            originalTransitionToGuild(tab.guildId);
        }
        if (originalTransitionToChannel) {
            originalTransitionToChannel(tab.channelId);
        }
    } else {
        const ext = externalRouteCallbacks.get(tab.path);
        if (ext?.onActivate) {
            // Virtual tab — call plugin callback instead of navigating
            ext.onActivate();
        } else {
            NavigationRouter.transitionTo(tab.path);
        }
    }
    setTimeout(() => { navigating = false; }, 100);
}

function patchNavigation() {
    if (originalTransitionToChannel) return; // Already patched — prevent double-patch on hot reload
    originalTransitionToChannel = ChannelRouter.transitionToChannel.bind(ChannelRouter);
    ChannelRouter.transitionToChannel = function (channelId: string, ...args: any[]) {
        const channel = ChannelStore.getChannel(channelId);
        openTab(channelId, channel?.guild_id ?? null);
        originalTransitionToChannel!(channelId, ...args);
    };

    originalTransitionToGuild = NavigationRouter.transitionToGuild.bind(NavigationRouter);
}

function unpatchNavigation() {
    if (originalTransitionToChannel) {
        ChannelRouter.transitionToChannel = originalTransitionToChannel;
        originalTransitionToChannel = null;
    }
    originalTransitionToGuild = null;
}

// ─── Persistence ─────────────────────────────────────────────────────────

function saveTabs() {
    try {
        settings.store.savedTabs = JSON.stringify({
            activeIndex: Math.max(0, activeTabIndex >= tabs.length ? tabs.length - 1 : activeTabIndex),
            tabs: tabs.map(t => {
                if (t.type === "route") {
                    return { type: "route", path: t.path, label: t.label, pinned: t.pinned };
                }
                return { type: "channel", channelId: t.channelId, guildId: t.guildId, pinned: t.pinned };
            }),
        });
    } catch (e) {
        logger.warn("Failed to save tabs:", e);
    }
}

function restoreTabs() {
    if (!settings.store.restoreTabs) return;
    const raw = settings.store.savedTabs;
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        const saved: any[] = Array.isArray(parsed) ? parsed : parsed.tabs;
        const savedIndex: number = Array.isArray(parsed) ? 0 : (parsed.activeIndex ?? 0);
        tabs = saved.map(t => {
            if (t.type === "route") {
                return { type: "route" as const, id: `tab-${++idCounter}`, path: t.path, label: t.label, pinned: t.pinned ?? false };
            }
            // Backwards compat: old tabs have no type field
            return { type: "channel" as const, id: `tab-${++idCounter}`, channelId: t.channelId, guildId: t.guildId ?? null, pinned: t.pinned ?? false };
        });
        activeTabIndex = tabs.length > 0 ? Math.min(savedIndex, tabs.length - 1) : -1;
        if (tabs.length > 0) {
            // Block CHANNEL_SELECT during startup so Discord's default navigation
            // (usually Friends) doesn't create a spurious tab
            startupGuard = true;
            setTimeout(() => {
                const tab = tabs[activeTabIndex];
                if (tab) navigateTo(tab);
                // Release guard after navigation settles
                setTimeout(() => { startupGuard = false; }, 200);
            }, 500);
        }
        notify();
    } catch (e) {
        logger.warn("Failed to restore tabs:", e);
    }
}

function resetState() {
    tabs = [];
    activeTabIndex = -1;
    startupGuard = false;
    listeners.clear();
    if (notifyRaf) { cancelAnimationFrame(notifyRaf); notifyRaf = 0; }
}

// ─── Sidebar toggles ────────────────────────────────────────────────────

function toggleGuilds() {
    settings.store.hideGuildSidebar = !settings.store.hideGuildSidebar;
    document.body.classList.toggle("vc-channelTabs-hideGuilds", settings.store.hideGuildSidebar);
    syncHeaderToggles();
    notify();
}

function toggleChannels() {
    settings.store.hideChannelList = !settings.store.hideChannelList;
    document.body.classList.toggle("vc-channelTabs-hideChannels", settings.store.hideChannelList);
    syncHeaderToggles();
    notify();
}

/** Sync enriched header toggle button classes with current state */
function syncHeaderToggles() {
    const container = document.querySelector('.vc-channelTabs-headerToggles');
    if (!container) return;
    const mode = getSidebarMode();
    const btns = container.querySelectorAll('.vc-channelTabs-toggleBtn');
    // 3 buttons: [guilds] [all] [channels]
    if (btns[0]) {
        btns[0].classList.toggle("vc-channelTabs-toggleBtn-active", mode === "guilds");
        (btns[0] as HTMLElement).title = "Show guilds only";
    }
    if (btns[1]) {
        btns[1].classList.toggle("vc-channelTabs-toggleBtn-active", mode === "all");
        (btns[1] as HTMLElement).title = "Show all sidebars";
    }
    if (btns[2]) {
        btns[2].classList.toggle("vc-channelTabs-toggleBtn-active", mode === "channels");
        (btns[2] as HTMLElement).title = "Show channels only";
    }
}

/** Get current sidebar mode from the two boolean settings */
type SidebarMode = "all" | "guilds" | "channels" | "none";
function getSidebarMode(): SidebarMode {
    const g = settings.store.hideGuildSidebar;
    const c = settings.store.hideChannelList;
    if (!g && !c) return "all";
    if (!g && c) return "guilds";
    if (g && !c) return "channels";
    return "none";
}

/** Set sidebar mode directly */
function setSidebarMode(mode: SidebarMode) {
    settings.store.hideGuildSidebar = mode === "channels" || mode === "none";
    settings.store.hideChannelList = mode === "guilds" || mode === "none";
    document.body.classList.toggle("vc-channelTabs-hideGuilds", settings.store.hideGuildSidebar);
    document.body.classList.toggle("vc-channelTabs-hideChannels", settings.store.hideChannelList);
    syncHeaderToggles();
    notify();
}

/** Cycle: all → guilds only → channels only → none → all */
function cycleSidebars() {
    const mode = getSidebarMode();
    const next: Record<SidebarMode, SidebarMode> = {
        all: "guilds",
        guilds: "channels",
        channels: "none",
        none: "all",
    };
    setSidebarMode(next[mode]);
}

// ─── Keybinds ────────────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
    if (!e.ctrlKey || e.altKey || e.metaKey) return;

    // Don't intercept when typing in text inputs (except Ctrl+Tab which is always captured)
    const target = e.target as HTMLElement;
    const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA"
        || target.getAttribute("role") === "textbox" || target.isContentEditable;

    // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs (takes precedence over everything)
    if (e.code === "Tab" && tabs.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) prevTab(); else nextTab();
        return;
    }

    // Ctrl+` — cycle sidebar visibility (skip in text inputs)
    if (e.code === "Backquote" && !e.shiftKey && !isTextInput) {
        e.preventDefault();
        cycleSidebars();
        return;
    }

    // Remaining shortcuts require Ctrl+Shift and not in text inputs
    if (!e.shiftKey || isTextInput) return;

    switch (e.code) {
        case "KeyW":
            e.preventDefault();
            if (activeTabIndex >= 0) closeTab(activeTabIndex);
            break;
        case "BracketRight":
            e.preventDefault();
            nextTab();
            break;
        case "BracketLeft":
            e.preventDefault();
            prevTab();
            break;
        case "Digit1": case "Digit2": case "Digit3":
        case "Digit4": case "Digit5": case "Digit6":
        case "Digit7": case "Digit8": case "Digit9": {
            e.preventDefault();
            const num = parseInt(e.code.replace("Digit", "")) - 1;
            if (num < tabs.length) {
                activateTab(num);
                navigateTo(tabs[num]);
            }
            break;
        }
    }
}

// ─── React root ──────────────────────────────────────────────────────────

function QuickAccessBar() {
    const [, forceUpdate] = useState(0);
    useEffect(() => subscribe(() => forceUpdate(n => n + 1)), []);

    const onActivate = useCallback((tab: Tab) => {
        const prevIndex = activeTabIndex;
        const idx = tabs.findIndex(t => t.id === tab.id);
        if (idx !== -1) activateTab(idx);
        navigateTo(tab, prevIndex);
    }, []);

    const onToggleGuilds = useCallback(() => { toggleGuilds(); }, []);
    const onToggleChannels = useCallback(() => { toggleChannels(); }, []);
    const onSetSidebarMode = useCallback((mode: SidebarMode) => { setSidebarMode(mode); }, []);

    if (tabs.length === 0) return null;

    return (
        <ErrorBoundary>
            <div style={getStyleVars() as any}>
                <TabBar
                    showServerIcon={settings.store.showServerIcon}
                    onActivate={onActivate}
                    tabs={tabs}
                    activeTabIndex={activeTabIndex}
                    onClose={closeTab}
                    onCloseOthers={closeOtherTabs}
                    onCloseToLeft={closeTabsToLeft}
                    onCloseToRight={closeTabsToRight}
                    onPin={pinTab}
                    onMove={moveTab}
                    onMarkAsRead={markTabAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onMarkOthersAsRead={markOthersAsRead}
                    onMarkToLeftAsRead={markToLeftAsRead}
                    onMarkToRightAsRead={markToRightAsRead}
                    hideGuilds={settings.store.hideGuildSidebar}
                    hideChannels={settings.store.hideChannelList}
                    showSidebarToggles={settings.store.showSidebarToggles}
                    enrichedHeader={settings.store.enrichedHeader}
                    onToggleGuilds={onToggleGuilds}
                    onToggleChannels={onToggleChannels}
                    onSetSidebarMode={onSetSidebarMode}
                    onNewTab={openQuickSwitcher}
                    onOpenSettings={openChannelTabsSettings}
                    doubleClickAction={settings.store.doubleClickAction ?? "pin"}
                />
            </div>
        </ErrorBoundary>
    );
}

// ─── DOM injection ───────────────────────────────────────────────────────

let containerEl: HTMLDivElement | null = null;
let reactRoot: any = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Enriched header state ──────────────────────────────────────────────
let enrichedHeaderActive = false;
let headerObserver: MutationObserver | null = null;
let relocatedElements: { element: HTMLElement; originalParent: HTMLElement; originalNextSibling: Node | null; }[] = [];
let injectedElements: HTMLElement[] = [];

function findVisibleTitleBar(): HTMLElement | null {
    const bars = document.querySelectorAll('[class*="base_"] > [class*="bar_"]');
    for (const bar of bars) {
        if (!bar.className.includes("systemBar")) return bar as HTMLElement;
    }
    return null;
}

function findChannelHeaderChildren(): HTMLElement | null {
    // Always get from upperContainer (the fresh one), not from title bar (stale relocated one)
    return document.querySelector('[class*="upperContainer__"] > [class*="children__"]') as HTMLElement | null;
}

function findChannelHeaderToolbar(): HTMLElement | null {
    return document.querySelector('[class*="upperContainer__"] > [class*="toolbar__"]') as HTMLElement | null;
}

/** Find toolbar wherever it is — in title bar (after relocation) or upperContainer (before) */
function findToolbarAnywhere(): HTMLElement | null {
    // Check title bar first (after relocation)
    const titleBar = findVisibleTitleBar();
    if (titleBar) {
        const inBar = titleBar.querySelector(':scope > [class*="toolbar__"]') as HTMLElement | null;
        if (inBar) return inBar;
    }
    // Fall back to upperContainer (before relocation)
    return document.querySelector('[class*="upperContainer__"] > [class*="toolbar__"]') as HTMLElement | null;
}

function createHeaderToggles(): HTMLElement {
    const container = document.createElement("div");
    container.className = "vc-channelTabs-headerToggles";
    const mode = getSidebarMode();

    // Button click handler: clicking the active mode goes to "none", otherwise sets that mode
    function modeClick(targetMode: SidebarMode) {
        setSidebarMode(getSidebarMode() === targetMode ? "none" : targetMode);
    }

    // Guilds-only button (left panel icon)
    const guildBtn = document.createElement("span");
    guildBtn.className = `vc-channelTabs-toggleBtn${mode === "guilds" ? " vc-channelTabs-toggleBtn-active" : ""}`;
    guildBtn.title = "Show guilds only";
    guildBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm12 0H10V4h10v16z"/></svg>';
    guildBtn.addEventListener("click", () => modeClick("guilds"));

    // Show-all button (both panels icon)
    const allBtn = document.createElement("span");
    allBtn.className = `vc-channelTabs-toggleBtn${mode === "all" ? " vc-channelTabs-toggleBtn-active" : ""}`;
    allBtn.title = "Show all sidebars";
    allBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm6 0h-4V4h4v16zm6 0h-4V4h4v16z"/></svg>';
    allBtn.addEventListener("click", () => modeClick("all"));

    // Channels-only button (right panel/list icon)
    const channelBtn = document.createElement("span");
    channelBtn.className = `vc-channelTabs-toggleBtn${mode === "channels" ? " vc-channelTabs-toggleBtn-active" : ""}`;
    channelBtn.title = "Show channels only";
    channelBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>';
    channelBtn.addEventListener("click", () => modeClick("channels"));

    container.appendChild(guildBtn);
    container.appendChild(allBtn);
    container.appendChild(channelBtn);
    return container;
}

function createBreadcrumb(): HTMLElement | null {
    if (settings.store.guildNameStyle !== "breadcrumb") return null;

    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) return null;

    let guild: any;
    try { guild = GuildStore.getGuild(guildId); } catch { return null; }
    if (!guild) return null;

    const container = document.createElement("span");
    container.className = "vc-channelTabs-headerBreadcrumb";

    if (guild.icon) {
        const img = document.createElement("img");
        img.src = `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.webp?size=32`;
        img.alt = "";
        container.appendChild(img);
    }

    const name = document.createElement("span");
    name.textContent = guild.name;
    container.appendChild(name);

    const sep = document.createElement("span");
    sep.className = "vc-channelTabs-headerBreadcrumb-separator";
    sep.textContent = "›";
    container.appendChild(sep);

    return container;
}

function relocateChannelHeader() {
    // Clean up any previous relocation
    undoRelocation();

    const titleBar = findVisibleTitleBar();
    if (!titleBar) return;

    const titleBarLeading = titleBar.querySelector(':scope > [class*="leading"]') as HTMLElement | null;
    const titleBarTitle = titleBar.querySelector(':scope > [class*="title_"]') as HTMLElement | null;
    const titleBarTrailing = titleBar.querySelector(':scope > [class*="trailing"]') as HTMLElement | null;

    const channelChildren = findChannelHeaderChildren();
    const channelToolbar = findChannelHeaderToolbar();

    // Save original positions for cleanup
    function savePosition(el: HTMLElement) {
        relocatedElements.push({
            element: el,
            originalParent: el.parentElement!,
            originalNextSibling: el.nextSibling,
        });
    }

    function createDivider(): HTMLElement {
        const div = document.createElement("div");
        div.className = "vc-channelTabs-headerDivider";
        injectedElements.push(div);
        return div;
    }

    const toggles = settings.store.showSidebarToggles ? createHeaderToggles() : null;
    if (toggles) injectedElements.push(toggles);

    const breadcrumb = createBreadcrumb();
    if (breadcrumb) injectedElements.push(breadcrumb);

    const isLeft = settings.store.sidebarTogglePosition === "left";

    // The insertion reference point: we insert things BEFORE titleBarTitle (or trailing if no title)
    const insertBeforeRef = titleBarTitle || titleBarTrailing;

    // 1. Insert sidebar toggles after leading
    if (isLeft && toggles && insertBeforeRef) {
        titleBar.insertBefore(createDivider(), insertBeforeRef);
        titleBar.insertBefore(toggles, insertBeforeRef);
    }

    // 2. Insert breadcrumb (replaces guild name display)
    if (breadcrumb && insertBeforeRef) {
        titleBar.insertBefore(createDivider(), insertBeforeRef);
        titleBar.insertBefore(breadcrumb, insertBeforeRef);
    }

    // 3. Hide the original title section (guild name) — we show breadcrumb instead (or nothing)
    if (titleBarTitle) {
        savePosition(titleBarTitle);
        titleBarTitle.style.display = "none";
    }

    // 4. Move channel header children (icon, name, topic) into title bar before trailing
    if (channelChildren && titleBarTrailing) {
        savePosition(channelChildren);
        titleBar.insertBefore(channelChildren, titleBarTrailing);
    }

    // 5. Move channel header toolbar (threads, pins, members, search) into title bar before trailing
    if (channelToolbar && titleBarTrailing) {
        savePosition(channelToolbar);
        titleBar.insertBefore(channelToolbar, titleBarTrailing);
    }

    // 6. Right position: toggles go before trailing
    if (!isLeft && toggles && titleBarTrailing) {
        titleBar.insertBefore(createDivider(), titleBarTrailing);
        titleBar.insertBefore(toggles, titleBarTrailing);
    }

    // Add transparent drag overlay to the title bar
    titleBar.style.position = "relative";
    const dragOverlay = document.createElement("div");
    dragOverlay.className = "vc-channelTabs-dragOverlay";
    titleBar.appendChild(dragOverlay);
    injectedElements.push(dragOverlay);

    // Apply body class to trigger CSS (hide channel header)
    document.body.classList.add("vc-channelTabs-enrichedHeader");
    enrichedHeaderActive = true;

    // Setup responsive overflow for toolbar
    setupOverflow();
}

function undoRelocation() {
    teardownOverflow();

    // Restore title bar position
    const titleBar = findVisibleTitleBar();
    if (titleBar) titleBar.style.position = "";

    // Restore relocated elements to their original positions
    for (const { element, originalParent, originalNextSibling } of relocatedElements) {
        element.style.display = "";
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
            originalParent.insertBefore(element, originalNextSibling);
        } else {
            originalParent.appendChild(element);
        }
    }
    relocatedElements = [];

    // Remove injected elements
    for (const el of injectedElements) {
        el.remove();
    }
    injectedElements = [];

    document.body.classList.remove("vc-channelTabs-enrichedHeader");
    enrichedHeaderActive = false;
}

function updateBreadcrumb() {
    if (!enrichedHeaderActive || settings.store.guildNameStyle !== "breadcrumb") return;

    // Remove old breadcrumb
    const old = document.querySelector('.vc-channelTabs-headerBreadcrumb');
    if (old) {
        injectedElements = injectedElements.filter(el => el !== old);
        old.remove();
    }

    const newBreadcrumb = createBreadcrumb();
    if (!newBreadcrumb) return;

    injectedElements.push(newBreadcrumb);

    // Insert before channel children in title bar
    const channelChildren = findChannelHeaderChildren();
    if (channelChildren && channelChildren.parentElement) {
        channelChildren.parentElement.insertBefore(newBreadcrumb, channelChildren);
    }
}

// ─── Toolbar overflow ────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null;
let overflowBtn: HTMLElement | null = null;
let overflowMenu: HTMLElement | null = null;
let overflowCloseHandler: ((e: MouseEvent) => void) | null = null;

function setupOverflow() {
    const titleBar = findVisibleTitleBar();
    const toolbar = findToolbarAnywhere();
    if (!titleBar || !toolbar) return;

    // Create the ... overflow button (initially hidden)
    overflowBtn = document.createElement("div");
    overflowBtn.className = "vc-channelTabs-overflowBtn";
    overflowBtn.textContent = "···";
    overflowBtn.style.display = "none";
    overflowBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleOverflowMenu();
    });
    injectedElements.push(overflowBtn);

    // Insert overflow button right after toolbar
    if (toolbar.nextSibling) {
        titleBar.insertBefore(overflowBtn, toolbar.nextSibling);
    } else {
        titleBar.appendChild(overflowBtn);
    }

    // Observe title bar width changes
    resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => updateOverflow());
    });
    resizeObserver.observe(titleBar);

    // Initial check
    updateOverflow();
}

function updateOverflow() {
    const titleBar = findVisibleTitleBar();
    const toolbar = findToolbarAnywhere();
    if (!titleBar || !toolbar || !overflowBtn) return;

    const toolbarItems = Array.from(toolbar.children) as HTMLElement[];

    // Show all items and hide overflow btn to measure true widths
    toolbarItems.forEach(item => { item.style.display = ""; });
    overflowBtn.style.display = "none";

    // Measure everything in a single read pass (no interleaved writes)
    const barWidth = titleBar.getBoundingClientRect().width;
    const threshold = barWidth * OVERFLOW_THRESHOLD;

    // Measure each title bar child width
    const childWidths = new Map<HTMLElement, number>();
    let totalWidth = 0;
    for (const child of Array.from(titleBar.children) as HTMLElement[]) {
        if (child.style.display === "none") continue;
        const w = child.getBoundingClientRect().width;
        childWidths.set(child, w);
        totalWidth += w;
    }

    // Measure individual toolbar item widths
    const itemWidths = toolbarItems.map(item => item.getBoundingClientRect().width);

    // If everything fits, no overflow needed
    if (totalWidth <= threshold) {
        if (overflowMenu) { overflowMenu.remove(); overflowMenu = null; }
        return;
    }

    // Show overflow button and account for its width
    overflowBtn.style.display = "";
    const btnWidth = overflowBtn.getBoundingClientRect().width;
    totalWidth += btnWidth;

    // Single write pass: hide toolbar items from the end until things fit
    for (let i = toolbarItems.length - 1; i >= 0; i--) {
        toolbarItems[i].style.display = "none";
        totalWidth -= itemWidths[i];
        if (totalWidth <= threshold) break;
    }
}

function toggleOverflowMenu() {
    if (overflowMenu) {
        overflowMenu.remove();
        overflowMenu = null;
        return;
    }

    const toolbar = findToolbarAnywhere();
    if (!toolbar || !overflowBtn) return;

    overflowMenu = document.createElement("div");
    overflowMenu.className = "vc-channelTabs-overflowMenu";

    // Position below the overflow button
    const btnRect = overflowBtn.getBoundingClientRect();
    overflowMenu.style.top = `${btnRect.bottom + 4}px`;
    overflowMenu.style.right = `${window.innerWidth - btnRect.right}px`;

    // Add channel topic as first menu item if it exists (hidden via CSS in enriched header)
    const topicEl = document.querySelector('[class*="topic__"]') as HTMLElement | null;
    if (topicEl) {
        const topicText = topicEl.textContent?.trim();
        if (topicText) {
            const topicItem = document.createElement("div");
            topicItem.className = "vc-channelTabs-overflowTopic";
            topicItem.textContent = topicText;
            topicItem.addEventListener("click", (e) => {
                e.stopPropagation();
                topicEl.click();
                overflowMenu?.remove();
                overflowMenu = null;
            });
            overflowMenu.appendChild(topicItem);

            const sep = document.createElement("div");
            sep.className = "vc-channelTabs-contextMenu-separator";
            overflowMenu.appendChild(sep);
        }
    }

    // Build menu items from hidden toolbar items
    const toolbarItems = Array.from(toolbar.children) as HTMLElement[];
    for (const item of toolbarItems) {
        if (item.style.display === "none") {
            const label = item.getAttribute('aria-label')
                || item.querySelector('[aria-label]')?.getAttribute('aria-label') || '';

            const menuItem = document.createElement("div");
            menuItem.className = "vc-channelTabs-overflowMenuItem";

            // For search items, use a simple search icon instead of cloning the full search UI
            const isSearch = (typeof item.className === "string" && item.className.includes("search"));
            if (isSearch) {
                menuItem.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.71 20.29 18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0 1 1 0 0 0 0-1.39ZM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Z"/></svg>';
            } else {
                // Extract the SVG icon from the original item
                const svg = item.querySelector('svg');
                if (svg) {
                    const iconClone = svg.cloneNode(true) as SVGElement;
                    iconClone.setAttribute("width", "18");
                    iconClone.setAttribute("height", "18");
                    menuItem.appendChild(iconClone);
                }
            }

            // Add label text
            const labelSpan = document.createElement("span");
            labelSpan.textContent = label || (isSearch ? "Search" : "");
            if (labelSpan.textContent) menuItem.appendChild(labelSpan);

            menuItem.addEventListener("click", (e) => {
                e.stopPropagation();
                // Trigger click on the original hidden item
                (item.querySelector('[role="button"], button, a') as HTMLElement)?.click?.()
                    || item.click();
                overflowMenu?.remove();
                overflowMenu = null;
            });
            overflowMenu.appendChild(menuItem);
        }
    }

    document.body.appendChild(overflowMenu);

    // Close on outside click
    if (overflowCloseHandler) document.removeEventListener("mousedown", overflowCloseHandler);
    overflowCloseHandler = (e: MouseEvent) => {
        if (overflowMenu && !overflowMenu.contains(e.target as Node) && e.target !== overflowBtn) {
            overflowMenu.remove();
            overflowMenu = null;
            if (overflowCloseHandler) { document.removeEventListener("mousedown", overflowCloseHandler); overflowCloseHandler = null; }
        }
    };
    document.addEventListener("mousedown", overflowCloseHandler);
}

function teardownOverflow() {
    if (overflowCloseHandler) { document.removeEventListener("mousedown", overflowCloseHandler); overflowCloseHandler = null; }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (overflowMenu) {
        overflowMenu.remove();
        overflowMenu = null;
    }
    // Restore hidden toolbar items
    const toolbar = findToolbarAnywhere();
    if (toolbar) {
        Array.from(toolbar.children).forEach((item) => {
            (item as HTMLElement).style.display = "";
        });
    }
    overflowBtn = null;
}

function setupHeaderObserver() {
    if (headerObserver) return;

    // Observe the page_ container (narrower than base_) for channel header changes
    const page = document.querySelector('[class*="page_"]');
    if (!page) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    headerObserver = new MutationObserver(() => {
        if (!enrichedHeaderActive) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            const freshChildren = findChannelHeaderChildren();
            if (freshChildren) {
                relocateChannelHeader();
            }
        }, 150);
    });

    headerObserver.observe(page, { childList: true, subtree: true });
}

function teardownHeaderObserver() {
    if (headerObserver) {
        headerObserver.disconnect();
        headerObserver = null;
    }
}

function repositionTabBar() {
    if (!containerEl) return;
    // CSS order handles actual positioning — just toggle the class
    const isBottom = settings.store.tabBarPosition === "bottom";
    containerEl.classList.toggle("vc-channelTabs-bottom", isBottom);
    notify();
}

function injectUI() {
    // Inject into page_ (persists across Home/Friends/Chat views).
    // Switch page_ from flex-row to flex-column, tab bar on top or bottom,
    // existing children get flex:1 to fill remaining space.
    const page = document.querySelector('[class*="page_"]') as HTMLElement;
    if (!page) {
        retryTimeout = setTimeout(injectUI, 1000);
        return;
    }

    // Set existing children to fill space before changing direction
    for (const child of Array.from(page.children)) {
        (child as HTMLElement).style.flex = "1";
        (child as HTMLElement).style.minHeight = "0";
    }

    page.style.flexDirection = "column";

    containerEl = document.createElement("div");
    containerEl.id = "vc-channelTabs-container";
    // CSS order handles top/bottom positioning — just append and set class
    containerEl.classList.toggle("vc-channelTabs-bottom", settings.store.tabBarPosition === "bottom");
    page.appendChild(containerEl);

    reactRoot = createRoot(containerEl);
    reactRoot.render(<QuickAccessBar />);
    logger.info("Quick access bar injected");
}

function removeUI() {
    if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
    if (reactRoot) { try { reactRoot.unmount(); } catch { } reactRoot = null; }
    if (containerEl) {
        const page = containerEl.parentElement;
        containerEl.remove();
        containerEl = null;
        // Restore page_ layout
        if (page) {
            page.style.flexDirection = "";
            for (const child of Array.from(page.children)) {
                (child as HTMLElement).style.flex = "";
                (child as HTMLElement).style.minHeight = "";
            }
        }
    }
}

// ─── Flux handlers ───────────────────────────────────────────────────────

/** Guard: when we're navigating via tab click, ignore CHANNEL_SELECT echoes */
let navigating = false;
/** Suppress CHANNEL_SELECT during startup so restored tabs aren't disrupted */
let startupGuard = false;

function onChannelSelect(data: { channelId: string | null; guildId: string | null; }) {
    if (navigating || startupGuard) return;

    // Deactivate any virtual tab when the user navigates via Discord's UI
    deactivateVirtualTab();

    if (data.channelId) {
        openTab(data.channelId, data.guildId);
    } else {
        // channelId is null — check if this is a known route
        const path = window.location.pathname;
        if (ROUTE_TAB_CONFIG[path]) {
            openRouteTab(path);
        }
    }

    // Update breadcrumb if enriched header is active
    updateBreadcrumb();
}

function onUnreadUpdate() { notify(); }

function onMessageCreate(data: { message: { author: { id: string; }; mentions?: { id: string; }[]; }; channelId: string; }) {
    try {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId || data.message.author.id === currentUserId) {
            notify();
            return;
        }

        const channel = ChannelStore.getChannel(data.channelId);
        if (channel) {
            if (settings.store.autoOpenDMs && channel.isDM?.()) {
                openTabBackground(data.channelId, null);
            }
            if (settings.store.autoOpenMentions && data.message.mentions?.some(u => u.id === currentUserId)) {
                openTabBackground(data.channelId, channel.guild_id ?? null);
            }
        }
    } catch { }

    notify();
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => { saveTimeout = null; saveTabs(); }, 500);
}

// ─── Plugin ──────────────────────────────────────────────────────────────

const plugin = definePlugin({
    name: "ChannelTabs",
    description: "Quick-access tab bar for channels and DMs",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("ChannelTabs")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        window.__channelTabs = {
            registerRoute: registerExternalRoute,
            unregisterRoute: unregisterExternalRoute,
            openRoute: (path: string) => openRouteTab(path, true),
            closeRoute: closeExternalRoute,
        };

        (window as any).__settingsHub?.register(createChannelTabsSchema(settings));

        restoreTabs();
        patchNavigation();
        injectUI();

        // Apply sidebar visibility settings
        document.body.classList.toggle("vc-channelTabs-hideGuilds", settings.store.hideGuildSidebar);
        document.body.classList.toggle("vc-channelTabs-hideChannels", settings.store.hideChannelList);

        // Enriched header — DOM relocation
        if (settings.store.enrichedHeader) {
            // Apply nav button style
            const navStyle = settings.store.navButtonsStyle;
            if (navStyle === "compact") document.body.classList.add("vc-channelTabs-navCompact");
            else if (navStyle === "hidden") document.body.classList.add("vc-channelTabs-navHidden");

            // Delay to ensure Discord's UI is fully rendered
            setTimeout(() => {
                relocateChannelHeader();
                setupHeaderObserver();
            }, 1000);
        }

        document.addEventListener("keydown", onKeyDown, true);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("CHANNEL_ACK", onUnreadUpdate);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", onUnreadUpdate);
        FluxDispatcher.subscribe("TYPING_START", onUnreadUpdate);
        FluxDispatcher.subscribe("TYPING_STOP", onUnreadUpdate);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onUnreadUpdate);
        FluxDispatcher.subscribe("CALL_UPDATE", onUnreadUpdate);
        // Open current channel/route if no tabs restored
        if (tabs.length === 0) {
            const ch = SelectedChannelStore.getChannelId();
            if (ch) {
                openTab(ch, SelectedGuildStore.getGuildId());
            } else {
                const path = window.location.pathname;
                if (ROUTE_TAB_CONFIG[path]) openRouteTab(path);
            }
        }

        logger.info("ChannelTabs started");
    },

    stop() {
        delete window.__channelTabs;
        (window as any).__settingsHub?.unregister("ChannelTabs");
        document.removeEventListener("keydown", onKeyDown, true);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("CHANNEL_ACK", onUnreadUpdate);
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onUnreadUpdate);
        FluxDispatcher.unsubscribe("TYPING_START", onUnreadUpdate);
        FluxDispatcher.unsubscribe("TYPING_STOP", onUnreadUpdate);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onUnreadUpdate);
        FluxDispatcher.unsubscribe("CALL_UPDATE", onUnreadUpdate);
        if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
        saveTabs(); // flush pending save

        teardownHeaderObserver();
        if (enrichedHeaderActive) undoRelocation();

        unpatchNavigation();
        removeUI();
        resetState();
        document.body.classList.remove("vc-channelTabs-hideGuilds", "vc-channelTabs-hideChannels", "vc-channelTabs-navCompact", "vc-channelTabs-navHidden");

        logger.info("ChannelTabs stopped");
    },
});

export default plugin;
