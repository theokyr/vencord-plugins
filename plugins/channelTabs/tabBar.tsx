/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, ChannelStore, GuildStore, ReadStateStore, UserStore } from "@webpack/common";
import { openBarContextMenu } from "./contextMenu";
import { findStoreLazy } from "@webpack";
import type { Tab } from "./types";

// ─── Route tab icons (data URIs) ─────────────────────────────────────────
// SVGs encoded as data URIs for use in <img> tags. White fill for visibility on dark backgrounds.

function svgDataUri(svg: string): string {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ROUTE_ICONS: Record<string, string> = {
    "/channels/@me": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-2-4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z"/><path d="M3 18a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v2a1 1 0 1 1-2 0v-2a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v2a1 1 0 1 1-2 0v-2Z"/></svg>'),
    "/message-requests": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/></svg>'),
    "/store": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M2.01 8.5 2 22h20V8.5l-4-6H6l-3.99 6ZM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm-4.47-7h8.94l2.67 4H4.86l2.67-4Z"/></svg>'),
    "/shop": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2Zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2Zm6 16H6V8h2v2a1 1 0 1 0 2 0V8h4v2a1 1 0 1 0 2 0V8h2v12Z"/></svg>'),
    "/quest-home": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8Zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1Z"/></svg>'),
};

const DISCORD_FALLBACK_ICON = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19.73 4.87a18.2 18.2 0 0 0-4.6-1.44c-.21.4-.4.8-.58 1.21-1.69-.26-3.4-.26-5.1 0-.18-.41-.37-.82-.59-1.2a18.2 18.2 0 0 0-4.6 1.43A19.04 19.04 0 0 0 .96 18.6a18.56 18.56 0 0 0 5.63 2.87c.46-.62.86-1.28 1.2-1.98-.65-.25-1.29-.55-1.9-.92.16-.12.32-.24.47-.37a13.18 13.18 0 0 0 11.28 0c.15.13.31.26.47.37-.6.36-1.25.67-1.9.92.35.7.75 1.35 1.2 1.98 1.94-.57 3.86-1.5 5.63-2.87A19.04 19.04 0 0 0 19.73 4.87ZM8.3 15.63c-1.18 0-2.16-1.08-2.16-2.42 0-1.34.95-2.42 2.15-2.42 1.2 0 2.17 1.08 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.4 0c-1.19 0-2.16-1.08-2.16-2.42 0-1.34.96-2.42 2.16-2.42s2.16 1.08 2.15 2.42c0 1.34-.95 2.42-2.15 2.42Z"/></svg>');

function getRouteIcon(path: string): string {
    return ROUTE_ICONS[path] ?? DISCORD_FALLBACK_ICON;
}

const PresenceStore = findStoreLazy("PresenceStore") as {
    getStatus: (userId: string) => "online" | "idle" | "dnd" | "offline";
    isMobileOnline: (userId: string) => boolean;
};

const TypingStore = findStoreLazy("TypingStore") as {
    getTypingUsers: (channelId: string) => Record<string, unknown>;
};

const CallStore = findStoreLazy("CallStore") as {
    isCallActive: (channelId: string) => boolean;
};

const VoiceStateStore = findStoreLazy("VoiceStateStore") as {
    getVoiceStatesForChannel: (channelId: string) => Record<string, unknown>;
};

const UserGuildSettingsStore = findStoreLazy("UserGuildSettingsStore") as {
    isChannelMuted: (guildId: string | null, channelId: string) => boolean;
};

const RelationshipStore = findStoreLazy("RelationshipStore") as {
    getNickname: (userId: string) => string | undefined;
    isFriend: (userId: string) => boolean;
};

// ─── Tab metadata ─────────────────────────────────────────────────────────

interface TabMeta {
    icon: string | null;
    name: string;
    isDm: boolean;
    dmUserId: string | null;
}

function getTabMeta(tab: Tab, showIcon: boolean): TabMeta {
    if (tab.type === "route") {
        return { icon: showIcon ? getRouteIcon(tab.path) : null, name: tab.label, isDm: false, dmUserId: null };
    }

    const channel = ChannelStore.getChannel(tab.channelId);
    if (!channel) return { icon: null, name: "Unknown", isDm: false, dmUserId: null };

    if (!tab.guildId || channel.isDM?.()) {
        const recipientId = channel.recipients?.[0] ?? null;
        const user = recipientId ? UserStore.getUser(recipientId) : null;
        const friendNick = recipientId ? RelationshipStore?.getNickname?.(recipientId) : undefined;
        return {
            icon: showIcon ? (user?.getAvatarURL(undefined, 32) ?? null) : null,
            name: friendNick ?? user?.globalName ?? user?.username ?? "DM",
            isDm: true,
            dmUserId: recipientId,
        };
    }

    const guild = showIcon ? GuildStore.getGuild(tab.guildId) : null;
    const guildIcon = guild?.icon
        ? `https://cdn.discordapp.com/icons/${tab.guildId}/${guild.icon}.webp?size=32`
        : null;
    return { icon: guildIcon, name: `#${channel.name ?? "unknown"}`, isDm: false, dmUserId: null };
}

// ─── Phone SVG icon ───────────────────────────────────────────────────────

function PhoneIcon() {
    return (
        <svg className="vc-channelTabs-callIcon" viewBox="0 0 24 24" fill="white">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
    );
}



// ─── Tab open/close animation ────────────────────────────────────────────

let initialRenderDone = false;

/** Module-level callbacks set by TabBar on mount. Allows external callers (keybinds)
 *  to trigger the same animations as the UI controls. */
let _animatedCloseCallback: ((i: number) => void) | null = null;
let _shakeCallback: ((i: number) => void) | null = null;

/** Close a tab with animation. Falls back to immediate close if TabBar isn't mounted. */
export function animatedCloseTab(index: number, fallback: (i: number) => void): void {
    if (_animatedCloseCallback) _animatedCloseCallback(index);
    else fallback(index);
}

/** Shake a tab (used to reject close on pinned tabs). */
export function shakeTab(index: number): void {
    _shakeCallback?.(index);
}

function animateClose(tabEl: HTMLElement | null, then: () => void) {
    if (!tabEl || document.body.classList.contains("vc-anim-off")) {
        then();
        return;
    }
    tabEl.style.setProperty("--vc-tab-close-width", `${tabEl.offsetWidth}px`);
    tabEl.classList.add("vc-channelTabs-tab-closing");
    tabEl.addEventListener("animationend", () => then(), { once: true });
}

// ─── Single Tab ───────────────────────────────────────────────────────────

function TabItem({ tab, index, isActive, showIcon, onActivate, onClose, onPin, onContextMenu, onMove, doubleClickAction }: {
    tab: Tab;
    index: number;
    isActive: boolean;
    showIcon: boolean;
    onActivate: (tab: Tab) => void;
    onClose: (i: number) => void;
    onPin: (i: number) => void;
    onContextMenu: (e: React.MouseEvent, i: number) => void;
    onMove: (from: number, to: number) => void;
    doubleClickAction: string;
}) {
    const meta = getTabMeta(tab, showIcon);
    // ─── Indicator state ──────────────────────────────────────────────
    const isChannel = tab.type === "channel";
    const isMuted = isChannel && tab.guildId ? UserGuildSettingsStore?.isChannelMuted?.(tab.guildId, tab.channelId) ?? false : false;
    const unreadCount = isChannel && !isMuted ? (ReadStateStore.getMentionCount(tab.channelId) ?? 0) : 0;
    const hasUnread = isChannel && !isMuted ? (ReadStateStore.hasUnread(tab.channelId) ?? false) : false;

    const isTyping = isChannel ? Object.keys(TypingStore?.getTypingUsers?.(tab.channelId) ?? {}).length > 0 : false;

    const isCallActive = isChannel ? (
        (CallStore?.isCallActive?.(tab.channelId) ?? false)
        || Object.keys(VoiceStateStore?.getVoiceStatesForChannel?.(tab.channelId) ?? {}).length > 0
    ) : false;

    const dmStatus = isChannel && meta.isDm && meta.dmUserId ? (PresenceStore?.getStatus?.(meta.dmUserId) ?? null) : null;

    // ─── Open animation ──────────────────────────────────────────────
    const tabRef = useRef<HTMLDivElement>(null);
    const justOpened = useRef(true);

    useEffect(() => {
        if (justOpened.current && tabRef.current) {
            if (initialRenderDone && !document.body.classList.contains("vc-anim-off")) {
                tabRef.current.classList.add("vc-channelTabs-tab-opening");
                const handler = () => tabRef.current?.classList.remove("vc-channelTabs-tab-opening");
                tabRef.current.addEventListener("animationend", handler, { once: true });
            }
            justOpened.current = false;
        }
    }, []);

    // ─── Close with animation ────────────────────────────────────────
    const doClose = useCallback(() => {
        animateClose(tabRef.current, () => onClose(index));
    }, [onClose, index]);

    // ─── Class name ───────────────────────────────────────────────────
    let className = "vc-channelTabs-tab";
    if (isActive) className += " vc-channelTabs-tab-active";
    if (tab.pinned) className += " vc-channelTabs-tab-pinned";
    if (isMuted) className += " vc-channelTabs-tab-muted";
    if (isCallActive && !isMuted) className += " vc-channelTabs-tab-call";

    return (
        <div
            ref={tabRef}
            className={className}
            onClick={() => onActivate(tab)}
            onDoubleClick={() => {
                if (doubleClickAction === "pin") onPin(index);
                else if (doubleClickAction === "close" && !tab.pinned) doClose();
            }}
            onMouseDown={e => {
                if (e.button !== 1) return;
                e.preventDefault();
                if (tab.pinned) {
                    // Shake animation instead of closing pinned tabs
                    tabRef.current?.classList.remove("vc-channelTabs-tab-shake");
                    void tabRef.current?.offsetWidth; // reflow to restart animation
                    tabRef.current?.classList.add("vc-channelTabs-tab-shake");
                } else {
                    doClose();
                }
            }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, index); }}
            draggable
            onDragStart={e => { e.dataTransfer.setData("text/plain", String(index)); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => { e.preventDefault(); const src = parseInt(e.dataTransfer.getData("text/plain")); if (!isNaN(src)) onMove(src, index); }}
        >
            {/* Avatar with optional status dot */}
            {meta.icon && (
                <div className="vc-channelTabs-tab-avatarWrap">
                    <img className="vc-channelTabs-tab-icon" src={meta.icon} alt="" />
                    {dmStatus && (
                        <div className={`vc-channelTabs-statusDot vc-channelTabs-statusDot-${dmStatus}`} />
                    )}
                </div>
            )}

            <span>{meta.name}</span>

            {/* Call phone icon */}
            {isCallActive && !isMuted && <PhoneIcon />}

            {/* Mention badge (inline) */}
            {unreadCount > 0 && <span className="vc-channelTabs-tab-mention">{unreadCount}</span>}

            {/* Unread dot (inline, no mentions) */}
            {hasUnread && unreadCount === 0 && <span className="vc-channelTabs-tab-unread" />}

            {/* Close button */}
            {!tab.pinned && (
                <span className="vc-channelTabs-tab-close" onClick={e => { e.stopPropagation(); doClose(); }}>
                    <svg viewBox="0 0 12 12" fill="currentColor">
                        <polygon points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                    </svg>
                </span>
            )}

            {/* Typing bar (overlay) */}
            {isTyping && !isMuted && <div className="vc-channelTabs-typingBar" />}
        </div>
    );
}


// ─── TabBar ───────────────────────────────────────────────────────────────

export function TabBar({ showServerIcon, onActivate, tabs, activeTabIndex, onClose, onPin, onMove, onContextMenu, hideGuilds, hideChannels, showSidebarToggles, enrichedHeader, onToggleGuilds, onToggleChannels, onSetSidebarMode, onNewTab, onOpenSettings, doubleClickAction }: {
    showServerIcon: boolean;
    onActivate: (tab: Tab) => void;
    tabs: Tab[];
    activeTabIndex: number;
    onClose: (i: number) => void;
    onPin: (i: number) => void;
    onMove: (from: number, to: number) => void;
    onContextMenu: (e: React.MouseEvent, idx: number) => void;
    hideGuilds: boolean;
    hideChannels: boolean;
    showSidebarToggles: boolean;
    enrichedHeader: boolean;
    onToggleGuilds: () => void;
    onToggleChannels: () => void;
    onSetSidebarMode: (mode: "all" | "guilds" | "channels" | "none") => void;
    onNewTab: () => void;
    onOpenSettings: () => void;
    doubleClickAction: string;
}) {
    // Mark initial render done after first paint so TabItem can distinguish new tabs from restored ones
    useEffect(() => {
        requestAnimationFrame(() => { initialRenderDone = true; });
    }, []);

    const barRef = useRef<HTMLDivElement>(null);

    // Animated close — finds the tab element by index in the DOM
    const animatedClose = useCallback((i: number) => {
        const tabEls = barRef.current?.querySelectorAll<HTMLElement>(".vc-channelTabs-tab");
        const tabEl = tabEls?.[i] ?? null;
        animateClose(tabEl, () => onClose(i));
    }, [onClose]);

    // Shake a tab by index — same animation as middle-clicking a pinned tab
    const shakeByIndex = useCallback((i: number) => {
        const tabEls = barRef.current?.querySelectorAll<HTMLElement>(".vc-channelTabs-tab");
        const tabEl = tabEls?.[i] ?? null;
        if (!tabEl) return;
        tabEl.classList.remove("vc-channelTabs-tab-shake");
        void tabEl.offsetWidth;
        tabEl.classList.add("vc-channelTabs-tab-shake");
    }, []);

    // Expose animated close + shake to keybind handlers via module-level callbacks
    useEffect(() => {
        _animatedCloseCallback = animatedClose;
        _shakeCallback = shakeByIndex;
        return () => { _animatedCloseCallback = null; _shakeCallback = null; };
    }, [animatedClose, shakeByIndex]);

    const onBarContextMenu = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".vc-channelTabs-tab")) return;
        e.preventDefault();
        openBarContextMenu(e, hideGuilds, hideChannels, onToggleGuilds, onToggleChannels, onOpenSettings);
    }, [hideGuilds, hideChannels, onToggleGuilds, onToggleChannels, onOpenSettings]);

    const onBarDoubleClick = useCallback((e: React.MouseEvent) => {
        const t = e.target as HTMLElement;
        if (t.closest(".vc-channelTabs-tab") || t.closest(".vc-channelTabs-newTab") || t.closest(".vc-channelTabs-sidebarToggles")) return;
        onNewTab();
    }, [onNewTab]);

    if (tabs.length === 0) return null;

    return (
        <div ref={barRef} className="vc-channelTabs-tabBar" onContextMenu={onBarContextMenu} onDoubleClick={onBarDoubleClick}>
            {showSidebarToggles && !enrichedHeader && (() => {
                const mode = !hideGuilds && !hideChannels ? "all"
                    : !hideGuilds && hideChannels ? "guilds"
                    : hideGuilds && !hideChannels ? "channels"
                    : "none";
                return (
                    <div className="vc-channelTabs-sidebarToggles">
                        <span
                            className={`vc-channelTabs-toggleBtn${mode === "guilds" ? " vc-channelTabs-toggleBtn-active" : ""}`}
                            onClick={() => onSetSidebarMode(mode === "guilds" ? "none" : "guilds")}
                            title="Show guilds only"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm12 0H10V4h10v16z" />
                            </svg>
                        </span>
                        <span
                            className={`vc-channelTabs-toggleBtn${mode === "all" ? " vc-channelTabs-toggleBtn-active" : ""}`}
                            onClick={() => onSetSidebarMode(mode === "all" ? "none" : "all")}
                            title="Show all sidebars"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm6 0h-4V4h4v16zm6 0h-4V4h4v16z" />
                            </svg>
                        </span>
                        <span
                            className={`vc-channelTabs-toggleBtn${mode === "channels" ? " vc-channelTabs-toggleBtn-active" : ""}`}
                            onClick={() => onSetSidebarMode(mode === "channels" ? "none" : "channels")}
                            title="Show channels only"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
                            </svg>
                        </span>
                    </div>
                );
            })()}
            {tabs.map((tab, i) => (
                <TabItem
                    key={tab.id}
                    tab={tab}
                    index={i}
                    isActive={i === activeTabIndex}
                    showIcon={showServerIcon}
                    onActivate={onActivate}
                    onClose={onClose}
                    onPin={onPin}
                    onContextMenu={onContextMenu}
                    onMove={onMove}
                    doubleClickAction={doubleClickAction}
                />
            ))}
            <span className="vc-channelTabs-newTab" onClick={onNewTab} title="New tab (Quick Switcher)">+</span>
        </div>
    );
}
