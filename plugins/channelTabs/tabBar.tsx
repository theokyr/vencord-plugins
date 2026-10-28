/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, FluxDispatcher, Menu, useCallback, useEffect, useLayoutEffect, useRef, useState, ReadStateStore } from "@webpack/common";
import { findStoreLazy } from "@webpack";
import type { Tab } from "./types";
import { getTabMeta, ROUTE_ICONS } from "./tabMeta";
import { isGroupTab, type GroupTab } from "./types";
import { GroupChip } from "./groupChip";
import { GroupDropdown } from "./groupDropdown";
import { GroupNamePrompt } from "./groupNamePrompt";
import { animationsOn, clearDrag, getDrag, setDrag, setDragGhost } from "./dragState";
import { absorbTargetAt, autoScrollDirection, AUTOSCROLL_SPEED, computeInsertIndex, slotToMoveTarget, topLevelItems } from "./dragGeometry";
import { getVoiceParticipantIds, getVoiceTabPresence } from "./voicePresence";


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
    getVoiceStatesForChannel: (channelId: string) => Record<string, { userId?: string; user_id?: string; }>;
};

const UserStore = findStoreLazy("UserStore") as {
    getCurrentUser: () => { id: string; } | undefined;
    getUser: (userId: string) => {
        id: string;
        username: string;
        globalName?: string | null;
        getAvatarURL: (guildId?: string, size?: number) => string;
    } | undefined;
};

const UserGuildSettingsStore = findStoreLazy("UserGuildSettingsStore") as {
    isChannelMuted: (guildId: string | null, channelId: string) => boolean;
};

function openBarSettingsContextMenu(event: React.MouseEvent, onOpenSettings: () => void) {
    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu
            navId="channelTabs-bar-context"
            onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
            aria-label="Tab Bar Context Menu"
        >
            <Menu.MenuItem
                id="vc-tabbar-settings"
                key="vc-tabbar-settings"
                label="ChannelTabs Settings"
                action={onOpenSettings}
            />
        </Menu.Menu>
    ));
}

// ─── Phone SVG icon ───────────────────────────────────────────────────────

function PhoneIcon({ connected }: { connected: boolean; }) {
    return (
        <svg
            className={`vc-channelTabs-callIcon${connected ? "" : " vc-channelTabs-callIcon-pending"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
    );
}

function VoiceOccupantStack({ userIds, guildId }: { userIds: string[]; guildId: string | null; }) {
    const users = userIds.flatMap(userId => {
        try {
            const user = UserStore?.getUser?.(userId);
            return user ? [user] : [];
        } catch {
            return [];
        }
    });
    const maxAvatars = users.length > 3 ? 2 : 3;
    const visibleUsers = users.slice(0, maxAvatars);
    const overflowCount = Math.max(0, userIds.length - visibleUsers.length);
    const names = users.map(user => user.globalName ?? user.username);
    const label = userIds.length === 1
        ? `${names[0] ?? "1 user"} is in voice`
        : `${userIds.length} users are in voice${names.length ? `: ${names.join(", ")}` : ""}`;

    return (
        <div className="vc-channelTabs-voiceOccupants" title={label} aria-label={label}>
            {visibleUsers.map((user, index) => (
                <img
                    key={user.id}
                    className="vc-channelTabs-voiceOccupantAvatar"
                    src={user.getAvatarURL(guildId ?? undefined, 32)}
                    alt=""
                    style={{ zIndex: visibleUsers.length - index }}
                />
            ))}
            {overflowCount > 0 && (
                <span className="vc-channelTabs-voiceOccupantOverflow" aria-hidden="true">+{overflowCount}</span>
            )}
        </div>
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

/** Insertion caret rendered between tabs. Keyed so React moves the node instead
 *  of remounting it — the grow-in animation plays once, then it slides. */
function DropCaret() {
    return <div className="vc-channelTabs-dropCaret" aria-hidden="true" />;
}

// ─── Single Tab ───────────────────────────────────────────────────────────

function TabItem({ tab, index, isActive, showIcon, onActivate, onClose, onPin, onContextMenu, doubleClickAction, isSelected, onMultiSelect, isDragging, isSettling, onDragStateChange }: {
    tab: Tab;
    index: number;
    isActive: boolean;
    showIcon: boolean;
    onActivate: (tab: Tab) => void;
    onClose: (i: number) => void;
    onPin: (i: number) => void;
    onContextMenu: (e: React.MouseEvent, i: number) => void;
    doubleClickAction: string;
    isSelected?: boolean;
    onMultiSelect?: (index: number, e: React.MouseEvent) => void;
    isDragging?: boolean;
    isSettling?: boolean;
    onDragStateChange?: (id: string | null) => void;
}) {
    const meta = getTabMeta(tab, showIcon);
    // ─── Indicator state ──────────────────────────────────────────────
    const isChannel = tab.type === "channel";
    const isMuted = isChannel && tab.guildId ? UserGuildSettingsStore?.isChannelMuted?.(tab.guildId, tab.channelId) ?? false : false;
    const unreadCount = isChannel && !isMuted ? (ReadStateStore.getMentionCount(tab.channelId) ?? 0) : 0;
    const hasUnread = isChannel && !isMuted ? (ReadStateStore.hasUnread(tab.channelId) ?? false) : false;

    const isTyping = isChannel ? Object.keys(TypingStore?.getTypingUsers?.(tab.channelId) ?? {}).length > 0 : false;

    let participantUserIds: string[] = [];
    let currentUserId: string | null = null;
    let callStoreActive = false;
    if (isChannel) {
        try {
            participantUserIds = getVoiceParticipantIds(VoiceStateStore?.getVoiceStatesForChannel?.(tab.channelId));
            currentUserId = UserStore?.getCurrentUser?.()?.id ?? null;
            callStoreActive = CallStore?.isCallActive?.(tab.channelId) ?? false;
        } catch { /* stores may still be hydrating */ }
    }
    const voicePresence = getVoiceTabPresence(participantUserIds, currentUserId, callStoreActive);

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
    if (voicePresence === "connected" && !isMuted) className += " vc-channelTabs-tab-call";
    if (voicePresence === "occupied" && !isMuted) className += " vc-channelTabs-tab-occupied";
    if (isSelected) className += " vc-channelTabs-tab-selected";
    if (isDragging) className += " vc-channelTabs-tab-dragging";
    if (isSettling) className += " vc-channelTabs-tab-settling";

    return (
        <div
            ref={tabRef}
            data-vc-tab-index={index}
            data-vc-tab-id={tab.id}
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
                    if (tabRef.current) setDragGhost(e, tabRef.current);
                    setDrag({ kind: "tab", id: tab.id, index });
                    onDragStateChange?.(tab.id);
                }}
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

            {/* Connected calls keep the phone; other occupied VCs show who's there. */}
            {(voicePresence === "connected" || voicePresence === "calling") && !isMuted && (
                <PhoneIcon connected={voicePresence === "connected"} />
            )}
            {voicePresence === "occupied" && !isMuted && (
                <VoiceOccupantStack userIds={participantUserIds} guildId={tab.type === "channel" ? tab.guildId : null} />
            )}

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

export function TabBar({ showServerIcon, onActivate, tabs, activeTabIndex, onClose, onPin, onMove, onContextMenu, onNewTab, onOpenSettings, doubleClickAction, activeChildIndex, maxGroupIcons, groupChipStyle, onToggleGroupCollapsed, onActivateChild, onCloseChild, onMoveChild, onPinChild, onDropToGroup, onDropFromGroup, onGroupContextMenu, onChildContextMenu, onCreateGroup, onAddCurrentTabToGroup, multiSelectIndices, onMultiSelectToggle }: {
    showServerIcon: boolean;
    onActivate: (tab: Tab) => void;
    tabs: Tab[];
    activeTabIndex: number;
    onClose: (i: number) => void;
    onPin: (i: number) => void;
    onMove: (from: number, to: number) => void;
    onContextMenu: (e: React.MouseEvent, idx: number) => void;
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

    // ─── Drag & drop feedback state ───────────────────────────────────
    // Refs are the source of truth (read synchronously on `drop`); the state
    // mirrors them purely for rendering.
    const dropRef = useRef<{ index: number | null; groupId: string | null; }>({ index: null, groupId: null });
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [dropGroupId, setDropGroupId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [settlingId, setSettlingId] = useState<string | null>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Set just before a reorder so the FLIP pass only runs for real moves. */
    const flipArmed = useRef(false);
    const autoScroll = useRef<{ raf: number; dir: number; } | null>(null);

    const stopAutoScroll = useCallback(() => {
        if (!autoScroll.current) return;
        cancelAnimationFrame(autoScroll.current.raf);
        autoScroll.current = null;
    }, []);

    /** Scroll the (overflowing) bar while the pointer rests near an edge. */
    const updateAutoScroll = useCallback((bar: HTMLElement, clientX: number) => {
        const dir = autoScrollDirection(bar, clientX);
        if (dir === 0) {
            stopAutoScroll();
            return;
        }
        if (autoScroll.current?.dir === dir) return;
        stopAutoScroll();

        const step = () => {
            bar.scrollLeft += dir * AUTOSCROLL_SPEED;
            if (autoScroll.current) autoScroll.current.raf = requestAnimationFrame(step);
        };
        autoScroll.current = { dir, raf: requestAnimationFrame(step) };
    }, [stopAutoScroll]);

    const clearIndicators = useCallback(() => {
        dropRef.current = { index: null, groupId: null };
        setDropIndex(null);
        setDropGroupId(null);
        stopAutoScroll();
    }, [stopAutoScroll]);

    /** Brief pop on the tab that just landed, so the eye can follow it. */
    const markSettled = useCallback((id: string) => {
        if (!animationsOn()) return;
        flipArmed.current = true;
        if (settleTimer.current) clearTimeout(settleTimer.current);
        setSettlingId(id);
        settleTimer.current = setTimeout(() => setSettlingId(null), 400);
    }, []);

    // Global dragend: fires even when the drop happens outside the bar or the
    // drag is cancelled with Escape, so all feedback is guaranteed to clear.
    useEffect(() => {
        const onDragEnd = () => {
            clearDrag();
            setDraggingId(null);
            clearIndicators();
        };
        document.addEventListener("dragend", onDragEnd, true);
        return () => {
            document.removeEventListener("dragend", onDragEnd, true);
            if (settleTimer.current) clearTimeout(settleTimer.current);
            stopAutoScroll();
            clearDrag();
        };
    }, [clearIndicators, stopAutoScroll]);

    // ─── FLIP: slide tabs from their old positions to their new ones ──
    const lastPositions = useRef<Map<string, number>>(new Map());
    useLayoutEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const next = new Map<string, number>();
        const armed = flipArmed.current && animationsOn();
        flipArmed.current = false;

        for (const el of topLevelItems(bar)) {
            const id = el.dataset.vcTabId;
            if (!id) continue;
            // offsetLeft, not getBoundingClientRect: it is layout-only, so an
            // in-flight FLIP transform or a scrolled bar cannot poison the
            // recorded position.
            const left = el.offsetLeft;
            next.set(id, left);
            if (!armed) continue;

            const prev = lastPositions.current.get(id);
            const delta = prev === undefined ? 0 : prev - left;
            if (Math.abs(delta) < 1) continue;
            if (el.classList.contains("vc-channelTabs-tab-opening")) continue;
            if (el.classList.contains("vc-channelTabs-tab-closing")) continue;

            el.style.transition = "none";
            el.style.transform = `translateX(${delta}px)`;
            requestAnimationFrame(() => {
                el.style.transition = "transform var(--vc-anim-speed-slow, 250ms) var(--vc-anim-ease-spring, ease-out)";
                el.style.transform = "";
                el.addEventListener("transitionend", () => {
                    el.style.transition = "";
                    el.style.transform = "";
                }, { once: true });
            });
        }
        lastPositions.current = next;
    });

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
        openBarSettingsContextMenu(e, onOpenSettings);
    }, [onOpenSettings]);

    // ─── Bar-level drag handling ──────────────────────────────────────
    // All hover math lives here: children only start drags. A single owner
    // means the caret can never be double-placed or left behind.

    const onBarDragOver = useCallback((e: React.DragEvent) => {
        const drag = getDrag();
        if (!drag) return; // external drag (file, Discord message, …) — not ours
        const bar = barRef.current;
        if (!bar) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        // Hovering the chip a child already belongs to is a no-op, not an extract.
        const chip = (e.target as HTMLElement).closest<HTMLElement>(".vc-channelTabs-group-chip");
        if (drag.kind === "child" && chip?.dataset.vcGroupId === drag.sourceGroupId) {
            clearIndicators();
            return;
        }

        // Groups only reorder; leaves may also be absorbed into a chip.
        const absorb = drag.kind === "group"
            ? null
            : absorbTargetAt(e.target as HTMLElement, e.clientX);

        if (absorb !== null) {
            dropRef.current = { index: null, groupId: absorb };
            setDropIndex(null);
            setDropGroupId(absorb);
        } else {
            const index = computeInsertIndex(bar, e.clientX, tabs.length);
            dropRef.current = { index, groupId: null };
            setDropIndex(index);
            setDropGroupId(null);
        }
        updateAutoScroll(bar, e.clientX);
    }, [tabs.length, updateAutoScroll, clearIndicators]);

    const onBarDragLeave = useCallback((e: React.DragEvent) => {
        // dragleave also fires when crossing into a child — ignore those.
        const next = e.relatedTarget as Node | null;
        if (next && barRef.current?.contains(next)) return;
        clearIndicators();
    }, [clearIndicators]);

    const onBarDrop = useCallback((e: React.DragEvent) => {
        const drag = getDrag();
        const { index, groupId } = dropRef.current;
        clearIndicators();
        if (!drag) return;
        e.preventDefault();

        if (groupId) {
            // Absorb a loose tab, or move a child between groups.
            if (groupId !== drag.sourceGroupId) {
                onDropToGroup?.(drag.id, groupId);
                markSettled(drag.id);
            }
            return;
        }

        if (drag.kind === "child") {
            if (index === null) return; // hovered its own chip — nothing to do
            // Pull a child out of its group and back onto the bar.
            onDropFromGroup?.(drag.id, index);
            markSettled(drag.id);
            return;
        }

        if (index === null) return;
        // `index` is an insertion slot; onMove wants a post-removal index.
        const target = slotToMoveTarget(index, drag.index, tabs.length);
        if (target === null) return;
        markSettled(drag.id);
        onMove(drag.index, target);
    }, [clearIndicators, markSettled, onDropToGroup, onDropFromGroup, onMove, tabs.length]);

    const onBarDoubleClick = useCallback((e: React.MouseEvent) => {
        const t = e.target as HTMLElement;
        if (t.closest(".vc-channelTabs-tab") || t.closest(".vc-channelTabs-newTab")) return;
        onNewTab();
    }, [onNewTab]);

    if (tabs.length === 0) return null;



    const renderItem = (tab: Tab, i: number) => {
        if (isGroupTab(tab)) {
            const isActive = i === activeTabIndex;
            const showDropdown = isActive && !tab.collapsed;
            return (
                <div
                    key={tab.id}
                    data-vc-tab-index={i}
                    data-vc-tab-id={tab.id}
                    className="vc-channelTabs-groupSlot"
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
                        isDragging={draggingId === tab.id}
                        isSettling={settlingId === tab.id}
                        isAbsorbTarget={dropGroupId === tab.id}
                        onDragStateChange={setDraggingId}
                        onToggleCollapsed={id => onToggleGroupCollapsed?.(id)}
                        onContextMenu={(e, idx) => onGroupContextMenu?.(e, idx)}
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
                            onDropToGroup={(tid, gid) => onDropToGroup?.(tid, gid)}
                            onDragStateChange={setDraggingId}
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
                doubleClickAction={doubleClickAction}
                isSelected={multiSelectIndices?.has(i)}
                onMultiSelect={onMultiSelectToggle}
                isDragging={draggingId === tab.id}
                isSettling={settlingId === tab.id}
                onDragStateChange={setDraggingId}
            />
        );
    };

    // Splice the caret into the flow as a keyed sibling — React moves the node
    // rather than remounting it, so it slides between slots.
    const children: React.ReactNode[] = [];
    tabs.forEach((tab, i) => {
        if (dropIndex === i) children.push(<DropCaret key="vc-channelTabs-dropCaret" />);
        children.push(renderItem(tab, i));
    });
    if (dropIndex === tabs.length) children.push(<DropCaret key="vc-channelTabs-dropCaret" />);

    return (
        <div
            ref={barRef}
            className={`vc-channelTabs-tabBar${dropIndex !== null || dropGroupId ? " vc-channelTabs-tabBar-dropActive" : ""}`}
            onContextMenu={onBarContextMenu}
            onDoubleClick={onBarDoubleClick}
            onDragOver={onBarDragOver}
            onDragLeave={onBarDragLeave}
            onDrop={onBarDrop}
        >
            {children}
            <span className="vc-channelTabs-newTab" onClick={onNewTab} title="New tab (Quick Switcher)">+</span>
        </div>
    );
}
