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
    getCurrentClientVoiceChannelId: () => string | null;
    isCurrentClientInVoiceChannel: () => boolean;
};

const SpeakingStore = findStoreLazy("SpeakingStore") as {
    isSpeaking: (userId: string) => boolean;
};

const RTCConnectionStore = findStoreLazy("RTCConnectionStore") as {
    isConnected: () => boolean;
    isDisconnected: () => boolean;
    getState: () => string;
    getChannelId: () => string | null;
    getAveragePing: () => number;
    getDuration: () => number;
};

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

const CallActions = findByPropsLazy("disconnect") as {
    disconnect: () => void;
};

const VoiceChannelActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel: (channelId: string) => void;
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
            if (activeCallChannelId && overlayHidden) {
                removeBar().then(() => injectBar());
            }
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
    maxVisibleAvatars: {
        type: OptionType.NUMBER,
        description: "Maximum avatars before +N count",
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

let barContainer: HTMLDivElement | null = null;
let barRoot: ReturnType<typeof createRoot> | null = null;
let overlayHidden = false;
let activeCallChannelId: string | null = null;
let callStartedAt = 0;
let renderScheduled = false;
let isConnectedToCall = false;
let minimizeButton: HTMLButtonElement | null = null;
let minimizeObserver: MutationObserver | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getActiveCallChannel(): { channelId: string; channel: any } | null {
    try {
        const calls = CallStore.getCalls();
        for (const call of calls) {
            const channelId = call.channelId;
            if (!CallStore.isCallActive(channelId)) continue;
            const channel = ChannelStore.getChannel(channelId);
            // type 1 = DM, type 3 = Group DM
            if (channel && (channel.type === 1 || channel.type === 3)) {
                return { channelId, channel };
            }
        }
    } catch { /* stores not ready */ }
    return null;
}

function getChannelName(channel: any): string {
    if (channel.name) return channel.name;
    if (channel.rawRecipients?.length) {
        return channel.rawRecipients.map((r: any) => r.global_name ?? r.username).join(", ");
    }
    return "Call";
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
    // toggleOverlay: navigate to call channel first, then expand
    if (activeCallChannelId) {
        try {
            ChannelRouter.transitionToChannel(activeCallChannelId);
        } catch { /* swallow */ }
    }
    toggleOverlay();
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

function injectBar() {
    if (barContainer) return;

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
                callStartedAt={callStartedAt}
                mode={mode as "strip" | "bottom"}
                isConnected={isConnectedToCall}
                ping={ping}
                onToggleOverlay={toggleOverlay}
                onRejoin={rejoinCall}
                onBarClick={handleBarClick}
            />
        </ErrorBoundary>
    );
}

async function removeBar(): Promise<void> {
    if (!barContainer) return;

    // Exit animation — play it, then tear down
    barContainer.classList.add("vc-anim-fadeOut");
    await new Promise<void>(resolve => {
        barContainer!.addEventListener("animationend", () => resolve(), { once: true });
        setTimeout(resolve, 500); // fallback in case animationend never fires
    });

    barRoot?.unmount();
    barRoot = null;
    barContainer?.remove();
    barContainer = null;
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
    }
}

function startMinimizeObserver() {
    if (minimizeObserver) return;

    const chat = document.querySelector('[class*="chat_"]');
    if (!chat) return;

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
    if (!barContainer) injectBar();
}

function expandOverlay() {
    overlayHidden = false;
    document.body.classList.remove("vc-minimalCallBar-hideOverlay");
    removeBar().then(() => {
        injectMinimizeButton();
        startMinimizeObserver();
    });
}

function toggleOverlay() {
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
    if (overlayHidden && activeCallChannelId) {
        removeBar().then(() => injectBar());
    }
}

// ─── FluxDispatcher handlers ─────────────────────────────────────────────────

function onCallUpdate() {
    try {
        const active = getActiveCallChannel();
        let connected = false;
        if (active) {
            try {
                const myChannel = VoiceStateStore.getCurrentClientVoiceChannelId();
                connected = myChannel === active.channelId;
            } catch { /* store not ready */ }
        }

        if (active && !activeCallChannelId) {
            // New call detected
            activeCallChannelId = active.channelId;
            callStartedAt = Date.now();
            isConnectedToCall = connected;
            // Always collapse overlay — the compact bar replaces it
            overlayHidden = true;
            document.body.classList.add("vc-minimalCallBar-hideOverlay");
            injectBar();
        } else if (active && activeCallChannelId) {
            // Call still active — check if connection state changed
            const wasConnected = isConnectedToCall;
            isConnectedToCall = connected;
            if (wasConnected !== connected) {
                if (connected && !wasConnected) {
                    // Reconnected (or new call on same channel) — reset timer
                    callStartedAt = Date.now();
                }
                if (connected && !overlayHidden) {
                    // Just reconnected — collapse overlay
                    overlayHidden = true;
                    document.body.classList.add("vc-minimalCallBar-hideOverlay");
                    removeMinimizeButton();
                    removeBar().then(() => injectBar());
                }
                scheduleRender();
            }
        } else if (!active && activeCallChannelId) {
            // Call ended — full cleanup
            activeCallChannelId = null;
            isConnectedToCall = false;
            overlayHidden = false;
            document.body.classList.remove("vc-minimalCallBar-hideOverlay");
            removeMinimizeButton();
            void removeBar();
        }
    } catch { /* swallow — FluxDispatcher errors crash gateway */ }
}

function onVoiceStateUpdate() {
    try {
        onCallUpdate();
        if (activeCallChannelId) {
            scheduleRender();
        }
    } catch { /* swallow */ }
}

function onChannelSelect() {
    try {
        if (!activeCallChannelId || !overlayHidden) return;
        // Re-inject bar after navigation (Discord may have destroyed our container)
        setTimeout(() => {
            removeBar().then(() => injectBar());
        }, 100);
    } catch { /* swallow */ }
}

// ─── Mode B API (for channelTabs integration) ────────────────────────────────

function exposeTabAPI() {
    (window as any).__minimalCallBar = {
        isActive: () => overlayHidden && activeCallChannelId !== null,
        isConnected: () => isConnectedToCall,
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
                callStartedAt,
                isConnected: isConnectedToCall,
                ping,
                participants: voiceStates.map((vs: any) => ({
                    userId: vs.userId,
                    muted: vs.selfMute || vs.mute,
                    deafened: vs.selfDeaf || vs.deaf,
                    speaking: SpeakingStore?.isSpeaking?.(vs.userId) ?? false,
                })),
            };
        },
        controls: {
            toggleMute: () => MediaEngineActions.toggleSelfMute(),
            toggleDeafen: () => MediaEngineActions.toggleSelfDeaf(),
            toggleCamera: () => VideoActions.toggleVideo(),
            toggleScreenshare: () => ScreenshareActions.toggleScreenShare(),
            disconnect: () => CallActions.disconnect(),
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
    description: "Replaces the large DM/Group DM call overlay with a compact 32px bar",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,

    start() {
        // FluxDispatcher subscriptions
        FluxDispatcher.subscribe("CALL_UPDATE", onCallUpdate);
        FluxDispatcher.subscribe("CALL_DELETE", onCallUpdate);
        FluxDispatcher.subscribe("CALL_CREATE", onCallUpdate);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.subscribe("RTC_CONNECTION_STATE", onCallUpdate);

        // Mode B API
        exposeTabAPI();

        // Register keybinds with central registry
        window.__keybindRegistry?.register({
            plugin: "MinimalCallBar",
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

        // Check if already in a call
        setTimeout(() => onCallUpdate(), 500);
    },

    stop() {
        // FluxDispatcher cleanup
        FluxDispatcher.unsubscribe("CALL_UPDATE", onCallUpdate);
        FluxDispatcher.unsubscribe("CALL_DELETE", onCallUpdate);
        FluxDispatcher.unsubscribe("CALL_CREATE", onCallUpdate);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.unsubscribe("RTC_CONNECTION_STATE", onCallUpdate);

        // Keybind registry cleanup
        window.__keybindRegistry?.unregister("MinimalCallBar");

        // Mode B API cleanup
        removeTabAPI();

        // settingsHub cleanup
        (window as any).__settingsHub?.unregister("MinimalCallBar");

        // DOM cleanup
        overlayHidden = false;
        activeCallChannelId = null;
        isConnectedToCall = false;
        document.body.classList.remove("vc-minimalCallBar-hideOverlay");
        removeMinimizeButton();
        void removeBar();
    },
});
