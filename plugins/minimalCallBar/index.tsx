// plugins/minimalCallBar/index.tsx

/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, createRoot, FluxDispatcher, React } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

import { ChannelRouter } from "@webpack/common";

import { CompactBar } from "./components/CompactBar";
import { ControlButton } from "./components/ControlButton";
import { createMinimalCallBarSchema } from "./settingsSchema";

// ─── Lazy stores and actions ─────────────────────────────────────────────────

const CallStore = findStoreLazy("CallStore") as {
    getCalls: () => Array<{ channelId: string; [key: string]: any }>;
    isCallActive: (channelId: string) => boolean;
};

const VoiceStateStore = findStoreLazy("VoiceStateStore") as {
    getVoiceStatesForChannel: (channelId: string) => Record<string, any>;
    /** NOTE: takes a guildId (null for DMs). Calling it with no args always returns null. */
    getCurrentClientVoiceChannelId: (guildId: string | null) => string | null;
    getVoiceStateForUser: (userId: string) => { channelId?: string; connectedAt?: number; } | undefined;
    isCurrentClientInVoiceChannel: () => boolean;
};

const SelectedChannelStore = findStoreLazy("SelectedChannelStore") as {
    /** Channel we are joined (or joining) to for voice — guild VC or DM call. Null when not in voice. */
    getVoiceChannelId: () => string | null;
    getChannelId: () => string | null;
};

const GuildStore = findStoreLazy("GuildStore") as {
    getGuild: (guildId: string) => { name: string; } | undefined;
};

const SpeakingStore = findStoreLazy("SpeakingStore") as {
    isSpeaking: (userId: string) => boolean;
};

const RTCConnectionStore = findStoreLazy("RTCConnectionStore") as {
    isConnected: () => boolean;
    isDisconnected: () => boolean;
    getState: () => string;
    getChannelId: () => string | null;
    getGuildId: () => string | null;
    getAveragePing: () => number;
    getDuration: () => number;
};

const UserStore = findStoreLazy("UserStore") as {
    getCurrentUser: () => { id: string; } | undefined;
};

/** Governs the in-call layout, including whether the voice channel's text chat renders. */
const ChannelRTCStore = findStoreLazy("ChannelRTCStore") as {
    getLayout: (channelId: string) => string;
    getChatOpen: (channelId: string) => boolean;
};

const ChannelRTCActions = findByPropsLazy("updateLayout", "updateChatOpen") as {
    updateLayout: (channelId: string, layout: string) => void;
    updateChatOpen: (channelId: string, open: boolean) => void;
};

const RTC_LAYOUT_NO_CHAT = "no-chat";
const RTC_LAYOUT_NORMAL = "normal";

const MediaEngineActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf") as {
    toggleSelfMute: () => void;
    toggleSelfDeaf: () => void;
};

const VideoActions = findByPropsLazy("toggleVideo") as {
    toggleVideo: () => void;
};

const ScreenshareActions = findByPropsLazy("toggleScreenShare") as {
    toggleScreenShare: () => void;
};

const VoiceChannelActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel: (channelId: string) => void;
    disconnect: () => void;
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    displayMode: {
        type: OptionType.SELECT,
        description: "Where the compact call bar appears (cycle with keybind)",
        options: [
            { label: "Inline Strip (below tabs)", value: "strip", default: true },
            { label: "Tab Integration", value: "tab" },
            { label: "Bottom Strip (above input)", value: "bottom" },
        ],
        onChange: () => {
            if (activeCallChannelId && overlayHidden) rebuildBar();
        },
    },
    showMic: {
        type: OptionType.BOOLEAN,
        description: "Show mic toggle button",
        default: true,
    },
    showDeafen: {
        type: OptionType.BOOLEAN,
        description: "Show deafen toggle button",
        default: true,
    },
    showCamera: {
        type: OptionType.BOOLEAN,
        description: "Show camera toggle button",
        default: true,
    },
    showScreenshare: {
        type: OptionType.BOOLEAN,
        description: "Show screenshare button",
        default: true,
    },
    showOverflow: {
        type: OptionType.BOOLEAN,
        description: "Show overflow menu button",
        default: true,
    },
    responsiveAvatars: {
        type: OptionType.BOOLEAN,
        description: "Fit as many avatars as the bar width allows (ignores the max avatars setting)",
        default: true,
    },
    maxVisibleAvatars: {
        type: OptionType.NUMBER,
        description: "Maximum avatars before +N count (used when responsive avatars is off)",
        default: 3,
    },
    tooltipUsers: {
        type: OptionType.BOOLEAN,
        description: "Show user list in hover tooltip",
        default: true,
    },
    tooltipDuration: {
        type: OptionType.BOOLEAN,
        description: "Show call duration in hover tooltip",
        default: true,
    },
    tooltipChannel: {
        type: OptionType.BOOLEAN,
        description: "Show channel info in hover tooltip",
        default: true,
    },
    hoverDelay: {
        type: OptionType.NUMBER,
        description: "Hover delay before tooltip appears (ms)",
        default: 300,
    },
    clickAction: {
        type: OptionType.SELECT,
        description: "What clicking the bar does",
        options: [
            { label: "Toggle full overlay", value: "toggleOverlay", default: true },
            { label: "Navigate to call", value: "navigate" },
        ],
    },
    expandWhenViewing: {
        type: OptionType.SELECT,
        description: "Show the full call view while you are viewing the call's own channel",
        options: [
            { label: "Server voice channels only", value: "guild", default: true },
            { label: "Never (always compact)", value: "never" },
            { label: "Always (DM calls too)", value: "always" },
        ],
        onChange: () => { manualOverride = false; applyAutoExpand(); },
    },
    showVoiceTextChat: {
        type: OptionType.BOOLEAN,
        description: "Show the voice channel's text chat instead of an empty page when the call view is collapsed",
        default: true,
        onChange: () => {
            if (settings.store.showVoiceTextChat) applyVoiceTextChat();
            else restoreVoiceTextChat();
        },
    },
    keepBarWhenExpanded: {
        type: OptionType.BOOLEAN,
        description: "Keep the compact bar visible while the full call view is showing",
        default: false,
        onChange: () => {
            if (!activeCallChannelId || overlayHidden) return;
            // Only the expanded state changes shape here.
            if (settings.store.keepBarWhenExpanded) injectBar();
            else void removeBar(true);
        },
    },
    keybind_cycleMode: {
        type: OptionType.STRING,
        description: "Keybind to cycle display modes",
        default: "ctrl+shift+KeyM",
    },
    keybind_cycleMode_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable cycle mode keybind",
        default: true,
    },
    keybind_expandCollapse: {
        type: OptionType.STRING,
        description: "Keybind to toggle expand/collapse",
        default: "",
    },
    keybind_expandCollapse_enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable expand/collapse keybind",
        default: false,
    },
});

// ─── Module-level state ──────────────────────────────────────────────────────

export type ConnectionState = "connected" | "connecting" | "disconnected";

let barContainer: HTMLDivElement | null = null;
let barRoot: ReturnType<typeof createRoot> | null = null;
let overlayHidden = false;
let activeCallChannelId: string | null = null;
let activeGuildId: string | null = null;
let connectionState: ConnectionState = "disconnected";
let callStartedAt = 0;
let renderScheduled = false;
let isConnectedToCall = false;
let minimizeButton: HTMLButtonElement | null = null;
let minimizeObserver: MutationObserver | null = null;
let minimizeObserverTarget: Element | null = null;
let removeBarInFlight: Promise<void> | null = null;
/** Bumped on every session enter/switch/exit so async teardown can't resurrect a stale bar. */
let sessionEpoch = 0;
/** Remembers the RTC layout we replaced so it can be restored on leave. */
let layoutOverride: { channelId: string; previous: string; } | null = null;
/** Set when the user manually toggles the overlay; suppresses auto-expand until the view changes. */
let manualOverride = false;

// ─── Voice session resolution ────────────────────────────────────────────────

export interface VoiceSession {
    channelId: string;
    channel: any;
    guildId: string | null;
    /** True for guild voice channels (type 2) and stage channels (type 13). */
    isGuildVoice: boolean;
    connection: ConnectionState;
}

function classifyConnection(channelId: string): ConnectionState {
    try {
        // RTC is authoritative once a media session exists for this exact channel.
        if (RTCConnectionStore.getChannelId() === channelId && RTCConnectionStore.isConnected()) {
            return "connected";
        }
    } catch { /* store not ready */ }
    try {
        // We have selected this channel for voice but RTC has not settled yet.
        if (SelectedChannelStore.getVoiceChannelId() === channelId) return "connecting";
    } catch { /* store not ready */ }
    return "disconnected";
}

/**
 * Resolves the voice session to display, covering both guild voice channels and
 * DM/Group-DM calls.
 *
 * SelectedChannelStore.getVoiceChannelId() is the guild-agnostic source of truth for
 * "the channel we are in" — it is set for guild VCs as well as DM calls, and cleared the
 * moment we leave. CallStore only knows about DM/Group-DM calls, so it is used purely as
 * a fallback to keep showing a rejoinable bar for a ringing/ongoing DM call we are not in.
 */
function resolveVoiceSession(): VoiceSession | null {
    let channelId: string | null = null;
    try { channelId = SelectedChannelStore.getVoiceChannelId(); } catch { /* store not ready */ }

    if (!channelId) {
        // Fallback: an active DM/Group-DM call we are not connected to (rejoin affordance).
        try {
            for (const call of CallStore.getCalls()) {
                if (!CallStore.isCallActive(call.channelId)) continue;
                const ch = ChannelStore.getChannel(call.channelId);
                if (ch && (ch.type === 1 || ch.type === 3)) {
                    channelId = call.channelId;
                    break;
                }
            }
        } catch { /* stores not ready */ }
    }

    if (!channelId) return null;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return null;

    const guildId = channel.guild_id ?? null;
    return {
        channelId,
        channel,
        guildId,
        isGuildVoice: channel.type === 2 || channel.type === 13,
        connection: classifyConnection(channelId),
    };
}

/** Real join timestamp from our own voice state, so timers survive plugin reloads. */
function resolveCallStartedAt(channelId: string): number {
    try {
        const me = UserStore.getCurrentUser();
        const vs = me && VoiceStateStore.getVoiceStateForUser(me.id);
        if (vs?.channelId === channelId && vs.connectedAt) {
            // connectedAt is epoch seconds.
            return vs.connectedAt * 1000;
        }
    } catch { /* store not ready */ }
    return Date.now();
}

function getChannelName(channel: any): string {
    if (channel.name) return channel.name;
    if (channel.rawRecipients?.length) {
        return channel.rawRecipients.map((r: any) => r.global_name ?? r.username).join(", ");
    }
    return "Call";
}

function getGuildName(guildId: string | null): string | undefined {
    if (!guildId) return undefined;
    try { return GuildStore.getGuild(guildId)?.name; } catch { return undefined; }
}

function rejoinCall() {
    if (!activeCallChannelId) return;
    try {
        VoiceChannelActions.selectVoiceChannel(activeCallChannelId);
    } catch { /* swallow */ }
}

function handleBarClick() {
    if (!isConnectedToCall && activeCallChannelId) {
        // Disconnected state: navigate to call channel
        try {
            ChannelRouter.transitionToChannel(activeCallChannelId);
        } catch { /* swallow */ }
        return;
    }
    // Connected state: follow clickAction setting
    if (settings.store.clickAction === "navigate" && activeCallChannelId) {
        try {
            ChannelRouter.transitionToChannel(activeCallChannelId);
        } catch { /* swallow */ }
        return;
    }
    // toggleOverlay: navigate to the call channel, then show the full call view.
    //
    // Deliberately expand rather than toggle: transitionToChannel dispatches CHANNEL_SELECT
    // synchronously, so onChannelSelect's auto-expand may already have run by the time we get
    // here. Toggling would then immediately collapse it again, leaving the overlay hidden with
    // no bar. The bar is only clickable while collapsed, so "expand" is the only sane intent.
    // Capture intent *before* navigating: onChannelSelect's auto-expand runs synchronously
    // inside transitionToChannel and would otherwise flip the state out from under us.
    const wasExpanded = !overlayHidden;
    if (activeCallChannelId) {
        try {
            ChannelRouter.transitionToChannel(activeCallChannelId);
        } catch { /* swallow */ }
    }
    // Set after navigating — onChannelSelect resets manualOverride.
    manualOverride = true;
    if (wasExpanded) collapseOverlay();
    else if (overlayHidden) expandOverlay();
}

// ─── Bar injection ───────────────────────────────────────────────────────────

function getEffectiveMode(): "strip" | "tab" | "bottom" {
    const mode = settings.store.displayMode;
    // Mode B fallback: if channelTabs container not in DOM, fall back to strip
    if (mode === "tab" && !document.querySelector("#vc-channelTabs-container")) {
        return "strip";
    }
    return mode as "strip" | "tab" | "bottom";
}

/**
 * The bar shows whenever the full call view is hidden — or alongside it, when the user has
 * opted into keeping both on screen at once.
 */
function barShouldBeVisible(): boolean {
    if (!activeCallChannelId) return false;
    return overlayHidden || settings.store.keepBarWhenExpanded;
}

function injectBar() {
    if (barContainer) return;
    // Guard against async teardown racing a re-inject after the call already ended.
    if (!barShouldBeVisible()) return;

    const mode = getEffectiveMode();
    if (mode === "tab") return; // Mode B: channelTabs handles rendering via window.__minimalCallBar

    barContainer = document.createElement("div");
    barContainer.id = "vc-minimalCallBar-root";

    if (mode === "strip") {
        const page = document.querySelector('[class*="page_"]');
        if (!page) return;
        // Use CSS order to stay at top alongside channelTabs (which uses order: -1)
        barContainer.style.order = "-1";
        const tabsContainer = page.querySelector("#vc-channelTabs-container");
        if (tabsContainer) {
            tabsContainer.after(barContainer);
        } else {
            page.insertBefore(barContainer, page.firstChild);
        }
    } else if (mode === "bottom") {
        const form = document.querySelector('[class*="channelTextArea_"]');
        if (!form) return;
        form.parentElement?.insertBefore(barContainer, form);
    }

    barRoot = createRoot(barContainer);

    // Entrance animation
    barContainer.classList.add("vc-anim-slideUp");
    barContainer.addEventListener("animationend", () => {
        barContainer?.classList.remove("vc-anim-slideUp");
    }, { once: true });

    renderBar();
}

function renderBar() {
    if (!barRoot || !activeCallChannelId) return;

    const channel = ChannelStore.getChannel(activeCallChannelId);
    if (!channel) return;

    const mode = getEffectiveMode();
    if (mode === "tab") return;

    let ping = 0;
    try { ping = RTCConnectionStore.getAveragePing(); } catch { /* not ready */ }

    barRoot.render(
        <ErrorBoundary>
            <CompactBar
                channelId={activeCallChannelId}
                channelName={getChannelName(channel)}
                guildName={getGuildName(activeGuildId)}
                callStartedAt={callStartedAt}
                mode={mode as "strip" | "bottom"}
                isConnected={isConnectedToCall}
                connection={connectionState}
                ping={ping}
                onToggleOverlay={toggleOverlay}
                onRejoin={rejoinCall}
                onBarClick={handleBarClick}
            />
        </ErrorBoundary>
    );
}

/**
 * @param immediate Skip the exit animation. Used when the full call view is taking the bar's
 * place — playing a 500ms fade while the overlay is already on screen reads as a glitch.
 */
async function removeBar(immediate = false): Promise<void> {
    if (removeBarInFlight) return removeBarInFlight;
    if (!barContainer) return;
    removeBarInFlight = (async () => {
        if (!immediate) {
            // Exit animation — play it, then tear down
            barContainer!.classList.add("vc-anim-fadeOut");
            await new Promise<void>(resolve => {
                barContainer!.addEventListener("animationend", () => resolve(), { once: true });
                setTimeout(resolve, 500); // fallback in case animationend never fires
            });
        }

        barRoot?.unmount();
        barRoot = null;
        barContainer?.remove();
        barContainer = null;
    })().finally(() => { removeBarInFlight = null; });
    return removeBarInFlight;
}

function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
        renderScheduled = false;
        renderBar();
    });
}

// ─── Minimize button injection ──────────────────────────────────────────────

function injectMinimizeButton() {
    // Drop a stale reference to a button Discord already removed from the DOM.
    if (minimizeButton && !minimizeButton.isConnected) minimizeButton = null;
    if (minimizeButton) return;

    const bottomControls = document.querySelector(
        '[class*="chat_"] > [class*="wrapper_"]:has([class*="callContainer_"]) [class*="bottomControls_"]'
    );
    if (!bottomControls) return;

    minimizeButton = document.createElement("button");
    minimizeButton.className = "vc-minimalCallBar-overlayMinimize";
    minimizeButton.title = "Minimize to compact bar";
    minimizeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7.41 15.41L12 10.83L16.59 15.41L18 14L12 8L6 14L7.41 15.41Z"/></svg>';
    minimizeButton.addEventListener("click", (e) => {
        e.stopPropagation();
        collapseOverlay();
    });

    // Inject into the right-side edge controls of the bottom bar
    const rightEdge = bottomControls.querySelectorAll('[class*="edgeControls_"]');
    const rightEdgeEl = rightEdge.length > 1 ? rightEdge[1] : rightEdge[0];
    if (rightEdgeEl) {
        rightEdgeEl.appendChild(minimizeButton);
    } else {
        bottomControls.appendChild(minimizeButton);
    }
}

function removeMinimizeButton() {
    if (minimizeButton) {
        minimizeButton.remove();
        minimizeButton = null;
    }
    if (minimizeObserver) {
        minimizeObserver.disconnect();
        minimizeObserver = null;
        minimizeObserverTarget = null;
    }
}

function startMinimizeObserver() {
    const chat = document.querySelector('[class*="chat_"]');
    if (!chat) return;
    // Discord swaps the chat container on navigation, which silently orphans the observer.
    if (minimizeObserver) {
        if (minimizeObserverTarget?.isConnected && minimizeObserverTarget === chat) return;
        minimizeObserver.disconnect();
    }
    minimizeObserverTarget = chat;

    minimizeObserver = new MutationObserver(() => {
        // Re-inject if overlay was recreated while in expanded state
        if (!overlayHidden && activeCallChannelId && !minimizeButton?.isConnected) {
            minimizeButton = null;
            injectMinimizeButton();
        }
    });
    minimizeObserver.observe(chat, { childList: true, subtree: true });
}

// ─── Overlay expand/collapse ────────────────────────────────────────────────

function collapseOverlay() {
    overlayHidden = true;
    document.body.classList.add("vc-minimalCallBar-hideOverlay");
    removeMinimizeButton();
    if (removeBarInFlight) {
        // A fade-out is still running: barContainer is non-null but doomed, so waiting for the
        // teardown is the only way to avoid ending up with the overlay hidden and no bar.
        const epoch = sessionEpoch;
        void removeBarInFlight.then(() => {
            if (epoch === sessionEpoch) injectBar();
        });
    } else if (!barContainer) {
        injectBar();
    }
}

function expandOverlay() {
    overlayHidden = false;
    document.body.classList.remove("vc-minimalCallBar-hideOverlay");

    if (settings.store.keepBarWhenExpanded) {
        // Both on screen: keep the bar mounted and just hook into the call view.
        injectBar();
        injectMinimizeButton();
        startMinimizeObserver();
        scheduleRender();
        return;
    }

    const epoch = sessionEpoch;
    void removeBar(true).then(() => {
        if (epoch !== sessionEpoch || overlayHidden) return;
        injectMinimizeButton();
        startMinimizeObserver();
    });
}

function toggleOverlay() {
    // A manual toggle wins over the auto-expand preference until the next navigation.
    manualOverride = true;
    if (overlayHidden) {
        expandOverlay();
    } else {
        collapseOverlay();
    }
}

// ─── Mode cycling ────────────────────────────────────────────────────────────

function cycleMode() {
    const modes = ["strip", "tab", "bottom"] as const;
    const current = settings.store.displayMode;
    const idx = modes.indexOf(current as any);
    const next = modes[(idx + 1) % modes.length];
    settings.store.displayMode = next;
    if (overlayHidden && activeCallChannelId) rebuildBar();
}

// ─── FluxDispatcher handlers ─────────────────────────────────────────────────

/**
 * Every event that can start, end, move or interrupt a voice session.
 *
 * VOICE_CHANNEL_SELECT is the important one and was previously missing — it is the event
 * Discord fires when you join, leave or switch a voice channel, and it is the only signal
 * for guild voice channels (which never produce CALL_* events).
 */
const VOICE_EVENTS = [
    "VOICE_CHANNEL_SELECT",
    "RTC_CONNECTION_STATE",
    "CALL_CREATE",
    "CALL_UPDATE",
    "CALL_DELETE",
    "CHANNEL_DELETE",
    "GUILD_DELETE",
    "CONNECTION_CLOSED",
    "LOGOUT",
] as const;

/**
 * Guild voice channels default to the "no-chat" RTC layout, which puts a `noChat_` class on the
 * chat content element and suppresses the channel's text chat entirely. Combined with our own
 * CSS hiding the call view, that leaves a genuinely empty page — Discord renders nothing at all.
 *
 * Switching the layout to "normal" makes Discord render the voice channel's own text chat, so the
 * collapsed state shows the compact bar above a usable chat instead of blank space. The previous
 * layout is remembered and restored, since this is Discord's own persisted per-channel state.
 */
function applyVoiceTextChat() {
    if (!settings.store.showVoiceTextChat) return;
    const channelId = activeCallChannelId;
    // Guild voice only — DM calls already render their conversation.
    if (!channelId || !activeGuildId) return;
    try {
        const current = ChannelRTCStore.getLayout(channelId);
        if (current !== RTC_LAYOUT_NO_CHAT) return;
        layoutOverride = { channelId, previous: current };
        ChannelRTCActions.updateLayout(channelId, RTC_LAYOUT_NORMAL);
    } catch { /* store or actions not ready */ }
}

function restoreVoiceTextChat() {
    if (!layoutOverride) return;
    const { channelId, previous } = layoutOverride;
    layoutOverride = null;
    try {
        // Only revert if nothing else changed it in the meantime.
        if (ChannelRTCStore.getLayout(channelId) === RTC_LAYOUT_NORMAL) {
            ChannelRTCActions.updateLayout(channelId, previous);
        }
    } catch { /* store or actions not ready */ }
}

/** True when the compact bar should yield to Discord's full call view for the current session. */
function shouldAutoExpand(): boolean {
    if (!activeCallChannelId) return false;
    const pref = settings.store.expandWhenViewing;
    if (pref === "never") return false;
    if (pref === "guild" && !activeGuildId) return false;
    try {
        // Only while actually looking at the call's own channel.
        return SelectedChannelStore.getChannelId() === activeCallChannelId;
    } catch { return false; }
}

/** Applies the auto-expand preference unless the user has manually overridden it. */
function applyAutoExpand() {
    if (!activeCallChannelId || manualOverride) return;
    const wantExpanded = shouldAutoExpand();
    if (wantExpanded && overlayHidden) {
        expandOverlay();
    } else if (!wantExpanded && !overlayHidden) {
        collapseOverlay();
    } else if (!barContainer && barShouldBeVisible()) {
        injectBar();
    }
}

/** Tears the bar down and rebuilds it, ignoring the result if the session moved on meanwhile. */
function rebuildBar() {
    const epoch = sessionEpoch;
    void removeBar().then(() => {
        if (epoch !== sessionEpoch) return;
        injectBar();
    });
}

function enterSession(session: VoiceSession) {
    sessionEpoch++;
    activeCallChannelId = session.channelId;
    activeGuildId = session.guildId;
    connectionState = session.connection;
    isConnectedToCall = session.connection === "connected";
    callStartedAt = resolveCallStartedAt(session.channelId);
    manualOverride = false;
    applyVoiceTextChat();

    if (shouldAutoExpand()) {
        overlayHidden = false;
        document.body.classList.remove("vc-minimalCallBar-hideOverlay");
        if (settings.store.keepBarWhenExpanded) injectBar();
        else void removeBar(true);
        injectMinimizeButton();
        startMinimizeObserver();
    } else {
        overlayHidden = true;
        document.body.classList.add("vc-minimalCallBar-hideOverlay");
        injectBar();
    }
}

function exitSession() {
    sessionEpoch++;
    restoreVoiceTextChat();
    activeCallChannelId = null;
    activeGuildId = null;
    connectionState = "disconnected";
    isConnectedToCall = false;
    overlayHidden = false;
    manualOverride = false;
    document.body.classList.remove("vc-minimalCallBar-hideOverlay");
    removeMinimizeButton();
    void removeBar();
}

/**
 * Single reconciliation point for every voice-related event. Handles four transitions:
 * none -> session (join), session -> other channel (switch), connection-state change,
 * and session -> none (leave / call ended / channel or guild deleted).
 */
function syncVoiceState() {
    try {
        const session = resolveVoiceSession();

        if (!session) {
            if (activeCallChannelId) exitSession();
            return;
        }

        if (!activeCallChannelId) {
            enterSession(session);
            return;
        }

        if (session.channelId !== activeCallChannelId) {
            // Switched channels (guild-to-guild hop, or straight from one call into another).
            // Swap state in place rather than tearing down: the widget is the same, only its
            // subject changed, and an animated teardown here would race the re-inject.
            sessionEpoch++;
            restoreVoiceTextChat(); // hand the old channel back its own layout
            activeCallChannelId = session.channelId;
            activeGuildId = session.guildId;
            connectionState = session.connection;
            isConnectedToCall = session.connection === "connected";
            callStartedAt = resolveCallStartedAt(session.channelId);
            manualOverride = false;
            applyVoiceTextChat();
            applyAutoExpand();
            scheduleRender();
            return;
        }

        // Same channel — reconcile connection state.
        const prev = connectionState;
        connectionState = session.connection;
        isConnectedToCall = session.connection === "connected";

        if (prev !== connectionState) {
            if (prev !== "connected" && connectionState === "connected") {
                // Freshly (re)connected — take the authoritative join time.
                callStartedAt = resolveCallStartedAt(session.channelId);
                manualOverride = false;
                applyAutoExpand();
            }
            scheduleRender();
        }

        activeGuildId = session.guildId;
    } catch { /* swallow — throwing from a FluxDispatcher handler breaks the gateway */ }
}

function onVoiceStateUpdate() {
    try {
        syncVoiceState();
        if (activeCallChannelId) scheduleRender();
    } catch { /* swallow */ }
}

function onChannelSelect() {
    try {
        syncVoiceState();
        if (!activeCallChannelId) return;

        // Navigating to/away from the call channel re-arms the auto-expand preference.
        manualOverride = false;
        // Discord recomputes the RTC layout on CHANNEL_SELECT, so re-assert it.
        applyVoiceTextChat();
        applyAutoExpand();

        if (!overlayHidden) {
            // Expanded: Discord rebuilds the call view on navigation, so re-arm our hooks into it.
            setTimeout(() => {
                if (!activeCallChannelId || overlayHidden) return;
                injectMinimizeButton();
                startMinimizeObserver();
                // Navigation can destroy the bar's container even while expanded.
                if (settings.store.keepBarWhenExpanded && !barContainer?.isConnected) {
                    void removeBar(true).then(injectBar);
                }
            }, 100);
            return;
        }
        // Re-inject bar after navigation only if Discord destroyed our container
        setTimeout(() => {
            if (!activeCallChannelId || !overlayHidden) return;
            if (barContainer?.isConnected) {
                scheduleRender(); // container still valid, just re-render
            } else {
                rebuildBar();
            }
        }, 100);
    } catch { /* swallow */ }
}

// ─── Mode B API (for channelTabs integration) ────────────────────────────────

function exposeTabAPI() {
    (window as any).__minimalCallBar = {
        isActive: () => overlayHidden && activeCallChannelId !== null,
        isConnected: () => isConnectedToCall,
        getConnectionState: () => connectionState,
        getCallInfo: () => {
            if (!activeCallChannelId) return null;
            const channel = ChannelStore.getChannel(activeCallChannelId);
            const voiceStates = Object.values(
                VoiceStateStore?.getVoiceStatesForChannel?.(activeCallChannelId) ?? {}
            );
            let ping = 0;
            try { ping = RTCConnectionStore.getAveragePing(); } catch { /* not ready */ }
            return {
                channelId: activeCallChannelId,
                channelName: channel ? getChannelName(channel) : "Call",
                guildId: activeGuildId,
                guildName: getGuildName(activeGuildId),
                isGuildVoice: channel ? (channel.type === 2 || channel.type === 13) : false,
                callStartedAt,
                isConnected: isConnectedToCall,
                connection: connectionState,
                ping,
                participants: voiceStates.map((vs: any) => ({
                    userId: vs.userId,
                    muted: vs.selfMute || vs.mute,
                    deafened: vs.selfDeaf || vs.deaf,
                    video: vs.selfVideo ?? false,
                    streaming: vs.selfStream ?? false,
                    speaking: SpeakingStore?.isSpeaking?.(vs.userId) ?? false,
                })),
            };
        },
        controls: {
            toggleMute: () => MediaEngineActions.toggleSelfMute(),
            toggleDeafen: () => MediaEngineActions.toggleSelfDeaf(),
            toggleCamera: () => VideoActions.toggleVideo(),
            toggleScreenshare: () => ScreenshareActions.toggleScreenShare(),
            disconnect: () => VoiceChannelActions.disconnect(),
            rejoin: () => rejoinCall(),
        },
        CompactBar,
        ControlButton,
        settings,
    };
}

function removeTabAPI() {
    delete (window as any).__minimalCallBar;
}

// ─── Plugin definition ───────────────────────────────────────────────────────

export default definePlugin({
    name: "MinimalCallBar",
    description: "Replaces the large call overlay with a compact 32px bar, for DM calls and server voice channels",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("MinimalCallBar")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        // FluxDispatcher subscriptions
        for (const event of VOICE_EVENTS) FluxDispatcher.subscribe(event, syncVoiceState);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);

        // Mode B API
        exposeTabAPI();

        // Register keybinds with central registry
        window.__keybindRegistry?.register({
            plugin: "MinimalCallBar",
            settings,
            keybinds: {
                cycleMode: {
                    action: "Cycle display mode",
                    defaultKeys: "ctrl+shift+KeyM",
                    defaultEnabled: true,
                    handler: () => cycleMode(),
                },
                expandCollapse: {
                    action: "Toggle expand/collapse",
                    defaultKeys: "",
                    defaultEnabled: false,
                    handler: () => { if (activeCallChannelId) toggleOverlay(); },
                },
            },
        });

        // settingsHub registration
        (window as any).__settingsHub?.register(createMinimalCallBarSchema(settings));

        // Check if we are already in a call / voice channel (plugin reload mid-session)
        setTimeout(() => syncVoiceState(), 500);
    },

    stop() {
        // FluxDispatcher cleanup
        for (const event of VOICE_EVENTS) FluxDispatcher.unsubscribe(event, syncVoiceState);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);

        // Keybind registry cleanup
        window.__keybindRegistry?.unregister("MinimalCallBar");

        // Mode B API cleanup
        removeTabAPI();

        // settingsHub cleanup
        (window as any).__settingsHub?.unregister("MinimalCallBar");

        // DOM cleanup
        exitSession();
    },
});
