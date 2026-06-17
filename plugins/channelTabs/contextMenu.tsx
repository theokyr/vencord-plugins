/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, ContextMenuApi, FluxDispatcher, Menu, UserStore } from "@webpack/common";

import type { Tab, ChannelTab, GroupTab, LeafTab } from "./types";
import { isGroupTab } from "./types";
import type { ContextMenuMode, TabActionConfig, TabActionId } from "./contextMenuConfig";
import { ACTION_LABELS, HIDDEN_SUBMENU_ORDER, HIDDEN_SUBMENU_SEPARATOR_AFTER, resolveActionPositions } from "./contextMenuConfig";

declare const DiscordNative: {
    clipboard: { copy: (text: string) => void; };
} | undefined;

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC LAYER — extractable to _libContextMenu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find a Discord sidebar element for a given channel and dispatch a synthetic
 * contextmenu event on it. Discord handles rendering — our registered
 * contextMenus patches inject additional items.
 *
 * Returns true if the element was found and the event dispatched.
 */
function dispatchNativeContextMenu(
    channelId: string,
    guildId: string | null,
    clientX: number,
    clientY: number,
): boolean {
    let target: Element | null = null;

    if (!guildId) {
        // DM / Group DM — always in sidebar via href
        target = document.querySelector(`a[href="/channels/@me/${channelId}"]`);
    } else {
        // Guild channel — only in DOM if that guild's channel list is visible
        target = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
    }

    if (!target) return false;

    const event = new MouseEvent("contextmenu", {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    return true;
}

// TODO: remove — no extraction planned
export function initNativeMenus() { }
export function cleanupNativeMenus() { }

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELTABS-SPECIFIC LAYER
// ═══════════════════════════════════════════════════════════════════════════

// ─── Icon SVG paths ──────────────────────────────────────────────────────

export const MENU_ICONS: Record<string, string> = {
    close: "M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z",
    closeOthers: "M13.41 12l4.3-4.29a1 1 0 1 0-1.42-1.42L12 10.59l-4.29-4.3a1 1 0 0 0-1.42 1.42l4.3 4.29-4.3 4.29a1 1 0 1 0 1.42 1.42L12 13.41l4.29 4.3a1 1 0 0 0 1.42-1.42L13.41 12Z",
    closeLeft: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    closeRight: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    pin: "M19.38 11.38a3 3 0 0 0 4.24 0l.03-.03a.5.5 0 0 0 0-.7L13.35.35a.5.5 0 0 0-.7 0l-.03.03a3 3 0 0 0 0 4.24L13 5l-2.92 2.92-3.65-.34a2 2 0 0 0-1.6.58l-.62.63a1 1 0 0 0 0 1.42l9.58 9.58a1 1 0 0 0 1.42 0l.63-.63a2 2 0 0 0 .58-1.6l-.34-3.64L19 11l.38.38ZM9.07 17.07a.5.5 0 0 1-.08.77l-5.15 3.43a.5.5 0 0 1-.63-.06l-.42-.42a.5.5 0 0 1-.06-.63L6.16 15a.5.5 0 0 1 .77-.08l2.14 2.14Z",
    markRead: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    tab: "M3 3h18a1 1 0 0 1 1 1v3H2V4a1 1 0 0 1 1-1zm-1 5h20v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8zm3 3v2h4v-2H5zm0 4v2h6v-2H5z",
    settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z",
};

const MenuIcon = ({ d }: { d: string; }) => (
    <svg className="vc-channelTabs-contextMenu-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ flexShrink: 0 }}>
        <path d={d} />
    </svg>
);

/** Label with left-side icon — wraps text + icon in a flex row */
function IconLabel({ icon, text }: { icon: string; text: string; }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <MenuIcon d={icon} />
            <span>{text}</span>
        </div>
    );
}

// ─── Tab action handlers interface ───────────────────────────────────────

export interface TabActionHandlers {
    onClose: (i: number) => void;
    onCloseOthers: (i: number) => void;
    onCloseToLeft: (i: number) => void;
    onCloseToRight: (i: number) => void;
    onPin: (i: number) => void;
    onMarkAsRead: (i: number) => void;
    onMarkAllAsRead: () => void;
    onMarkOthersAsRead: (i: number) => void;
    onMarkToLeftAsRead: (i: number) => void;
    onMarkToRightAsRead: (i: number) => void;
}

// ─── tabContextSource (module-level flag) ────────────────────────────────

let tabContextSource: {
    index: number;
    tab: Tab;
    actions: TabActionHandlers;
    mode: ContextMenuMode;
    configs: TabActionConfig[];
    submenuPosition: "above" | "below";
} | null = null;

// ─── Action icon mapping ─────────────────────────────────────────────────

const ACTION_ICON_MAP: Record<TabActionId, string> = {
    pin: MENU_ICONS.pin,
    close: MENU_ICONS.close,
    closeOthers: MENU_ICONS.closeOthers,
    closeLeft: MENU_ICONS.closeLeft,
    closeRight: MENU_ICONS.closeRight,
    markRead: MENU_ICONS.markRead,
    markAllRead: MENU_ICONS.markRead,
    markOthersRead: MENU_ICONS.markRead,
    markLeftRead: MENU_ICONS.markRead,
    markRightRead: MENU_ICONS.markRead,
};

// ─── Build action menu items ─────────────────────────────────────────────

function buildActionMenuItem(
    actionId: TabActionId,
    index: number,
    tab: Tab,
    actions: TabActionHandlers,
): React.ReactElement | null {
    const iconPath = ACTION_ICON_MAP[actionId];
    const label = actionId === "pin"
        ? (tab.pinned ? "Unpin" : "Pin")
        : ACTION_LABELS[actionId];

    let handler: () => void;
    switch (actionId) {
        case "pin": handler = () => actions.onPin(index); break;
        case "close": handler = () => actions.onClose(index); break;
        case "closeOthers": handler = () => actions.onCloseOthers(index); break;
        case "closeLeft": handler = () => actions.onCloseToLeft(index); break;
        case "closeRight": handler = () => actions.onCloseToRight(index); break;
        case "markRead": handler = () => actions.onMarkAsRead(index); break;
        case "markAllRead": handler = () => actions.onMarkAllAsRead(); break;
        case "markOthersRead": handler = () => actions.onMarkOthersAsRead(index); break;
        case "markLeftRead": handler = () => actions.onMarkToLeftAsRead(index); break;
        case "markRightRead": handler = () => actions.onMarkToRightAsRead(index); break;
        default: return null;
    }

    return (
        <Menu.MenuItem
            id={`vc-tab-${actionId}`}
            key={`vc-tab-${actionId}`}
            label={<IconLabel icon={iconPath} text={label} />}
            action={handler}
            color={actionId === "close" ? "danger" : undefined}
        />
    );
}

// ─── Build hidden submenu ────────────────────────────────────────────────

function buildHiddenSubmenu(
    hiddenIds: TabActionId[],
    index: number,
    tab: Tab,
    actions: TabActionHandlers,
): React.ReactElement | null {
    if (hiddenIds.length === 0) return null;

    // Sort by HIDDEN_SUBMENU_ORDER
    const sorted = HIDDEN_SUBMENU_ORDER.filter(id => hiddenIds.includes(id));

    const children: React.ReactElement[] = [];
    const closeGroup: React.ReactElement[] = [];
    const markGroup: React.ReactElement[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const item = buildActionMenuItem(sorted[i], index, tab, actions);
        if (!item) continue;
        if (i <= HIDDEN_SUBMENU_SEPARATOR_AFTER) {
            closeGroup.push(item);
        } else {
            markGroup.push(item);
        }
    }

    if (closeGroup.length > 0) {
        children.push(
            <Menu.MenuGroup key="vc-tab-hidden-close">
                {closeGroup}
            </Menu.MenuGroup>
        );
    }
    if (closeGroup.length > 0 && markGroup.length > 0) {
        children.push(<Menu.MenuSeparator key="vc-tab-hidden-sep" />);
    }
    if (markGroup.length > 0) {
        children.push(
            <Menu.MenuGroup key="vc-tab-hidden-mark">
                {markGroup}
            </Menu.MenuGroup>
        );
    }

    return (
        <Menu.MenuItem
            id="vc-tab-submenu"
            key="vc-tab-submenu"
            label={<IconLabel icon={MENU_ICONS.tab} text="Tabs" />}
        >
            {children}
        </Menu.MenuItem>
    );
}

// ─── Build tab action group ──────────────────────────────────────────────

function buildTabActionGroup(
    actionIds: TabActionId[],
    index: number,
    tab: Tab,
    actions: TabActionHandlers,
): React.ReactElement[] {
    return actionIds
        .map(id => buildActionMenuItem(id, index, tab, actions))
        .filter((item): item is React.ReactElement => item !== null);
}

// ─── Context menu patch callback ─────────────────────────────────────────

const injectTabActions: NavContextMenuPatchCallback = (children) => {
    if (!tabContextSource) return;

    // Clear source after injection — the patch fires during render,
    // so we consume the flag exactly once. This prevents stale flags
    // leaking tab actions into subsequent sidebar right-clicks.
    const source = tabContextSource;
    tabContextSource = null;

    const { index, tab, actions, mode, configs, submenuPosition } = source;
    const { above, below, hidden } = resolveActionPositions(mode, configs);

    // Above items + separator at start
    if (above.length > 0) {
        const aboveItems = buildTabActionGroup(above, index, tab, actions);
        children.unshift(
            <Menu.MenuGroup key="vc-tab-above">
                {aboveItems}
            </Menu.MenuGroup>,
            <Menu.MenuSeparator key="vc-tab-above-sep" />,
        );
    }

    // Below items + separator at end
    if (below.length > 0) {
        const belowItems = buildTabActionGroup(below, index, tab, actions);
        children.push(
            <Menu.MenuSeparator key="vc-tab-below-sep" />,
            <Menu.MenuGroup key="vc-tab-below">
                {belowItems}
            </Menu.MenuGroup>,
        );
    }

    // Hidden submenu
    const submenu = buildHiddenSubmenu(hidden, index, tab, actions);
    if (submenu) {
        if (submenuPosition === "above") {
            // Insert after above items (or at start if no above)
            const insertIdx = above.length > 0 ? 2 : 0; // after group + separator
            children.splice(insertIdx, 0, submenu, <Menu.MenuSeparator key="vc-tab-submenu-sep" />);
        } else {
            // Insert before below items (or at end if no below)
            if (below.length > 0) {
                // Find the below separator and insert before it
                const belowSepIdx = children.findIndex(
                    c => c != null && typeof c === "object" && "key" in c && c.key === "vc-tab-below-sep"
                );
                if (belowSepIdx >= 0) {
                    children.splice(belowSepIdx, 0, <Menu.MenuSeparator key="vc-tab-submenu-sep" />, submenu);
                } else {
                    children.push(<Menu.MenuSeparator key="vc-tab-submenu-sep" />, submenu);
                }
            } else {
                children.push(<Menu.MenuSeparator key="vc-tab-submenu-sep" />, submenu);
            }
        }
    }
};

// ─── Patch registration ──────────────────────────────────────────────────

const PATCHED_MENUS = ["user-context", "channel-context", "gdm-context", "thread-context"];

export function registerContextMenuPatches() {
    addContextMenuPatch(PATCHED_MENUS, injectTabActions);
}

export function unregisterContextMenuPatches() {
    removeContextMenuPatch(PATCHED_MENUS, injectTabActions);
}

// ─── Open tab context menu (main orchestrator) ──────────────────────────

export function openTabContextMenu(
    event: React.MouseEvent,
    tab: Tab,
    tabIndex: number,
    actions: TabActionHandlers,
    mode: ContextMenuMode,
    configs: TabActionConfig[],
    submenuPosition: "above" | "below",
    routeMenuBuilder?: () => React.ReactElement[],
) {
    // Set module-level flag so patches can inject tab actions
    tabContextSource = { index: tabIndex, tab, actions, mode, configs, submenuPosition };

    const clearSource = () => { tabContextSource = null; };

    if (tab.type === "channel") {
        // Try to dispatch contextmenu on the corresponding sidebar element.
        // Discord renders its native menu; our contextMenus patches inject tab actions.
        const dispatched = dispatchNativeContextMenu(
            tab.channelId,
            tab.guildId,
            event.clientX,
            event.clientY,
        );

        if (dispatched) {
            // Safety: clear source after a tick if the patch hasn't consumed it
            setTimeout(() => { if (tabContextSource) tabContextSource = null; }, 0);
            return;
        }

        // Sidebar element not found (guild not visible, channel virtualized, etc.)
        openTabActionsOnlyMenu(event, tabIndex, tab, actions, mode, configs, submenuPosition, clearSource);
        return;
    }

    // Route tabs (path starts with /)
    if (tab.type === "route" && tab.path.startsWith("/")) {
        openRouteTabMenu(event, tabIndex, tab, actions, mode, configs, submenuPosition, routeMenuBuilder, clearSource);
        return;
    }

    // Virtual tabs (path starts with @@)
    if (tab.type === "route" && tab.path.startsWith("@@")) {
        openVirtualTabMenu(event, tabIndex, tab, actions, mode, configs, submenuPosition, routeMenuBuilder, clearSource);
        return;
    }

    // Unknown tab type — actions only
    openTabActionsOnlyMenu(event, tabIndex, tab, actions, mode, configs, submenuPosition, clearSource);
}

// ─── Discord action modules (lazy) ──────────────────────────────────────

const UserProfileActions = findByPropsLazy("openUserProfileModal") as {
    openUserProfileModal: (opts: { userId: string; }) => void;
};
const VoiceActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel: (channelId: string) => void;
};
const PrivateChannelActions = findByPropsLazy("closePrivateChannel") as {
    closePrivateChannel: (channelId: string) => void;
};
const GuildSettingsActions = findByPropsLazy("updateChannelOverrideSettings") as {
    updateChannelOverrideSettings: (guildId: string, channelId: string, settings: { muted: boolean; }) => void;
};
const UserGuildSettingsStore = findByPropsLazy("isChannelMuted") as {
    isChannelMuted: (guildId: string | null, channelId: string) => boolean;
};

// ─── Build Discord action items for fallback menus ──────────────────────

function buildDiscordActions(tab: ChannelTab): React.ReactElement[] {
    const channel = ChannelStore.getChannel(tab.channelId);
    if (!channel) return [];

    const items: React.ReactElement[] = [];

    // DM (type 1)
    if (channel.type === 1) {
        const recipientId = channel.recipients?.[0];
        const user = recipientId ? UserStore.getUser(recipientId) : null;

        if (user) {
            items.push(
                <Menu.MenuItem
                    id="vc-discord-profile"
                    key="vc-discord-profile"
                    label="Profile"
                    action={() => UserProfileActions.openUserProfileModal({ userId: user.id })}
                />,
                <Menu.MenuItem
                    id="vc-discord-call"
                    key="vc-discord-call"
                    label="Start a Call"
                    action={() => VoiceActions.selectVoiceChannel(tab.channelId)}
                />,
            );
        }

        items.push(
            <Menu.MenuItem
                id="vc-discord-close-dm"
                key="vc-discord-close-dm"
                label="Close DM"
                action={() => PrivateChannelActions.closePrivateChannel(tab.channelId)}
            />,
        );

        if (recipientId) {
            items.push(
                <Menu.MenuSeparator key="vc-discord-ids-sep" />,
                <Menu.MenuItem
                    id="vc-discord-copy-user-id"
                    key="vc-discord-copy-user-id"
                    label="Copy User ID"
                    action={() => {
                        if (typeof DiscordNative?.clipboard?.copy === "function") DiscordNative.clipboard.copy(recipientId);
                        else navigator.clipboard.writeText(recipientId);
                    }}
                />,
                <Menu.MenuItem
                    id="vc-discord-copy-channel-id"
                    key="vc-discord-copy-channel-id"
                    label="Copy Channel ID"
                    action={() => {
                        if (typeof DiscordNative?.clipboard?.copy === "function") DiscordNative.clipboard.copy(tab.channelId);
                        else navigator.clipboard.writeText(tab.channelId);
                    }}
                />,
            );
        }
        return items;
    }

    // Group DM (type 3)
    if (channel.type === 3) {
        items.push(
            <Menu.MenuItem
                id="vc-discord-call"
                key="vc-discord-call"
                label="Start a Call"
                action={() => VoiceActions.selectVoiceChannel(tab.channelId)}
            />,
            <Menu.MenuSeparator key="vc-discord-ids-sep" />,
            <Menu.MenuItem
                id="vc-discord-copy-channel-id"
                key="vc-discord-copy-channel-id"
                label="Copy Channel ID"
                action={() => {
                    if (typeof DiscordNative?.clipboard?.copy === "function") DiscordNative.clipboard.copy(tab.channelId);
                    else navigator.clipboard.writeText(tab.channelId);
                }}
            />,
        );
        return items;
    }

    // Guild channel (text, voice, etc.)
    if (tab.guildId) {
        const isMuted = UserGuildSettingsStore?.isChannelMuted?.(tab.guildId, tab.channelId) ?? false;
        items.push(
            <Menu.MenuItem
                id="vc-discord-mute"
                key="vc-discord-mute"
                label={isMuted ? "Unmute Channel" : "Mute Channel"}
                action={() => GuildSettingsActions.updateChannelOverrideSettings(tab.guildId!, tab.channelId, { muted: !isMuted })}
            />,
        );

        // Voice channel — offer join
        if (channel.type === 2 || channel.type === 13) {
            items.push(
                <Menu.MenuItem
                    id="vc-discord-join-voice"
                    key="vc-discord-join-voice"
                    label="Join Voice Channel"
                    action={() => VoiceActions.selectVoiceChannel(tab.channelId)}
                />,
            );
        }

        items.push(
            <Menu.MenuSeparator key="vc-discord-ids-sep" />,
            <Menu.MenuItem
                id="vc-discord-copy-channel-id"
                key="vc-discord-copy-channel-id"
                label="Copy Channel ID"
                action={() => {
                    if (typeof DiscordNative?.clipboard?.copy === "function") DiscordNative.clipboard.copy(tab.channelId);
                    else navigator.clipboard.writeText(tab.channelId);
                }}
            />,
        );
        return items;
    }

    return items;
}

// ─── Tab actions only fallback ───────────────────────────────────────────

function openTabActionsOnlyMenu(
    event: React.MouseEvent,
    index: number,
    tab: Tab,
    actions: TabActionHandlers,
    mode: ContextMenuMode,
    configs: TabActionConfig[],
    submenuPosition: "above" | "below",
    onClose: () => void,
) {
    const { above, below, hidden } = resolveActionPositions(mode, configs);
    const discordActions = tab.type === "channel" ? buildDiscordActions(tab) : [];
    const submenu = buildHiddenSubmenu(hidden, index, tab, actions);

    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu
            navId="channelTabs-tab-context"
            onClose={() => {
                FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });
                onClose();
            }}
            aria-label="Tab Context Menu"
        >
            {above.length > 0 && (
                <Menu.MenuGroup>
                    {buildTabActionGroup(above, index, tab, actions)}
                </Menu.MenuGroup>
            )}
            {above.length > 0 && (discordActions.length > 0 || below.length > 0 || submenu) && <Menu.MenuSeparator />}
            {discordActions.length > 0 && (
                <Menu.MenuGroup>
                    {discordActions}
                </Menu.MenuGroup>
            )}
            {discordActions.length > 0 && (below.length > 0 || submenu) && <Menu.MenuSeparator />}
            {submenuPosition === "below" && submenu}
            {submenuPosition === "below" && submenu && below.length > 0 && <Menu.MenuSeparator />}
            {below.length > 0 && (
                <Menu.MenuGroup>
                    {buildTabActionGroup(below, index, tab, actions)}
                </Menu.MenuGroup>
            )}
            {submenuPosition === "above" && below.length > 0 && submenu && <Menu.MenuSeparator />}
            {submenuPosition === "above" && submenu}
        </Menu.Menu>
    ));
}

// ─── Route tab menu ──────────────────────────────────────────────────────

function openRouteTabMenu(
    event: React.MouseEvent,
    index: number,
    tab: Tab & { type: "route"; },
    actions: TabActionHandlers,
    mode: ContextMenuMode,
    configs: TabActionConfig[],
    submenuPosition: "above" | "below",
    routeMenuBuilder: (() => React.ReactElement[]) | undefined,
    onClose: () => void,
) {
    const { above, below, hidden } = resolveActionPositions(mode, configs);
    const allVisible = [...above, ...below];
    const routeItems = routeMenuBuilder?.() ?? [];
    const url = `https://discord.com${tab.path}`;

    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu
            navId="channelTabs-route-context"
            onClose={() => {
                FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });
                onClose();
            }}
            aria-label="Route Tab Context Menu"
        >
            {allVisible.length > 0 && (
                <Menu.MenuGroup>
                    {buildTabActionGroup(allVisible, index, tab, actions)}
                </Menu.MenuGroup>
            )}
            {hidden.length > 0 && <Menu.MenuSeparator />}
            {buildHiddenSubmenu(hidden, index, tab, actions)}
            {routeItems.length > 0 && <Menu.MenuSeparator />}
            {routeItems.length > 0 && (
                <Menu.MenuGroup>
                    {routeItems}
                </Menu.MenuGroup>
            )}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-tab-copy-url"
                key="vc-tab-copy-url"
                label={<IconLabel icon={MENU_ICONS.copy} text="Copy URL" />}
                action={() => {
                    if (typeof DiscordNative?.clipboard?.copy === "function") {
                        DiscordNative.clipboard.copy(url);
                    } else {
                        navigator.clipboard.writeText(url);
                    }
                }}
            />
        </Menu.Menu>
    ));
}

// ─── Virtual tab menu ────────────────────────────────────────────────────

function openVirtualTabMenu(
    event: React.MouseEvent,
    index: number,
    tab: Tab & { type: "route"; },
    actions: TabActionHandlers,
    mode: ContextMenuMode,
    configs: TabActionConfig[],
    submenuPosition: "above" | "below",
    routeMenuBuilder: (() => React.ReactElement[]) | undefined,
    onClose: () => void,
) {
    const { above, below, hidden } = resolveActionPositions(mode, configs);
    const allVisible = [...above, ...below];
    const routeItems = routeMenuBuilder?.() ?? [];

    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu
            navId="channelTabs-virtual-context"
            onClose={() => {
                FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" });
                onClose();
            }}
            aria-label="Virtual Tab Context Menu"
        >
            {allVisible.length > 0 && (
                <Menu.MenuGroup>
                    {buildTabActionGroup(allVisible, index, tab, actions)}
                </Menu.MenuGroup>
            )}
            {hidden.length > 0 && <Menu.MenuSeparator />}
            {buildHiddenSubmenu(hidden, index, tab, actions)}
            {routeItems.length > 0 && <Menu.MenuSeparator />}
            {routeItems.length > 0 && (
                <Menu.MenuGroup>
                    {routeItems}
                </Menu.MenuGroup>
            )}
        </Menu.Menu>
    ));
}

// ─── Group context menu ──────────────────────────────────────────────────

const GROUP_COLORS = [
    { label: "None", value: null as string | null },
    { label: "Red", value: "#ed4245" },
    { label: "Orange", value: "#f97316" },
    { label: "Yellow", value: "#fee75c" },
    { label: "Green", value: "#57f287" },
    { label: "Blue", value: "#5865f2" },
    { label: "Purple", value: "#9b59b6" },
    { label: "Pink", value: "#eb459e" },
    { label: "Teal", value: "#1abc9c" },
];

export interface GroupActionHandlers {
    onPinGroup: (groupId: string) => void;
    onRenameGroup: (groupId: string) => void;
    onSetGroupColor: (groupId: string, color: string | null) => void;
    onMarkGroupRead: (groupId: string) => void;
    onCloseGroup: (groupId: string) => void;
    onUngroupTabs: (groupId: string) => void;
}

export function openGroupContextMenu(
    event: React.MouseEvent,
    group: GroupTab,
    groupIndex: number,
    handlers: GroupActionHandlers,
) {
    ContextMenuApi.openContextMenu(event, () => (
        <Menu.ContextMenu navId="channeltabs-group-context">
            <Menu.MenuItem
                id="pin-group"
                label={group.pinned ? "Unpin Group" : "Pin Group"}
                action={() => handlers.onPinGroup(group.id)}
            />
            <Menu.MenuItem
                id="rename-group"
                label="Rename Group"
                action={() => handlers.onRenameGroup(group.id)}
            />
            <Menu.MenuItem
                id="change-color"
                label="Change Color"
            >
                {GROUP_COLORS.map(c => (
                    <Menu.MenuItem
                        key={c.value ?? "none"}
                        id={`color-${c.value ?? "none"}`}
                        label={c.label}
                        action={() => handlers.onSetGroupColor(group.id, c.value)}
                    />
                ))}
            </Menu.MenuItem>
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="mark-group-read"
                label="Mark Group as Read"
                action={() => handlers.onMarkGroupRead(group.id)}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="close-group"
                label="Close Group"
                color="danger"
                action={() => handlers.onCloseGroup(group.id)}
            />
            <Menu.MenuItem
                id="ungroup-tabs"
                label="Ungroup Tabs"
                action={() => handlers.onUngroupTabs(group.id)}
            />
        </Menu.ContextMenu>
    ));
}

// ─── Child tab context menu ──────────────────────────────────────────────

export interface ChildActionHandlers {
    onPinChild: (groupId: string, childId: string) => void;
    onRemoveFromGroup: (tabId: string) => void;
    onMoveToGroup: (tabId: string, targetGroupId: string) => void;
    onCloseChild: (groupId: string, childId: string) => void;
}

export function openChildContextMenu(
    event: React.MouseEvent,
    child: LeafTab,
    childIndex: number,
    sourceGroupId: string,
    groups: GroupTab[],
    handlers: ChildActionHandlers,
) {
    const otherGroups = groups.filter(g => g.id !== sourceGroupId);

    ContextMenuApi.openContextMenu(event, () => (
        <Menu.ContextMenu navId="channeltabs-child-context">
            <Menu.MenuItem
                id="pin-child"
                label={child.pinned ? "Unpin" : "Pin"}
                action={() => handlers.onPinChild(sourceGroupId, child.id)}
            />
            <Menu.MenuItem
                id="remove-from-group"
                label="Remove from Group"
                action={() => handlers.onRemoveFromGroup(child.id)}
            />
            {otherGroups.length > 0 && (
                <Menu.MenuItem id="move-to-group" label="Move to Group">
                    {otherGroups.map(g => (
                        <Menu.MenuItem
                            key={g.id}
                            id={`move-${g.id}`}
                            label={g.name}
                            action={() => handlers.onMoveToGroup(child.id, g.id)}
                        />
                    ))}
                </Menu.MenuItem>
            )}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="close-child"
                label="Close"
                color="danger"
                action={() => handlers.onCloseChild(sourceGroupId, child.id)}
            />
        </Menu.ContextMenu>
    ));
}
