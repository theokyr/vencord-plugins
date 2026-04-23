/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useEffect, useRef, ReadStateStore } from "@webpack/common";
import { openBarContextMenu } from "./contextMenu";
import { findStoreLazy } from "@webpack";
import type { Tab } from "./types";
import { getTabMeta, ROUTE_ICONS } from "./tabMeta";
import { isGroupTab, type GroupTab } from "./types";
import { GroupChip } from "./groupChip";
import { GroupDropdown } from "./groupDropdown";
import { GroupNamePrompt } from "./groupNamePrompt";


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

/** Reset module-level state when the plugin stops. */
export function resetTabBarState() {
    initialRenderDone = false;
}

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

function TabItem({ tab, index, isActive, showIcon, onActivate, onClose, onPin, onContextMenu, onMove, doubleClickAction, isSelected, onMultiSelect }: {
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
    isSelected?: boolean;
    onMultiSelect?: (index: number, e: React.MouseEvent) => void;
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
                const el = tabRef.current;
                el.classList.add("vc-channelTabs-tab-opening");
                const handler = () => el.classList.remove("vc-channelTabs-tab-opening");
                el.addEventListener("animationend", handler, { once: true });
                justOpened.current = false;
                return () => el.removeEventListener("animationend", handler);
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
    if (isSelected) className += " vc-channelTabs-tab-selected";

    return (
        <div
            ref={tabRef}
            className={className}
            onClick={e => {
                    if ((e.ctrlKey || e.metaKey || e.shiftKey) && onMultiSelect) {
                        onMultiSelect(index, e);
                        return;
                    }
                    onActivate(tab);
                }}
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
            onDragStart={e => {
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.setData("application/x-tab-type", "tab");
                    e.dataTransfer.setData("application/x-tab-id", tab.id);
                    e.dataTransfer.effectAllowed = "move";
                }}
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

export function TabBar({ showServerIcon, onActivate, tabs, activeTabIndex, onClose, onPin, onMove, onContextMenu, hideGuilds, hideChannels, showSidebarToggles, enrichedHeader, onToggleGuilds, onToggleChannels, onSetSidebarMode, onNewTab, onOpenSettings, doubleClickAction, activeChildIndex, maxGroupIcons, groupChipStyle, onToggleGroupCollapsed, onActivateChild, onCloseChild, onMoveChild, onPinChild, onDropToGroup, onDropFromGroup, onGroupContextMenu, onChildContextMenu, onCreateGroup, onAddCurrentTabToGroup, multiSelectIndices, onMultiSelectToggle }: {
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
    activeChildIndex?: number | null;
    maxGroupIcons?: number;
    groupChipStyle?: "compact" | "minimal";
    onToggleGroupCollapsed?: (groupId: string) => void;
    onActivateChild?: (groupIndex: number, childIndex: number) => void;
    onCloseChild?: (groupId: string, childId: string) => void;
    onMoveChild?: (groupId: string, from: number, to: number) => void;
    onPinChild?: (groupId: string, childId: string) => void;
    onDropToGroup?: (tabId: string, groupId: string) => void;
    onDropFromGroup?: (tabId: string, dropIndex: number) => void;
    onGroupContextMenu?: (e: React.MouseEvent, index: number) => void;
    onChildContextMenu?: (e: React.MouseEvent, groupId: string, childIndex: number) => void;
    onCreateGroup?: (indices: number[], name: string) => void;
    onAddCurrentTabToGroup?: (groupId: string) => void;
    multiSelectIndices?: Set<number>;
    onMultiSelectToggle?: (index: number, e: React.MouseEvent) => void;
}) {
    // Mark initial render done after first paint so TabItem can distinguish new tabs from restored ones
    useEffect(() => {
        requestAnimationFrame(() => { initialRenderDone = true; });
    }, []);

    const barRef = useRef<HTMLDivElement>(null);
    const chipRefs = useRef<Record<string, React.RefObject<HTMLElement>>>({});

    // Prune stale chipRef entries when tabs change (prevents memory leak on group destroy)
    useEffect(() => {
        const liveIds = new Set(tabs.filter(isGroupTab).map(t => t.id));
        for (const k of Object.keys(chipRefs.current)) {
            if (!liveIds.has(k)) delete chipRefs.current[k];
        }
    }, [tabs]);

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
        <div
            ref={barRef}
            className="vc-channelTabs-tabBar"
            onContextMenu={onBarContextMenu}
            onDoubleClick={onBarDoubleClick}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => {
                const tabType = e.dataTransfer.getData("application/x-tab-type");
                if (tabType === "child") {
                    e.preventDefault();
                    const tabId = e.dataTransfer.getData("application/x-tab-id");
                    if (tabId) onDropFromGroup?.(tabId, tabs.length);
                }
            }}
        >
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
            {tabs.map((tab, i) => {
                if (isGroupTab(tab)) {
                    const isActive = i === activeTabIndex;
                    const showDropdown = isActive && !tab.collapsed;
                    return (
                        <div
                            key={tab.id}
                            style={{ position: "relative" }}
                            ref={el => {
                                if (!chipRefs.current[tab.id]) chipRefs.current[tab.id] = { current: null };
                                chipRefs.current[tab.id].current = el;
                            }}
                        >
                            <GroupChip
                                group={tab}
                                index={i}
                                isActive={isActive}
                                maxIcons={maxGroupIcons ?? 4}
                                chipStyle={groupChipStyle ?? "compact"}
                                activeChildIndex={isActive ? (activeChildIndex ?? null) : null}
                                showIcon={showServerIcon}
                                onToggleCollapsed={id => onToggleGroupCollapsed?.(id)}
                                onActivateChild={(gi, ci) => onActivateChild?.(gi, ci)}
                                onCloseChild={(gid, cid) => onCloseChild?.(gid, cid)}
                                onMoveChild={(gid, from, to) => onMoveChild?.(gid, from, to)}
                                onDropToGroup={(tid, gid) => onDropToGroup?.(tid, gid)}
                                onDropFromGroup={(tid, idx) => onDropFromGroup?.(tid, idx)}
                                onContextMenu={(e, idx) => onGroupContextMenu?.(e, idx)}
                                onChildContextMenu={(e, gid, ci) => onChildContextMenu?.(e, gid, ci)}
                                onMove={onMove}
                            />
                            {showDropdown && (
                                <GroupDropdown
                                    group={tab}
                                    groupIndex={i}
                                    activeChildIndex={activeChildIndex ?? null}
                                    showIcon={showServerIcon}
                                    chipRef={chipRefs.current[tab.id] ?? { current: null }}
                                    onActivateChild={(gi, ci) => onActivateChild?.(gi, ci)}
                                    onCloseChild={(gid, cid) => onCloseChild?.(gid, cid)}
                                    onMoveChild={(gid, from, to) => onMoveChild?.(gid, from, to)}
                                    onPinChild={(gid, cid) => onPinChild?.(gid, cid)}
                                    onChildContextMenu={(e, gid, ci) => onChildContextMenu?.(e, gid, ci)}
                                    onClose={() => onToggleGroupCollapsed?.(tab.id)}
                                    onAddCurrentTab={() => onAddCurrentTabToGroup?.(tab.id)}
                                    onDropFromGroup={(tid, idx) => onDropFromGroup?.(tid, idx)}
                                />
                            )}
                        </div>
                    );
                }

                return (
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
                        isSelected={multiSelectIndices?.has(i)}
                        onMultiSelect={onMultiSelectToggle}
                    />
                );
            })}
            <span className="vc-channelTabs-newTab" onClick={onNewTab} title="New tab (Quick Switcher)">+</span>
        </div>
    );
}
