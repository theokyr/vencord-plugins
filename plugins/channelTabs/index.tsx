/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

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
    NavigationRouter,
    ReadStateStore,
    SelectedChannelStore,
    SelectedGuildStore,
    useCallback,
    useEffect,
    useMemo,
    UserStore,
    useState,
} from "@webpack/common";

import { TabBar, animatedCloseTab, shakeTab, resetTabBarState } from "./tabBar";
import { ROUTE_ICONS } from "./tabMeta";
import { openTabContextMenu, openGroupContextMenu, openChildContextMenu, initNativeMenus, cleanupNativeMenus, registerContextMenuPatches, unregisterContextMenuPatches, type TabActionHandlers, type GroupActionHandlers, type ChildActionHandlers } from "./contextMenu";
import type { Tab, ChannelTab, RouteTab } from "./types";
import { isGroupTab, type GroupTab } from "./types";
import { GroupNamePrompt } from "./groupNamePrompt";

import {
    createGroup as _createGroup,
    addToGroup as _addToGroup,
    removeFromGroup as _removeFromGroup,
    dissolveGroup as _dissolveGroup,
    closeGroup as _closeGroup,
    moveToGroup as _moveToGroup,
    pinGroup as _pinGroup,
    moveWithinGroup as _moveWithinGroup,
    pinChildInGroup as _pinChildInGroup,
    renameGroupInState as _renameGroup,
    setGroupColorInState as _setGroupColor,
    toggleCollapsedInState as _toggleCollapsed,
    findTabLocation,
    type TabState,
} from "./groupState";
import type { ContextMenuMode } from "./contextMenuConfig";
import { createMultiSelect, toggleSelect, rangeSelect, clearSelection, getSelectedIndices, type MultiSelectState } from "./multiSelect";
import { findByPropsLazy, findLazy } from "@webpack";

const AckUtils = findByPropsLazy("ack") as { ack: (channelId: string, messageId: string) => void; };

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

/** Registry for virtual tab context menu builders */
const routeContextMenuBuilders = new Map<string, () => React.ReactElement[]>();

export function registerRouteContextMenu(path: string, builder: () => React.ReactElement[]) {
    routeContextMenuBuilders.set(path, builder);
}

export function unregisterRouteContextMenu(path: string) {
    routeContextMenuBuilders.delete(path);
}

export function getRouteContextMenuBuilder(path: string): (() => React.ReactElement[]) | undefined {
    return routeContextMenuBuilders.get(path);
}

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
    /** Register custom context menu items for a virtual tab route */
    registerRouteContextMenu(path: string, builder: () => React.ReactElement[]): void;
    /** Unregister custom context menu items for a virtual tab route */
    unregisterRouteContextMenu(path: string): void;
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
let activeChildIndex: number | null = null;
let idCounter = 0;
const listeners = new Set<() => void>();
let restoreTimer1: ReturnType<typeof setTimeout> | undefined;
let restoreTimer2: ReturnType<typeof setTimeout> | undefined;

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

// ─── Group operations ───────────────────────────────────────────────────

function getTabState(): TabState {
    return { tabs, activeTabIndex, activeChildIndex };
}

function applyTabState(state: TabState) {
    tabs = state.tabs;
    activeTabIndex = state.activeTabIndex;
    activeChildIndex = state.activeChildIndex;
    notify();
    scheduleSave();
}

function createGroupFromIndices(indices: number[], name: string, color: string | null = null) {
    const groupId = `tab-${++idCounter}`;
    applyTabState(_createGroup(getTabState(), indices, groupId, name, color));
}

function addTabToGroup(tabId: string, groupId: string) {
    applyTabState(_addToGroup(getTabState(), tabId, groupId));
}

function removeTabFromGroup(tabId: string) {
    const emptyBehavior = settings.store.emptyGroupBehavior ?? "dissolve";
    applyTabState(_removeFromGroup(getTabState(), tabId, emptyBehavior as "dissolve" | "keep"));
}

function dissolveGroupById(groupId: string) {
    applyTabState(_dissolveGroup(getTabState(), groupId));
}

function closeGroupById(groupId: string) {
    const group = tabs.find(t => t.id === groupId);
    if (group && isGroupTab(group)) {
        for (const child of group.children) {
            if (child.type === "route") {
                externalRouteCallbacks.get(child.path)?.onDeactivate?.();
            }
        }
    }
    applyTabState(_closeGroup(getTabState(), groupId));
    const tab = tabs[activeTabIndex];
    if (tab) navigateTo(tab);
}

function moveTabToGroup(tabId: string, targetGroupId: string) {
    const emptyBehavior = settings.store.emptyGroupBehavior ?? "dissolve";
    applyTabState(_moveToGroup(getTabState(), tabId, targetGroupId, emptyBehavior as "dissolve" | "keep"));
}

function toggleGroupPin(groupId: string) {
    applyTabState(_pinGroup(getTabState(), groupId));
}

function reorderChildInGroup(groupId: string, from: number, to: number) {
    applyTabState(_moveWithinGroup(getTabState(), groupId, from, to));
}

function toggleChildPin(groupId: string, childId: string) {
    applyTabState(_pinChildInGroup(getTabState(), groupId, childId));
}

function renameGroup(groupId: string, name: string) {
    applyTabState(_renameGroup(getTabState(), groupId, name));
}

function setGroupColor(groupId: string, color: string | null) {
    applyTabState(_setGroupColor(getTabState(), groupId, color));
}

function toggleGroupCollapsed(groupId: string) {
    applyTabState(_toggleCollapsed(getTabState(), groupId));
}

function activateChild(groupIndex: number, childIndex: number) {
    const group = tabs[groupIndex];
    if (!group || !isGroupTab(group) || childIndex < 0 || childIndex >= group.children.length) return;
    activeTabIndex = groupIndex;
    activeChildIndex = childIndex;
    notify();
    scheduleSave();
    navigateTo(group.children[childIndex]);
}

function markGroupAsRead(groupId: string) {
    const group = tabs.find(t => t.id === groupId && isGroupTab(t));
    if (!group || !isGroupTab(group)) return;
    for (const child of group.children) {
        if (child.type === "channel") {
            const lastMsg = ReadStateStore.lastMessageId(child.channelId);
            if (lastMsg) AckUtils.ack(child.channelId, lastMsg);
        }
    }
    notify();
}

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
        "--vc-channelTabs-pinOpacity": String(s.pinIconOpacity),
        "--vc-channelTabs-closeOpacity": String(s.closeIconOpacity),
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
    contextMenuMode: {
        type: OptionType.SELECT,
        description: "Context menu tab action placement",
        options: [
            { label: "Top (above Discord items)", value: "top" },
            { label: "Bottom (below Discord items)", value: "bottom" },
            { label: "Hybrid (per-action)", value: "hybrid", default: true },
        ],
        onChange: notify,
    },
    tabActionConfigs: {
        type: OptionType.STRING,
        description: "Per-action context menu positions (internal, JSON)",
        default: "",
        hidden: true,
    },
    tabsSubmenuPosition: {
        type: OptionType.SELECT,
        description: "Tabs submenu placement when actions are hidden",
        options: [
            { label: "Above Discord items", value: "above" },
            { label: "Below Discord items", value: "below", default: true },
        ],
        onChange: notify,
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
    maxGroupIcons: {
        type: OptionType.SLIDER,
        description: "Max child icons shown on collapsed group chip",
        default: 3,
        markers: [1, 2, 3, 4, 5, 6, 7, 8],
        stickToMarkers: true,
    },
    groupChipStyle: {
        type: OptionType.SELECT,
        description: "Collapsed group chip appearance",
        options: [
            { label: "Compact (name + icons)", value: "compact", default: true },
            { label: "Minimal (name only)", value: "minimal" },
        ],
    },
    emptyGroupBehavior: {
        type: OptionType.SELECT,
        description: "What happens when a group's last tab is removed",
        options: [
            { label: "Dissolve group", value: "dissolve", default: true },
            { label: "Keep empty group", value: "keep" },
        ],
    },
    savedTabs: {
        type: OptionType.STRING,
        description: "Saved tabs (internal)",
        default: "",
        hidden: true,
    },
    // ─── Keybinds (managed by _libKeybindRegistry) ───────────────────
    keybind_nextTab: {
        type: OptionType.STRING,
        description: "Next tab",
        default: "ctrl+Tab",
    },
    keybind_nextTab_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable next tab keybind",
        default: true,
    },
    keybind_prevTab: {
        type: OptionType.STRING,
        description: "Previous tab",
        default: "ctrl+shift+Tab",
    },
    keybind_prevTab_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable previous tab keybind",
        default: true,
    },
    keybind_closeTab: {
        type: OptionType.STRING,
        description: "Close active tab",
        default: "ctrl+KeyW",
    },
    keybind_closeTab_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable close tab keybind",
        default: true,
    },
    keybind_nextTabBracket: {
        type: OptionType.STRING,
        description: "Next tab (bracket)",
        default: "ctrl+shift+BracketRight",
    },
    keybind_nextTabBracket_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable next tab bracket keybind",
        default: false,
    },
    keybind_prevTabBracket: {
        type: OptionType.STRING,
        description: "Previous tab (bracket)",
        default: "ctrl+shift+BracketLeft",
    },
    keybind_prevTabBracket_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable previous tab bracket keybind",
        default: false,
    },
    keybind_tabByNumber: {
        type: OptionType.STRING,
        description: "Activate tab by number (1-9)",
        default: "ctrl+shift",
    },
    keybind_tabByNumber_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable tab-by-number keybinds",
        default: false,
    },
    keybind_groupTabs: {
        type: OptionType.STRING,
        description: "Group selected tabs",
        default: "ctrl+KeyG",
    },
    keybind_groupTabs_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable group tabs keybind",
        default: true,
    },
    keybind_ungroupTabs: {
        type: OptionType.STRING,
        description: "Ungroup selected group",
        default: "ctrl+shift+KeyG",
    },
    keybind_ungroupTabs_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable ungroup tabs keybind",
        default: true,
    },
});

import { DEFAULT_ACTION_CONFIGS, type TabActionConfig } from "./contextMenuConfig";

/** Parse tabActionConfigs from settings, falling back to defaults */
export function getTabActionConfigs(): TabActionConfig[] {
    const raw = settings.store.tabActionConfigs;
    if (!raw) return [...DEFAULT_ACTION_CONFIGS];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { }
    return [...DEFAULT_ACTION_CONFIGS];
}

/** Save tabActionConfigs to settings */
export function setTabActionConfigs(configs: TabActionConfig[]) {
    settings.store.tabActionConfigs = JSON.stringify(configs);
    notify();
}

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
            activeChildIdx: activeChildIndex,
            tabs: tabs.map(t => {
                if (t.type === "route") {
                    return { type: "route", path: t.path, label: t.label, pinned: t.pinned };
                }
                if (t.type === "group") {
                    return {
                        type: "group",
                        name: (t as GroupTab).name,
                        color: (t as GroupTab).color,
                        pinned: t.pinned,
                        collapsed: (t as GroupTab).collapsed,
                        children: (t as GroupTab).children.map(c => {
                            if (c.type === "route") {
                                return { type: "route", path: c.path, label: c.label, pinned: c.pinned };
                            }
                            return { type: "channel", channelId: c.channelId, guildId: c.guildId, pinned: c.pinned };
                        }),
                    };
                }
                return { type: "channel", channelId: (t as any).channelId, guildId: (t as any).guildId, pinned: t.pinned };
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
        const savedChildIdx: number | null = parsed.activeChildIdx ?? null;

        tabs = saved.map((t: any) => {
            if (t.type === "group") {
                const children = (t.children ?? []).map((c: any) => {
                    if (c.type === "route") {
                        return { type: "route" as const, id: `tab-${++idCounter}`, path: c.path, label: c.label, pinned: c.pinned ?? false };
                    }
                    return { type: "channel" as const, id: `tab-${++idCounter}`, channelId: c.channelId, guildId: c.guildId ?? null, pinned: c.pinned ?? false };
                });
                if (children.length === 0 && (settings.store.emptyGroupBehavior ?? "dissolve") === "dissolve") {
                    return null;
                }
                return {
                    type: "group" as const,
                    id: `tab-${++idCounter}`,
                    name: t.name ?? "Group",
                    color: t.color ?? null,
                    pinned: t.pinned ?? false,
                    collapsed: t.collapsed ?? true,
                    children,
                };
            }
            if (t.type === "route") {
                return { type: "route" as const, id: `tab-${++idCounter}`, path: t.path, label: t.label, pinned: t.pinned ?? false };
            }
            // Backwards compat: old tabs have no type field
            return { type: "channel" as const, id: `tab-${++idCounter}`, channelId: t.channelId, guildId: t.guildId ?? null, pinned: t.pinned ?? false };
        }).filter(Boolean) as Tab[];

        activeTabIndex = tabs.length > 0 ? Math.min(savedIndex, tabs.length - 1) : -1;
        activeChildIndex = savedChildIdx;

        // Validate activeChildIndex
        if (activeChildIndex !== null) {
            const activeTab = tabs[activeTabIndex];
            if (!activeTab || !isGroupTab(activeTab) || activeChildIndex >= activeTab.children.length) {
                activeChildIndex = null;
            }
        }

        if (tabs.length > 0) {
            // Block CHANNEL_SELECT during startup so Discord's default navigation
            // (usually Friends) doesn't create a spurious tab
            startupGuard = true;
            restoreTimer1 = setTimeout(() => {
                restoreTimer1 = undefined;
                const tab = tabs[activeTabIndex];
                if (tab && isGroupTab(tab) && activeChildIndex !== null) {
                    navigateTo(tab.children[activeChildIndex]);
                } else if (tab) {
                    navigateTo(tab);
                }
                // Release guard after navigation settles
                restoreTimer2 = setTimeout(() => { restoreTimer2 = undefined; startupGuard = false; }, 200);
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
    activeChildIndex = null;
    startupGuard = false;
    listeners.clear();
    if (notifyRaf) { cancelAnimationFrame(notifyRaf); notifyRaf = 0; }
    if (restoreTimer1) { clearTimeout(restoreTimer1); restoreTimer1 = undefined; }
    if (restoreTimer2) { clearTimeout(restoreTimer2); restoreTimer2 = undefined; }
}

// ─── React root ──────────────────────────────────────────────────────────

function QuickAccessBar() {
    const [, forceUpdate] = useState(0);
    useEffect(() => subscribe(() => forceUpdate(n => n + 1)), []);

    const [multiSelect, setMultiSelect] = useState<MultiSelectState>(() => createMultiSelect());

    const handleMultiSelectToggle = useCallback((index: number, e: React.MouseEvent) => {
        if (e.shiftKey) {
            setMultiSelect(ms => rangeSelect(ms, index, "bar"));
        } else {
            setMultiSelect(ms => toggleSelect(ms, index, "bar"));
        }
    }, []);

    // Name prompt state: { mode: "create", indices } or { mode: "rename", groupId }
    const [namePrompt, setNamePrompt] = useState<{ mode: "create"; indices: number[] } | { mode: "rename"; groupId: string } | null>(null);

    const groupHandlers: GroupActionHandlers = useMemo(() => ({
        onPinGroup: toggleGroupPin,
        onRenameGroup: (groupId: string) => {
            setNamePrompt({ mode: "rename", groupId });
        },
        onSetGroupColor: setGroupColor,
        onMarkGroupRead: markGroupAsRead,
        onCloseGroup: closeGroupById,
        onUngroupTabs: dissolveGroupById,
    }), []);

    const childHandlers: ChildActionHandlers = useMemo(() => ({
        onPinChild: toggleChildPin,
        onRemoveFromGroup: removeTabFromGroup,
        onMoveToGroup: moveTabToGroup,
        onCloseChild: (_groupId: string, childId: string) => {
            removeTabFromGroup(childId);
        },
    }), []);

    const onActivate = useCallback((tab: Tab) => {
        setMultiSelect(ms => clearSelection(ms));
        const prevIndex = activeTabIndex;
        const idx = tabs.findIndex(t => t.id === tab.id);
        if (idx !== -1) activateTab(idx);
        navigateTo(tab, prevIndex);
    }, []);

    const onContextMenu = useCallback((e: React.MouseEvent, idx: number) => {
        const tab = tabs[idx];
        if (!tab) return;
        const actions: TabActionHandlers = {
            onClose: (i: number) => animatedCloseTab(i, closeTab),
            onCloseOthers: closeOtherTabs,
            onCloseToLeft: closeTabsToLeft,
            onCloseToRight: closeTabsToRight,
            onPin: pinTab,
            onMarkAsRead: markTabAsRead,
            onMarkAllAsRead: markAllAsRead,
            onMarkOthersAsRead: markOthersAsRead,
            onMarkToLeftAsRead: markToLeftAsRead,
            onMarkToRightAsRead: markToRightAsRead,
        };
        const mode = (settings.store.contextMenuMode ?? "hybrid") as ContextMenuMode;
        const configs = getTabActionConfigs();
        const submenuPosition = (settings.store.tabsSubmenuPosition ?? "below") as "above" | "below";
        openTabContextMenu(e, tab, idx, actions, mode, configs, submenuPosition);
    }, []);

    const onGroupContextMenu = useCallback((e: React.MouseEvent, idx: number) => {
        const tab = tabs[idx];
        if (!tab || !isGroupTab(tab)) return;
        openGroupContextMenu(e, tab as GroupTab, idx, groupHandlers);
    }, [groupHandlers]);

    const onChildContextMenu = useCallback((e: React.MouseEvent, groupId: string, childIdx: number) => {
        const group = tabs.find(t => t.id === groupId);
        if (!group || !isGroupTab(group)) return;
        const child = (group as GroupTab).children[childIdx];
        if (!child) return;
        const allGroups = tabs.filter(t => isGroupTab(t)) as GroupTab[];
        openChildContextMenu(e, child, childIdx, groupId, allGroups, childHandlers);
    }, [childHandlers]);

    useEffect(() => {
        const handler = () => {
            const selected = getSelectedIndices(multiSelect);
            if (selected.length > 0) {
                setNamePrompt({ mode: "create", indices: selected });
            } else if (activeTabIndex >= 0 && !isGroupTab(tabs[activeTabIndex])) {
                setNamePrompt({ mode: "create", indices: [activeTabIndex] });
            }
        };
        document.addEventListener("channeltabs:group-selected", handler);
        return () => document.removeEventListener("channeltabs:group-selected", handler);
    }, [multiSelect, activeTabIndex]);

    const handleNamePromptConfirm = useCallback((name: string) => {
        if (!namePrompt) return;
        if (namePrompt.mode === "create") {
            createGroupFromIndices(namePrompt.indices, name);
            setMultiSelect(ms => clearSelection(ms));
        } else {
            renameGroup(namePrompt.groupId, name);
        }
        setNamePrompt(null);
    }, [namePrompt]);

    const handleNamePromptCancel = useCallback(() => {
        setNamePrompt(null);
    }, []);

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
                    onPin={pinTab}
                    onMove={moveTab}
                    onContextMenu={onContextMenu}
                    onNewTab={openQuickSwitcher}
                    onOpenSettings={openChannelTabsSettings}
                    doubleClickAction={settings.store.doubleClickAction ?? "pin"}
                    activeChildIndex={activeChildIndex}
                    maxGroupIcons={settings.store.maxGroupIcons}
                    groupChipStyle={settings.store.groupChipStyle}
                    onToggleGroupCollapsed={toggleGroupCollapsed}
                    onActivateChild={activateChild}
                    onCloseChild={(_gid: string, cid: string) => removeTabFromGroup(cid)}
                    onMoveChild={reorderChildInGroup}
                    onPinChild={toggleChildPin}
                    onDropToGroup={addTabToGroup}
                    onDropFromGroup={(_tabId: string, _idx: number) => removeTabFromGroup(_tabId)}
                    onGroupContextMenu={onGroupContextMenu}
                    onChildContextMenu={onChildContextMenu}
                    onCreateGroup={createGroupFromIndices}
                    onAddCurrentTabToGroup={(groupId: string) => {
                        const currentChannel = SelectedChannelStore.getChannelId();
                        if (!currentChannel) return;
                        const currentTab = tabs.find(t => t.type === "channel" && t.channelId === currentChannel);
                        if (currentTab) addTabToGroup(currentTab.id, groupId);
                    }}
                    multiSelectIndices={multiSelect.selected}
                    onMultiSelectToggle={handleMultiSelectToggle}
                />
            </div>
        </ErrorBoundary>
    );
}

// ─── DOM injection ───────────────────────────────────────────────────────

let containerEl: HTMLDivElement | null = null;
let reactRoot: any = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function repositionTabBar() {
    if (!containerEl) return;
    // CSS order handles actual positioning — just toggle the class
    const isBottom = settings.store.tabBarPosition === "bottom";
    containerEl.classList.toggle("vc-channelTabs-bottom", isBottom);
    notify();
}

// ─── Page child flex fix ────────────────────────────────────────────────

let pageChildObserver: MutationObserver | null = null;

/** Original inline height values of page_ children, for restoration in removeUI. */
const originalPageChildHeights = new WeakMap<HTMLElement, string>();

const FIXED_PAGE_CHROME_CHILD_IDS = new Set([
    "vc-channelTabs-container",
    "vc-minimalCallBar-root",
]);

function isFixedPageChromeChild(child: HTMLElement) {
    return FIXED_PAGE_CHROME_CHILD_IDS.has(child.id);
}

/**
 * Apply flex properties to page_ children so they share space with the tab bar.
 * Discord's wrapper divs often have inline `height: 100%` / `width: 100%` which
 * prevents flex-shrink from working in a column layout, causing the chat area to
 * overflow by the tab bar's height and breaking virtual scroll calculations.
 */
function applyPageChildFlex(page: HTMLElement) {
    for (const child of Array.from(page.children) as HTMLElement[]) {
        if (isFixedPageChromeChild(child)) {
            child.style.flex = "";
            child.style.minHeight = "";
            continue;
        }
        // Save original height for restoration
        if (!originalPageChildHeights.has(child)) {
            originalPageChildHeights.set(child, child.style.height);
        }
        child.style.flex = "1";
        child.style.minHeight = "0";
        // Clear height: 100% — flex: 1 handles sizing in column layout
        if (child.style.height === "100%") child.style.height = "auto";
    }
}

function setupPageChildObserver(page: HTMLElement) {
    if (pageChildObserver) return;
    pageChildObserver = new MutationObserver(() => applyPageChildFlex(page));
    pageChildObserver.observe(page, { childList: true });
}

function teardownPageChildObserver() {
    if (pageChildObserver) { pageChildObserver.disconnect(); pageChildObserver = null; }
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

    // Set existing children to fill remaining space. Discord's wrapper often has
    // inline `height: 100%` which overrides flex-shrink in a column layout,
    // causing overflow when the tab bar takes space. Clear it.
    applyPageChildFlex(page);

    page.style.flexDirection = "column";

    containerEl = document.createElement("div");
    containerEl.id = "vc-channelTabs-container";
    // CSS order handles top/bottom positioning — just append and set class
    containerEl.classList.toggle("vc-channelTabs-bottom", settings.store.tabBarPosition === "bottom");
    page.appendChild(containerEl);

    // Watch for Discord re-rendering page_ children (loses our flex fix)
    setupPageChildObserver(page);

    reactRoot = createRoot(containerEl);
    reactRoot.render(<QuickAccessBar />);
    logger.info("Quick access bar injected");
}

function removeUI() {
    if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
    teardownPageChildObserver();
    if (reactRoot) { try { reactRoot.unmount(); } catch { } reactRoot = null; }
    if (containerEl) {
        const page = containerEl.parentElement;
        containerEl.remove();
        containerEl = null;
        // Restore page_ layout
        if (page) {
            page.style.flexDirection = "";
            for (const child of Array.from(page.children)) {
                const el = child as HTMLElement;
                el.style.flex = "";
                el.style.minHeight = "";
                // Restore original inline height (may have been "100%")
                const orig = originalPageChildHeights.get(el);
                el.style.height = orig ?? "";
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
            registerRouteContextMenu,
            unregisterRouteContextMenu,
        };

        // Register keybinds with central registry
        window.__keybindRegistry?.register({
            plugin: "ChannelTabs",
            settings,
            keybinds: {
                nextTab: {
                    action: "Next tab",
                    defaultKeys: "ctrl+Tab",
                    defaultEnabled: true,
                    handler: () => { if (tabs.length > 1) nextTab(); },
                    textInputBehavior: "allow",
                },
                prevTab: {
                    action: "Previous tab",
                    defaultKeys: "ctrl+shift+Tab",
                    defaultEnabled: true,
                    handler: () => { if (tabs.length > 1) prevTab(); },
                    textInputBehavior: "allow",
                },
                closeTab: {
                    action: "Close active tab",
                    defaultKeys: "ctrl+KeyW",
                    defaultEnabled: true,
                    handler: () => {
                        if (activeTabIndex < 0) return;
                        if (tabs[activeTabIndex]?.pinned) shakeTab(activeTabIndex);
                        else animatedCloseTab(activeTabIndex, closeTab);
                    },
                },
                nextTabBracket: {
                    action: "Next tab (bracket)",
                    defaultKeys: "ctrl+shift+BracketRight",
                    defaultEnabled: false,
                    handler: () => nextTab(),
                },
                prevTabBracket: {
                    action: "Previous tab (bracket)",
                    defaultKeys: "ctrl+shift+BracketLeft",
                    defaultEnabled: false,
                    handler: () => prevTab(),
                },
                tabByNumber: {
                    action: "Activate tab by number (1-9)",
                    defaultKeys: "ctrl+shift",
                    defaultEnabled: false,
                    handler: {
                        type: "layer" as const,
                        handler: (_e: KeyboardEvent, digit: number) => {
                            const idx = digit - 1;
                            if (idx < tabs.length) {
                                activateTab(idx);
                                navigateTo(tabs[idx]);
                            }
                        },
                    },
                },
                groupTabs: {
                    action: "Group selected tabs",
                    defaultKeys: "ctrl+KeyG",
                    defaultEnabled: true,
                    handler: () => {
                        document.dispatchEvent(new CustomEvent("channeltabs:group-selected"));
                    },
                    textInputBehavior: "block" as const,
                },
                ungroupTabs: {
                    action: "Ungroup selected group",
                    defaultKeys: "ctrl+shift+KeyG",
                    defaultEnabled: true,
                    handler: () => {
                        const tab = tabs[activeTabIndex];
                        if (tab && isGroupTab(tab)) dissolveGroupById(tab.id);
                    },
                    textInputBehavior: "block" as const,
                },
            },
        });

        (window as any).__settingsHub?.register(createChannelTabsSchema(settings));

        initNativeMenus();
        registerContextMenuPatches();

        restoreTabs();
        patchNavigation();
        injectUI();

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
        unregisterContextMenuPatches();
        cleanupNativeMenus();

        delete window.__channelTabs;
        window.__keybindRegistry?.unregister("ChannelTabs");
        (window as any).__settingsHub?.unregister("ChannelTabs");
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

        unpatchNavigation();
        removeUI();
        resetState();
        resetTabBarState();

        logger.info("ChannelTabs stopped");
    },
});

export default plugin;
