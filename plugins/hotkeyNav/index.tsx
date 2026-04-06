/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_animationKit/animations.css";

import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { createHotkeyNavSchema } from "./settingsSchema";
import { findStoreLazy } from "@webpack";
import {
    ChannelRouter,
    ChannelStore,
    FluxDispatcher,
    GuildChannelStore,
    GuildStore,
    NavigationRouter,
    ReadStateStore,
    SelectedChannelStore,
    SelectedGuildStore,
    Tooltip,
    useEffect,
    useState,
} from "@webpack/common";

const PrivateChannelSortStore = findStoreLazy("PrivateChannelSortStore") as {
    getPrivateChannelIds: () => string[];
};

const SortedGuildStore = findStoreLazy("SortedGuildStore") as {
    getGuildFolders: () => { folderId: string | null; guildIds: string[]; }[];
};

const ChannelListStore = findStoreLazy("ChannelListStore") as {
    getGuild: (guildId: string) => {
        guildChannels: {
            getSortedNamedCategories: () => { id: string; record: { name: string }; isCollapsed: boolean; isMuted: boolean; shownChannelIds: string[]; }[];
            favoritesCategory: { isCollapsed: boolean; shownChannelIds: string[]; };
            noParentCategory: { shownChannelIds: string[]; };
        };
    } | undefined;
};

// ─── types ─────────────────────────────────────────────────────────────────

interface NotificationEntry {
    channelId: string;
    guildId: string | null;
    type: "dm" | "mention" | "role" | "everyone";
    timestamp: number;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function parsePriority(str: string): string[] {
    return str.split(",").map(s => s.trim()).filter(Boolean);
}

function parseModifier(str: string): { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; } {
    const parts = str.toLowerCase().split("+").map(s => s.trim());
    return {
        ctrl: parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        meta: parts.includes("meta"),
    };
}

function modifierMatches(e: KeyboardEvent, mod: ReturnType<typeof parseModifier>): boolean {
    return e.ctrlKey === mod.ctrl
        && e.shiftKey === mod.shift
        && e.altKey === mod.alt
        && e.metaKey === mod.meta;
}

// ─── NotificationTracker ───────────────────────────────────────────────────

const NotificationTracker = {
    _notifications: [] as NotificationEntry[],
    _listeners: new Set<() => void>(),

    rebuild() {
        const entries: NotificationEntry[] = [];
        const store = settings.store;

        // DMs
        if (store.trackDms) {
            const dmIds = PrivateChannelSortStore.getPrivateChannelIds();
            for (const channelId of dmIds) {
                if (ReadStateStore.hasUnread(channelId)) {
                    const oldestUnread = ReadStateStore.getOldestUnreadMessageId(channelId);
                    entries.push({
                        channelId,
                        guildId: null,
                        type: "dm",
                        timestamp: oldestUnread ? Number(BigInt(oldestUnread) >> 22n) + 1420070400000 : Date.now(),
                    });
                }
            }
        }

        // Guild channels — mentions (includes @mention, @role, @everyone)
        if (store.trackMentions || store.trackRolePings || store.trackEveryone) {
            const guilds = GuildStore.getGuilds();
            for (const guildId of Object.keys(guilds)) {
                const channels = GuildChannelStore.getChannels(guildId);
                if (!channels?.SELECTABLE) continue;

                for (const { channel } of channels.SELECTABLE) {
                    const mentionCount = ReadStateStore.getMentionCount(channel.id);
                    if (mentionCount > 0) {
                        const oldestUnread = ReadStateStore.getOldestUnreadMessageId(channel.id);
                        entries.push({
                            channelId: channel.id,
                            guildId,
                            type: "mention",
                            timestamp: oldestUnread ? Number(BigInt(oldestUnread) >> 22n) + 1420070400000 : Date.now(),
                        });
                    }
                }
            }
        }

        // Sort by priority group then chronologically
        const priority = parsePriority(store.priorityOrder);
        entries.sort((a, b) => {
            const pa = priority.indexOf(a.type);
            const pb = priority.indexOf(b.type);
            if (pa !== pb) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            return a.timestamp - b.timestamp;
        });

        this._notifications = entries.slice(0, 9);
        this._listeners.forEach(fn => fn());
    },

    getNotifications(): NotificationEntry[] {
        return this._notifications;
    },

    getNotificationNumber(channelId: string): number | null {
        if (!settings.store.enableNotificationLayer) return null;
        const idx = this._notifications.findIndex(e => e.channelId === channelId);
        return idx === -1 ? null : idx + 1;
    },

    getNotificationNumberByGuild(guildId: string): number | null {
        if (!settings.store.enableNotificationLayer) return null;
        const idx = this._notifications.findIndex(e => e.guildId === guildId);
        return idx === -1 ? null : idx + 1;
    },

    getDmPosition(channelId: string): number | null {
        if (!settings.store.enableDmPositionalLayer && !settings.store.alwaysShowHints) return null;
        const dmIds = PrivateChannelSortStore.getPrivateChannelIds();
        const idx = dmIds.indexOf(channelId);
        return idx >= 0 && idx < 9 ? idx + 1 : null;
    },

    getServerPosition(guildId: string): number | null {
        if (!settings.store.enableServerPositionalLayer && !settings.store.alwaysShowHints) return null;
        const folders = SortedGuildStore.getGuildFolders();
        let pos = 0;
        for (const folder of folders) {
            for (const id of folder.guildIds) {
                if (id === guildId) return pos < 9 ? pos + 1 : null;
                pos++;
                if (pos >= 9) return null;
            }
        }
        return null;
    },

    subscribe(listener: () => void) {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    },
};

// ─── hook ──────────────────────────────────────────────────────────────────

function useNotificationTracker() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return NotificationTracker.subscribe(() => forceUpdate(n => n + 1));
    }, []);

    return NotificationTracker;
}

// ─── components ────────────────────────────────────────────────────────────

const MOD_ABBREV: Record<string, string> = {
    ctrl: "C", control: "C", alt: "A", shift: "S", meta: "M", cmd: "M", super: "M",
};

function formatModifier(mod: string): string {
    return mod.split("+").map(s => s.trim().toLowerCase()).map(s =>
        MOD_ABBREV[s] ?? s.charAt(0).toUpperCase()
    ).join("+");
}

function isModHeld(modKey: string): boolean {
    const key = modKey.toLowerCase();
    if ((key === "ctrl" || key === "control") && currentHeldMods.ctrl) return true;
    if (key === "alt" && currentHeldMods.alt) return true;
    if (key === "shift" && currentHeldMods.shift) return true;
    if ((key === "meta" || key === "cmd" || key === "super") && currentHeldMods.meta) return true;
    return false;
}

// Format modifier with held keys highlighted (returns HTML string for DOM injection)
function formatModifierHTML(mod: string): string {
    return mod.split("+").map(s => s.trim().toLowerCase()).map(s => {
        const abbrev = MOD_ABBREV[s] ?? s.charAt(0).toUpperCase();
        const held = isModHeld(s);
        return held
            ? `<span class="vc-hotkeyNav-keycap-held">${abbrev}</span>`
            : `<span class="vc-hotkeyNav-keycap-dim">${abbrev}</span>`;
    }).join("+");
}

function KeycapHint({ notifNum, positionalNum, layerType }: {
    notifNum: number | null;
    positionalNum: number | null;
    layerType: "dm" | "server";
}) {
    if (notifNum == null && positionalNum == null) return null;

    const side = settings.store.keycapSide;
    const className = `vc-hotkeyNav-keycap vc-hotkeyNav-keycap-${side}`;

    // Combined keycap: both notification and positional
    if (notifNum != null && positionalNum != null) {
        const notifMod = formatModifier(settings.store.notificationModifier);
        const posMod = formatModifier(layerType === "dm"
            ? settings.store.dmPositionalModifier
            : settings.store.serverPositionalModifier);
        const tooltipText = `${notifMod}+${notifNum} (notif) | ${posMod}+${positionalNum} (pos)`;

        return (
            <Tooltip text={tooltipText}>
                {(tooltipProps: any) => (
                    <div {...tooltipProps} className={className} style={{ pointerEvents: "auto" }}>
                        <span>{notifNum}</span>
                        <span className="vc-hotkeyNav-keycap-divider">{"\u2502"}</span>
                        <span className="vc-hotkeyNav-keycap-dim">{positionalNum}</span>
                    </div>
                )}
            </Tooltip>
        );
    }

    // Single keycap — show full key combo with held keys highlighted
    const isNotif = notifNum != null;
    const num = notifNum ?? positionalNum;
    const rawMod = isNotif
        ? settings.store.notificationModifier
        : (layerType === "dm" ? settings.store.dmPositionalModifier : settings.store.serverPositionalModifier);
    const modParts = rawMod.split("+").map(s => s.trim().toLowerCase());
    const label = `${formatModifier(rawMod)}+${num}`;

    return (
        <Tooltip text={label}>
            {(tooltipProps: any) => (
                <div {...tooltipProps} className={className} style={{ pointerEvents: "auto" }}>
                    {modParts.map((part, i) => (
                        <span key={i}>
                            {i > 0 && "+"}
                            <span className={isModHeld(part) ? "vc-hotkeyNav-keycap-held" : "vc-hotkeyNav-keycap-dim"}>
                                {MOD_ABBREV[part] ?? part.charAt(0).toUpperCase()}
                            </span>
                        </span>
                    ))}
                    <span>+{num}</span>
                </div>
            )}
        </Tooltip>
    );
}

// DM decorator — rendered via MemberListDecorators API
function DmKeycapDecorator({ channel }: { channel: any; }) {
    useNotificationTracker();

    const channelId = channel?.id;
    if (!channelId) return null;

    const notifNum = shouldShowLayer("notification") ? NotificationTracker.getNotificationNumber(channelId) : null;
    const positionalNum = shouldShowLayer("dm") ? NotificationTracker.getDmPosition(channelId) : null;

    if (notifNum == null && positionalNum == null) return null;

    return (
        <div className="vc-hotkeyNav-dm-decorator">
            <KeycapHint notifNum={notifNum} positionalNum={positionalNum} layerType="dm" />
        </div>
    );
}

// ─── Guild bar DOM injection ───────────────────────────────────────────────

let guildObserver: MutationObserver | null = null;
let guildUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function updateGuildHints() {
    const guildNav = document.querySelector('[aria-label="Servers sidebar"]') ?? document.querySelector("nav ul");
    if (!guildNav) return;

    // Remove existing hints
    document.querySelectorAll(".vc-hotkeyNav-guild-hint").forEach(el => el.remove());

    const folders = SortedGuildStore.getGuildFolders();
    let pos = 0;

    outer: for (const folder of folders) {
        for (const guildId of folder.guildIds) {
            if (pos >= 9) break outer;

            const notifNum = shouldShowLayer("notification") ? NotificationTracker.getNotificationNumberByGuild(guildId) : null;
            const serverPos = shouldShowLayer("server") ? NotificationTracker.getServerPosition(guildId) : null;

            if (notifNum == null && serverPos == null) {
                pos++;
                continue;
            }

            // Find the guild icon element — data-list-item-id is inside SVG foreignObject
            const guildEl = document.querySelector(`[data-list-item-id="guildsnav___${guildId}"]`);
            if (!guildEl) {
                pos++;
                continue;
            }

            // Walk OUT of the SVG foreignObject chain to a regular HTML container
            // Ancestor chain: wrapper__6e9f8 > foreignObject > svg > wrapper_cc5dd2 > foreignObject > svg > wrapper_cc5dd2 > blobContainer
            // We need blobContainer or listItem — anything outside all SVGs
            let containerEl: HTMLElement | null = guildEl as HTMLElement;
            while (containerEl && (containerEl.closest("svg") || containerEl.closest("foreignObject"))) {
                containerEl = containerEl.parentElement;
            }
            if (!containerEl) {
                pos++;
                continue;
            }

            // Ensure relative positioning
            if (getComputedStyle(containerEl).position === "static") {
                containerEl.style.position = "relative";
            }

            const hint = document.createElement("div");
            hint.className = "vc-hotkeyNav-guild-hint vc-hotkeyNav-keycap vc-hotkeyNav-keycap-" + settings.store.keycapSide;

            if (notifNum != null && serverPos != null) {
                const notifMod = formatModifier(settings.store.notificationModifier);
                const serverMod = formatModifier(settings.store.serverPositionalModifier);
                hint.innerHTML = `<span>${notifNum}</span><span class="vc-hotkeyNav-keycap-divider">\u2502</span><span class="vc-hotkeyNav-keycap-dim">${serverPos}</span>`;
                hint.title = `${notifMod}+${notifNum} (notif) | ${serverMod}+${serverPos} (pos)`;
            } else {
                const isNotif = notifNum != null;
                const num = notifNum ?? serverPos;
                const rawMod = isNotif ? settings.store.notificationModifier : settings.store.serverPositionalModifier;
                hint.innerHTML = `${formatModifierHTML(rawMod)}+<span>${num}</span>`;
                hint.title = `${formatModifier(rawMod)}+${num}`;
            }

            containerEl.appendChild(hint);
            pos++;
        }
    }

    // DM notification bubbles above guild bar — inside #guild-list-unread-dms.
    // Structure: #guild-list-unread-dms > div(animation wrapper) > div(listItem)
    // The data-list-item-id is deep inside SVG foreignObject.
    if (shouldShowLayer("dm")) {
        const dmGroup = document.getElementById("guild-list-unread-dms");
        if (dmGroup) {
            const dmIds = PrivateChannelSortStore.getPrivateChannelIds();
            // Each direct child of dmGroup is an animation wrapper containing one DM bubble
            for (const wrapper of Array.from(dmGroup.children)) {
                const dataEl = wrapper.querySelector("[data-list-item-id^='guildsnav___']");
                if (!dataEl) continue;

                const channelId = (dataEl.getAttribute("data-list-item-id") ?? "").replace("guildsnav___", "");
                const dmIdx = dmIds.indexOf(channelId);
                if (dmIdx === -1 || dmIdx >= 9) continue;

                // Append to the animation wrapper div itself (outside SVG)
                const containerEl = wrapper as HTMLElement;
                containerEl.style.position = "relative";

                const dmHint = document.createElement("div");
                dmHint.className = "vc-hotkeyNav-guild-hint vc-hotkeyNav-keycap vc-hotkeyNav-keycap-" + settings.store.keycapSide;
                const rawMod = settings.store.dmPositionalModifier;
                dmHint.innerHTML = `${formatModifierHTML(rawMod)}+<span>${dmIdx + 1}</span>`;
                dmHint.title = `${formatModifier(rawMod)}+${dmIdx + 1}`;
                containerEl.appendChild(dmHint);
            }
        }
    }
}

function scheduleGuildUpdate() {
    if (guildUpdateTimer) clearTimeout(guildUpdateTimer);
    guildUpdateTimer = setTimeout(updateGuildHints, 100);
}

function startGuildObserver() {
    // Initial render
    updateGuildHints();

    // Watch for DOM changes in the guild bar
    const target = document.querySelector('[class*="guilds"]');
    if (!target) {
        console.warn("[HotkeyNav] Guild list element not found, guild observer disabled");
        return;
    }
    guildObserver = new MutationObserver(scheduleGuildUpdate);
    guildObserver.observe(target, { childList: true, subtree: true });
}

function stopGuildObserver() {
    guildObserver?.disconnect();
    guildObserver = null;
    if (guildUpdateTimer) clearTimeout(guildUpdateTimer);
    guildUpdateTimer = null;
    document.querySelectorAll(".vc-hotkeyNav-guild-hint").forEach(el => el.remove());
}

// ─── Channel nav types and state ───────────────────────────────────────────

interface CategoryInfo {
    categoryId: string | null; // null = uncategorized
    name: string;
    channels: { id: string; name: string; type: number; }[];
}

let activeCategoryIndex: number | null = null;
let categoryTimeout: ReturnType<typeof setTimeout> | null = null;
let channelObserver: MutationObserver | null = null;
let channelUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let activeChordHandler: ((e: KeyboardEvent) => void) | null = null;
let activeChordTimeout: ReturnType<typeof setTimeout> | null = null;

function getTargetGuildId(): string | null {
    return SelectedGuildStore.getGuildId() ?? SelectedGuildStore.getLastSelectedGuildId();
}

function resolveChannels(ids: string[]): { id: string; name: string; type: number; }[] {
    return ids
        .map(id => {
            const ch = ChannelStore.getChannel(id);
            return ch ? { id: ch.id, name: ch.name, type: ch.type } : null;
        })
        .filter((ch): ch is { id: string; name: string; type: number; } => ch != null)
        .slice(0, 9);
}

function getCategories(guildId: string): CategoryInfo[] {
    const guild = ChannelListStore.getGuild(guildId);
    if (!guild) return [];
    const gc = guild.guildChannels;
    const result: CategoryInfo[] = [];

    // 1. Favorites as virtual category (configurable)
    if (settings.store.treatFavoritesAsCategory) {
        const favs = gc.favoritesCategory;
        if (favs?.shownChannelIds?.length > 0) {
            const channels = resolveChannels(favs.shownChannelIds);
            if (channels.length > 0) {
                result.push({
                    categoryId: "__favorites__",
                    name: "Favorites",
                    channels,
                });
            }
        }
    }

    // 2. Named categories in visual order
    const sorted = gc.getSortedNamedCategories();
    for (const cat of sorted) {
        if (result.length >= 9) break;
        if (cat.isCollapsed && !settings.store.includeCollapsedCategories) continue;

        const channelIds = cat.shownChannelIds ?? [];
        const channels = resolveChannels(channelIds);
        if (channels.length === 0) continue;

        result.push({
            categoryId: cat.id ?? null,
            name: cat.record?.name ?? "Unnamed",
            channels: channels.slice(0, 9),
        });
    }

    // 3. Uncategorized channels at the end
    if (result.length < 9) {
        const noParent = gc.noParentCategory;
        if (noParent?.shownChannelIds?.length > 0) {
            const channels = resolveChannels(noParent.shownChannelIds);
            if (channels.length > 0) {
                result.push({
                    categoryId: null,
                    name: "Uncategorized",
                    channels: channels.slice(0, 9),
                });
            }
        }
    }

    return result;
}

function exitCategoryState() {
    activeCategoryIndex = null;
    if (categoryTimeout) clearTimeout(categoryTimeout);
    categoryTimeout = null;
    scheduleChannelUpdate();
}

function enterCategoryState(catIndex: number) {
    activeCategoryIndex = catIndex;
    if (categoryTimeout) clearTimeout(categoryTimeout);
    categoryTimeout = setTimeout(exitCategoryState, settings.store.channelTimeout);
    scheduleChannelUpdate();
}

// ─── Channel list DOM injection ────────────────────────────────────────────

function updateChannelHints() {
    // Remove existing hints and states
    document.querySelectorAll(".vc-hotkeyNav-channel-hint").forEach(el => el.remove());
    document.querySelectorAll(".vc-hotkeyNav-cat-active").forEach(el => el.classList.remove("vc-hotkeyNav-cat-active"));
    document.querySelectorAll(".vc-hotkeyNav-cat-dimmed").forEach(el => el.classList.remove("vc-hotkeyNav-cat-dimmed"));

    if (!shouldShowLayer("channel") && activeCategoryIndex == null) return;

    const guildId = getTargetGuildId();
    if (!guildId) return;

    const categories = getCategories(guildId);
    const channelMod = formatModifier(settings.store.channelModifier);
    const isStateful = settings.store.channelNavMode === "stateful";
    const inCategory = activeCategoryIndex != null;

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        const cat = categories[catIdx];
        const catNum = catIdx + 1;

        for (let chIdx = 0; chIdx < cat.channels.length; chIdx++) {
            const ch = cat.channels[chIdx];
            const chNum = chIdx + 1;

            // Find channel element by data-list-item-id on the <a> tag
            const channelLink = document.querySelector(`[data-list-item-id="channels___${ch.id}"]`);
            if (!channelLink) continue;

            // Walk up to the <li> container (containerDefault)
            const channelRow = channelLink.closest("li[class*='container']") ?? channelLink.closest("li") ?? channelLink.parentElement?.parentElement;
            if (!channelRow) continue;

            const containerEl = channelRow as HTMLElement;

            // Apply active/dimmed states in stateful mode
            if (isStateful && inCategory) {
                if (catIdx === activeCategoryIndex) {
                    containerEl.classList.add("vc-hotkeyNav-cat-active");
                } else {
                    containerEl.classList.add("vc-hotkeyNav-cat-dimmed");
                }
            }

            // Ensure relative positioning for the keycap overlay
            if (getComputedStyle(containerEl).position === "static") {
                containerEl.style.position = "relative";
            }

            const hint = document.createElement("div");
            hint.className = "vc-hotkeyNav-channel-hint vc-hotkeyNav-keycap vc-hotkeyNav-keycap-" + settings.store.keycapSide;

            if (isStateful && inCategory && catIdx === activeCategoryIndex) {
                // Inside active category — show just the channel number
                hint.innerHTML = `<span>${chNum}</span>`;
                hint.title = `Press ${chNum} to navigate`;
            } else {
                // Show dot notation: mod+catNum.chNum
                const channelModHTML = formatModifierHTML(settings.store.channelModifier);
                hint.innerHTML = `${channelModHTML}+<span class="vc-hotkeyNav-keycap-dim">${catNum}.</span><span>${chNum}</span>`;
                hint.title = `${channelMod}+${catNum} then ${chNum}`;
            }

            containerEl.appendChild(hint);
        }
    }
}

function scheduleChannelUpdate() {
    if (channelUpdateTimer) clearTimeout(channelUpdateTimer);
    channelUpdateTimer = setTimeout(updateChannelHints, 100);
}

function startChannelObserver() {
    // Delay initial render to let Discord load the channel list
    setTimeout(updateChannelHints, 500);

    // Watch for DOM changes — use content area since channel list is inside it
    const target = document.querySelector('[class*="content"]');
    if (!target) {
        console.warn("[HotkeyNav] Content element not found, channel observer disabled");
        return;
    }
    channelObserver = new MutationObserver(scheduleChannelUpdate);
    channelObserver.observe(target, { childList: true, subtree: true });
}

function stopChannelObserver() {
    channelObserver?.disconnect();
    channelObserver = null;
    if (channelUpdateTimer) clearTimeout(channelUpdateTimer);
    channelUpdateTimer = null;
    exitCategoryState();
    document.querySelectorAll(".vc-hotkeyNav-channel-hint").forEach(el => el.remove());
    document.querySelectorAll(".vc-hotkeyNav-cat-active").forEach(el => el.classList.remove("vc-hotkeyNav-cat-active"));
    document.querySelectorAll(".vc-hotkeyNav-cat-dimmed").forEach(el => el.classList.remove("vc-hotkeyNav-cat-dimmed"));
}

// ─── settings ──────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    // Keybind settings
    notificationModifier: {
        type: OptionType.STRING,
        description: "Modifier key(s) for notification jump (e.g., alt, ctrl+alt)",
        default: "ctrl+alt",
    },
    dmPositionalModifier: {
        type: OptionType.STRING,
        description: "Modifier key(s) for DM positional jump",
        default: "alt",
    },
    serverPositionalModifier: {
        type: OptionType.STRING,
        description: "Modifier key(s) for server positional jump",
        default: "alt+shift",
    },
    enableNotificationLayer: {
        type: OptionType.BOOLEAN,
        description: "Enable notification jump hotkeys",
        default: true,
    },
    enableDmPositionalLayer: {
        type: OptionType.BOOLEAN,
        description: "Enable DM positional hotkeys",
        default: true,
    },
    enableServerPositionalLayer: {
        type: OptionType.BOOLEAN,
        description: "Enable server positional hotkeys",
        default: true,
    },

    // Notification settings
    trackDms: {
        type: OptionType.BOOLEAN,
        description: "Track unread DMs in notification layer",
        default: true,
    },
    trackMentions: {
        type: OptionType.BOOLEAN,
        description: "Track @mentions in notification layer",
        default: true,
    },
    trackRolePings: {
        type: OptionType.BOOLEAN,
        description: "Track @role pings in notification layer (currently grouped with @mentions)",
        default: true,
    },
    trackEveryone: {
        type: OptionType.BOOLEAN,
        description: "Track @everyone/@here in notification layer (currently grouped with @mentions)",
        default: true,
    },
    priorityOrder: {
        type: OptionType.STRING,
        description: "Notification type priority (comma-separated: dm,mention,role,everyone)",
        default: "dm,mention,role,everyone",
    },

    // Channel layer
    enableChannelLayer: {
        type: OptionType.BOOLEAN,
        description: "Enable channel navigation hotkeys (category → channel)",
        default: true,
    },
    channelModifier: {
        type: OptionType.STRING,
        description: "Modifier key(s) for channel navigation",
        default: "ctrl",
    },
    channelNavMode: {
        type: OptionType.SELECT,
        description: "Channel navigation mode",
        options: [
            { label: "Stateful — enter category, then pick channel", value: "stateful", default: true },
            { label: "Chord — rapid two-key sequence", value: "chord" },
        ],
    },
    channelTimeout: {
        type: OptionType.NUMBER,
        description: "Timeout in ms for category state / chord window",
        default: 3000,
    },
    includeCollapsedCategories: {
        type: OptionType.BOOLEAN,
        description: "Include channels in collapsed categories",
        default: true,
    },
    treatFavoritesAsCategory: {
        type: OptionType.BOOLEAN,
        description: "Treat pinned/favorite channels as their own category (Ctrl+1)",
        default: true,
    },

    // Visual settings
    alwaysShowHints: {
        type: OptionType.BOOLEAN,
        description: "Always show keycap hints (even when no notifications)",
        default: true,
    },
    showHintsOnModHold: {
        type: OptionType.BOOLEAN,
        description: "Show relevant hints when holding a modifier key (when always-show is off)",
        default: true,
    },
    keycapSide: {
        type: OptionType.SELECT,
        description: "Which side of the avatar to show keycap hints",
        options: [
            { label: "Left", value: "left", default: true },
            { label: "Right", value: "right" },
        ],
    },
    keycapStyle: {
        type: OptionType.SELECT,
        description: "Visual style of keycap hint badges",
        options: [
            { label: "Outlined", value: "outlined", default: true },
            { label: "Filled", value: "filled" },
            { label: "Minimal", value: "minimal" },
        ],
    },
    keycapSize: {
        type: OptionType.NUMBER,
        description: "Size of keycap hint badges in pixels",
        default: 18,
    },
    hintOpacity: {
        type: OptionType.NUMBER,
        description: "Opacity of keycap hints (0.1 to 1.0)",
        default: 1.0,
    },
});

// ─── External action registry ─────────────────────────────────────────────

export interface ExternalAction {
    id: string;
    description: string;
    defaultModifier: string;
    defaultKey: string;
    handler: () => void;
}

const externalActions = new Map<string, ExternalAction>();

export function registerAction(id: string, opts: {
    description: string;
    defaultModifier: string;
    defaultKey: string;
    handler: () => void;
}): void {
    externalActions.set(id, { id, ...opts });
}

export function unregisterAction(id: string): void {
    externalActions.delete(id);
}

// ─── modifier hold detection ───────────────────────────────────────────────

// Tracks which layers should show hints due to modifier hold
let heldLayers: Set<string> = new Set(); // "notification" | "dm" | "server" | "channel"
let currentHeldMods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; } = { ctrl: false, alt: false, shift: false, meta: false };

function getHeldModifiers(e: KeyboardEvent): { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; } {
    return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
}

function modOverlaps(layerMod: string, held: ReturnType<typeof getHeldModifiers>): boolean {
    // Show layer if ANY of the held modifiers are part of the layer's modifier combo
    // e.g., holding Alt shows "alt", "alt+shift", "ctrl+alt" layers
    const parsed = parseModifier(layerMod);
    if (parsed.ctrl && held.ctrl) return true;
    if (parsed.alt && held.alt) return true;
    if (parsed.shift && held.shift) return true;
    if (parsed.meta && held.meta) return true;
    return false;
}

function updateHeldLayers(held: ReturnType<typeof getHeldModifiers>) {
    const newLayers = new Set<string>();
    const store = settings.store;

    if (store.enableNotificationLayer && modOverlaps(store.notificationModifier, held)) newLayers.add("notification");
    if (store.enableDmPositionalLayer && modOverlaps(store.dmPositionalModifier, held)) newLayers.add("dm");
    if (store.enableServerPositionalLayer && modOverlaps(store.serverPositionalModifier, held)) newLayers.add("server");
    if (store.enableChannelLayer && modOverlaps(store.channelModifier, held)) newLayers.add("channel");

    currentHeldMods = { ...held };

    // Only update if changed
    const changed = newLayers.size !== heldLayers.size || [...newLayers].some(l => !heldLayers.has(l));
    if (changed) {
        heldLayers = newLayers;
        // Trigger hint re-render
        NotificationTracker._listeners.forEach(fn => fn()); // DM decorator re-renders
        scheduleGuildUpdate();
        scheduleChannelUpdate();
    }
}

function onModKeyDown(e: KeyboardEvent) {
    if (!settings.store.showHintsOnModHold && !settings.store.alwaysShowHints) return;
    if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta") {
        updateHeldLayers(getHeldModifiers(e));
    }
}

function onModKeyUp(e: KeyboardEvent) {
    if (!settings.store.showHintsOnModHold && !settings.store.alwaysShowHints) return;
    if (e.key === "Control" || e.key === "Alt" || e.key === "Shift" || e.key === "Meta") {
        updateHeldLayers(getHeldModifiers(e));
    }
}

function shouldShowLayer(layer: string): boolean {
    if (settings.store.alwaysShowHints) return true;
    return heldLayers.has(layer);
}

// ─── event handlers ────────────────────────────────────────────────────────

function onWindowBlur() {
    if (heldLayers.size > 0) {
        heldLayers.clear();
        NotificationTracker._listeners.forEach(fn => fn());
        scheduleGuildUpdate();
        scheduleChannelUpdate();
    }
}

function onReadStateChange() {
    NotificationTracker.rebuild();
    scheduleGuildUpdate();
    scheduleChannelUpdate();
}

function onGuildSelect() {
    exitCategoryState();
    scheduleChannelUpdate();
}

function flashNavigationTarget(channelId: string) {
    if (document.body.classList.contains("vc-anim-off")) return;
    // Small delay to let Discord render the channel as selected first
    setTimeout(() => {
        const row = document.querySelector(`[data-list-item-id="channels___${channelId}"]`);
        if (!row) return;
        row.classList.remove("vc-hotkeyNav-nav-flash"); // reset if already flashing
        void (row as HTMLElement).offsetWidth; // force reflow to restart animation
        row.classList.add("vc-hotkeyNav-nav-flash");
        row.addEventListener("animationend", () => row.classList.remove("vc-hotkeyNav-nav-flash"), { once: true });
    }, 100);
}

function onKeyDown(e: KeyboardEvent) {
    const store = settings.store;

    // Esc exits channel category state
    if (e.key === "Escape" && activeCategoryIndex != null) {
        e.preventDefault();
        exitCategoryState();
        return;
    }

    // Use e.code (physical key) so Shift+1 doesn't become "!"
    const digitMatch = e.code.match(/^Digit([1-9])$/);
    if (!digitMatch) return;
    if (e.repeat) return;

    const num = parseInt(digitMatch[1]);

    // Channel layer: stateful mode — bare digit selects channel when in category
    if (activeCategoryIndex != null && store.enableChannelLayer) {
        const noMods = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
        if (noMods) {
            const guildId = getTargetGuildId();
            if (guildId) {
                const categories = getCategories(guildId);
                const cat = categories[activeCategoryIndex];
                const ch = cat?.channels[num - 1];
                if (ch) {
                    e.preventDefault();
                    e.stopPropagation();
                    NavigationRouter.transitionToGuild(guildId);
                    ChannelRouter.transitionToChannel(ch.id);
                    flashNavigationTarget(ch.id);
                    exitCategoryState();
                    return;
                }
            }
            exitCategoryState();
            return;
        }
    }

    // Check notification layer
    if (store.enableNotificationLayer) {
        const mod = parseModifier(store.notificationModifier);
        if (modifierMatches(e, mod)) {
            const notifications = NotificationTracker.getNotifications();
            const entry = notifications[num - 1];
            if (entry) {
                e.preventDefault();
                e.stopPropagation();
                if (entry.guildId) {
                    NavigationRouter.transitionToGuild(entry.guildId);
                    ChannelRouter.transitionToChannel(entry.channelId);
                } else {
                    ChannelRouter.transitionToChannel(entry.channelId);
                }
                flashNavigationTarget(entry.channelId);
                return;
            }
        }
    }

    // Check DM positional layer
    if (store.enableDmPositionalLayer) {
        const mod = parseModifier(store.dmPositionalModifier);
        if (modifierMatches(e, mod)) {
            const dmIds = PrivateChannelSortStore.getPrivateChannelIds();
            const channelId = dmIds[num - 1];
            if (channelId) {
                e.preventDefault();
                e.stopPropagation();
                ChannelRouter.transitionToChannel(channelId);
                flashNavigationTarget(channelId);
                return;
            }
        }
    }

    // Check server positional layer
    if (store.enableServerPositionalLayer) {
        const mod = parseModifier(store.serverPositionalModifier);
        if (modifierMatches(e, mod)) {
            const folders = SortedGuildStore.getGuildFolders();
            let pos = 0;
            for (const folder of folders) {
                for (const guildId of folder.guildIds) {
                    if (pos === num - 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        // Navigate to last-viewed channel in this guild
                        const lastChannel = SelectedChannelStore.getLastSelectedChannelId(guildId);
                        if (lastChannel) {
                            NavigationRouter.transitionToGuild(guildId);
                            ChannelRouter.transitionToChannel(lastChannel);
                            flashNavigationTarget(lastChannel);
                        } else {
                            NavigationRouter.transitionToGuild(guildId);
                        }
                        return;
                    }
                    pos++;
                }
            }
        }
    }

    // Check channel layer — enter category or chord
    if (store.enableChannelLayer) {
        const mod = parseModifier(store.channelModifier);
        if (modifierMatches(e, mod)) {
            const guildId = getTargetGuildId();
            if (!guildId) return;

            const categories = getCategories(guildId);
            const catIdx = num - 1;
            if (catIdx >= categories.length) return;

            e.preventDefault();
            e.stopPropagation();

            if (store.channelNavMode === "stateful") {
                // Enter category state
                enterCategoryState(catIdx);
                // Also navigate to the guild if we're in DMs
                if (!SelectedGuildStore.getGuildId()) {
                    NavigationRouter.transitionToGuild(guildId);
                }
            } else {
                // Chord mode — wait for second keypress
                // Clean up any previous chord in progress
                if (activeChordHandler) {
                    document.removeEventListener("keydown", activeChordHandler, true);
                    activeChordHandler = null;
                }
                if (activeChordTimeout) {
                    clearTimeout(activeChordTimeout);
                    activeChordTimeout = null;
                }

                const chordHandler = (e2: KeyboardEvent) => {
                    document.removeEventListener("keydown", chordHandler, true);
                    if (activeChordTimeout) clearTimeout(activeChordTimeout);
                    activeChordHandler = null;
                    activeChordTimeout = null;

                    const digit2 = e2.code.match(/^Digit([1-9])$/);
                    if (!digit2) return;
                    e2.preventDefault();
                    e2.stopPropagation();

                    const chNum = parseInt(digit2[1]) - 1;
                    const ch = categories[catIdx]?.channels[chNum];
                    if (ch) {
                        if (!SelectedGuildStore.getGuildId()) {
                            NavigationRouter.transitionToGuild(guildId);
                        }
                        ChannelRouter.transitionToChannel(ch.id);
                        flashNavigationTarget(ch.id);
                    }
                };

                activeChordTimeout = setTimeout(() => {
                    document.removeEventListener("keydown", chordHandler, true);
                    activeChordHandler = null;
                    activeChordTimeout = null;
                }, store.channelTimeout);

                activeChordHandler = chordHandler;
                document.addEventListener("keydown", chordHandler, true);
            }
            return;
        }
    }

    // Check external actions (registered by other plugins like channelTabs)
    for (const [, action] of externalActions) {
        const actionMod = parseModifier(action.defaultModifier);
        if (modifierMatches(e, actionMod) && e.code === action.defaultKey) {
            e.preventDefault();
            e.stopPropagation();
            action.handler();
            return;
        }
    }
}

// ─── plugin ────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "HotkeyNav",
    description: "Keyboard-driven navigation to notifications, DMs, and servers with inline keycap hints",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    dependencies: ["MemberListDecoratorsAPI"],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("HotkeyNav")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        (window as any).__settingsHub?.register(createHotkeyNavSchema(settings));
        NotificationTracker.rebuild();

        // DM hints via MemberListDecorators API
        addMemberListDecorator("hotkeyNav", props => (
            <DmKeycapDecorator channel={props.channel} />
        ), "dms");

        // DOM hint observers
        startGuildObserver();
        startChannelObserver();

        FluxDispatcher.subscribe("MESSAGE_CREATE", onReadStateChange);
        FluxDispatcher.subscribe("CHANNEL_ACK", onReadStateChange);
        FluxDispatcher.subscribe("BULK_ACK", onReadStateChange);
        FluxDispatcher.subscribe("MESSAGE_DELETE", onReadStateChange);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onGuildSelect);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keydown", onModKeyDown);
        document.addEventListener("keyup", onModKeyUp);
        // Reset held state on window blur (user alt-tabbed)
        window.addEventListener("blur", onWindowBlur);
    },

    stop() {
        (window as any).__settingsHub?.unregister("HotkeyNav");
        removeMemberListDecorator("hotkeyNav");
        stopGuildObserver();
        stopChannelObserver();

        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onReadStateChange);
        FluxDispatcher.unsubscribe("CHANNEL_ACK", onReadStateChange);
        FluxDispatcher.unsubscribe("BULK_ACK", onReadStateChange);
        FluxDispatcher.unsubscribe("MESSAGE_DELETE", onReadStateChange);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onGuildSelect);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keydown", onModKeyDown);
        document.removeEventListener("keyup", onModKeyUp);
        window.removeEventListener("blur", onWindowBlur);
        heldLayers.clear();

        // Clean up any in-progress chord
        if (activeChordHandler) {
            document.removeEventListener("keydown", activeChordHandler, true);
            activeChordHandler = null;
        }
        if (activeChordTimeout) {
            clearTimeout(activeChordTimeout);
            activeChordTimeout = null;
        }
    },
});
