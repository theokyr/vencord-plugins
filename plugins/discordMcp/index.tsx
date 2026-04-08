/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import type {
    ProxyMessage,
    PluginMessage,
    ToolCallMessage,
    SubscribeMessage,
    UnsubscribeMessage,
} from "../../proxy/src/protocol";
import { PROTOCOL_VERSION, TOOL_NAMES } from "../../proxy/src/protocol";
import { toolHandlers, activeSubscriptions, logger, setSendFn } from "./shared";
import "./tools/read";
import "./tools/state";
import "./tools/actions";
import "./tools/devtools";
import { setupSubscription } from "./tools/events";
import { createDiscordMcpSchema } from "./settingsSchema";

// ─── Permission types ──────────────────────────────────────────────────

type Permission = "deny" | "prompt" | "allow";

const PERM_OPTIONS_2 = [
    { label: "Deny", value: "deny" },
    { label: "Allow", value: "allow", default: true },
] as const;

const PERM_OPTIONS_3_ALLOW = [
    { label: "Deny", value: "deny" },
    { label: "Prompt", value: "prompt" },
    { label: "Allow", value: "allow", default: true },
] as const;

const PERM_OPTIONS_3_PROMPT = [
    { label: "Deny", value: "deny" },
    { label: "Prompt", value: "prompt", default: true },
    { label: "Allow", value: "allow" },
] as const;

// ─── Settings ──────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    // Group permissions
    readTools: {
        type: OptionType.SELECT,
        description: "Read-only tools (list guilds, read messages, etc.)",
        options: PERM_OPTIONS_2 as any,
    },
    stateTools: {
        type: OptionType.SELECT,
        description: "State tools (presence, unread, selected channel)",
        options: PERM_OPTIONS_2 as any,
    },
    eventTools: {
        type: OptionType.SELECT,
        description: "Event subscription tools",
        options: PERM_OPTIONS_2 as any,
    },
    // Per-tool action permissions
    sendMessage: {
        type: OptionType.SELECT,
        description: "Send messages",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    react: {
        type: OptionType.SELECT,
        description: "Add reactions",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    editMessage: {
        type: OptionType.SELECT,
        description: "Edit own messages",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    deleteMessage: {
        type: OptionType.SELECT,
        description: "Delete own messages",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    setPresence: {
        type: OptionType.SELECT,
        description: "Change status/activity",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    joinVoice: {
        type: OptionType.SELECT,
        description: "Join voice channels",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    leaveVoice: {
        type: OptionType.SELECT,
        description: "Leave voice channels",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    // Build permissions
    rebuildPlugins: {
        type: OptionType.SELECT,
        description: "Build and deploy Vencord plugins (discord_rebuild_plugins)",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    denyRebuildInCall: {
        type: OptionType.BOOLEAN,
        description: "Auto-deny rebuild when in a voice call",
        default: true,
    },
    // DevTools permissions
    evalCode: {
        type: OptionType.SELECT,
        description: "Execute arbitrary JS (discord_eval)",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    querySelector: {
        type: OptionType.SELECT,
        description: "Query DOM selectors",
        options: PERM_OPTIONS_3_ALLOW as any,
    },
    getWebpackModule: {
        type: OptionType.SELECT,
        description: "Read webpack module source",
        options: PERM_OPTIONS_3_ALLOW as any,
    },
    getStore: {
        type: OptionType.SELECT,
        description: "Query Flux stores (can invoke arbitrary store methods)",
        options: PERM_OPTIONS_3_PROMPT as any,
    },
    getVencordPlugins: {
        type: OptionType.SELECT,
        description: "List Vencord plugins",
        options: PERM_OPTIONS_3_ALLOW as any,
    },
    // Prompt UI
    promptPosition: {
        type: OptionType.SELECT,
        description: "Permission prompt position",
        options: [
            { label: "Bottom Right", value: "bottom-right", default: true },
            { label: "Bottom Left", value: "bottom-left" },
            { label: "Top Right", value: "top-right" },
            { label: "Top Left", value: "top-left" },
            { label: "Center", value: "center" },
        ] as any,
    },
    promptOpacity: {
        type: OptionType.SLIDER,
        description: "Permission prompt opacity",
        default: 95,
        markers: [50, 60, 70, 80, 90, 100],
    },
    promptTimeout: {
        type: OptionType.SELECT,
        description: "Permission prompt timeout (0 = wait forever)",
        options: [
            { label: "30 seconds", value: 30 },
            { label: "60 seconds", value: 60, default: true },
            { label: "120 seconds", value: 120 },
            { label: "300 seconds", value: 300 },
            { label: "No timeout", value: 0 },
        ] as any,
    },
});

// ─── Tool → setting key mapping ────────────────────────────────────────

const TOOL_PERMISSION_MAP: Record<string, keyof typeof settings.store> = {
    // Read tools → group
    [TOOL_NAMES.listGuilds]: "readTools",
    [TOOL_NAMES.listChannels]: "readTools",
    [TOOL_NAMES.readMessages]: "readTools",
    [TOOL_NAMES.getUser]: "readTools",
    [TOOL_NAMES.getGuild]: "readTools",
    [TOOL_NAMES.getChannel]: "readTools",
    [TOOL_NAMES.getPinnedMessages]: "readTools",
    [TOOL_NAMES.getThread]: "readTools",
    // State tools → group
    [TOOL_NAMES.getPresence]: "stateTools",
    [TOOL_NAMES.getUnread]: "stateTools",
    [TOOL_NAMES.getSelected]: "stateTools",
    [TOOL_NAMES.listOnline]: "stateTools",
    // Actions → per-tool
    [TOOL_NAMES.sendMessage]: "sendMessage",
    [TOOL_NAMES.react]: "react",
    [TOOL_NAMES.editMessage]: "editMessage",
    [TOOL_NAMES.deleteMessage]: "deleteMessage",
    [TOOL_NAMES.setPresence]: "setPresence",
    [TOOL_NAMES.joinVoice]: "joinVoice",
    [TOOL_NAMES.leaveVoice]: "leaveVoice",
    // Build → per-tool
    [TOOL_NAMES.rebuildPlugins]: "rebuildPlugins",
    // Events → group
    [TOOL_NAMES.subscribe]: "eventTools",
    [TOOL_NAMES.unsubscribe]: "eventTools",
    // DevTools → per-tool
    [TOOL_NAMES.eval]: "evalCode",
    [TOOL_NAMES.querySelector]: "querySelector",
    [TOOL_NAMES.getWebpackModule]: "getWebpackModule",
    [TOOL_NAMES.getStore]: "getStore",
    [TOOL_NAMES.getVencordPlugins]: "getVencordPlugins",
};

// ─── Permission check ──────────────────────────────────────────────────

function getPermission(tool: string): Permission {
    const key = TOOL_PERMISSION_MAP[tool];
    if (!key) return "deny";
    return (settings.store[key] as string as Permission) ?? "deny";
}

// ─── Prompt queue (resolved from confirmation UI) ──────────────────────

interface PendingPrompt {
    id: string;
    tool: string;
    paramsSummary: string;
    resolve: (approved: boolean) => void;
}

let pendingPrompts: PendingPrompt[] = [];

function requestPrompt(id: string, tool: string, params: Record<string, unknown>, overrideSummary?: string): Promise<boolean> {
    const paramsSummary = overrideSummary || Object.entries(params)
        .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 80)}`)
        .join(", ") || "(no parameters)";

    return new Promise(resolve => {
        pendingPrompts.push({ id, tool, paramsSummary, resolve });
        renderPromptUI();
    });
}

function resolvePrompt(id: string, approved: boolean) {
    const idx = pendingPrompts.findIndex(p => p.id === id);
    if (idx >= 0) {
        pendingPrompts[idx].resolve(approved);
        pendingPrompts.splice(idx, 1);
        renderPromptUI();
    }
}

function getPositionStyles(): string {
    const pos = (settings.store.promptPosition as string) || "bottom-right";
    switch (pos) {
        case "bottom-left": return "bottom: 24px; left: 24px; right: auto; top: auto; transform: none;";
        case "top-right": return "top: 24px; right: 24px; bottom: auto; left: auto; transform: none;";
        case "top-left": return "top: 24px; left: 24px; bottom: auto; right: auto; transform: none;";
        case "center": return "top: 50%; left: 50%; bottom: auto; right: auto; transform: translate(-50%, -50%);";
        default: return "bottom: 24px; right: 24px; top: auto; left: auto; transform: none;";
    }
}

const ANIM_TIMEOUT = 500; // ms, longer than any animation

function animatePromptExit(card: HTMLElement, btnClass: string, btn: HTMLElement, then: () => void) {
    btn.classList.add(btnClass);
    if (document.body.classList.contains("vc-anim-off")) {
        then();
        return;
    }
    let resolved = false;
    const resolve = () => {
        if (resolved) return;
        resolved = true;
        then();
    };
    setTimeout(() => {
        card.classList.add("vc-discordMcp-prompt-exiting");
        card.addEventListener("animationend", resolve, { once: true });
        setTimeout(resolve, ANIM_TIMEOUT); // fallback
    }, 150); // flash duration
}

function renderPromptUI() {
    let container = document.getElementById("vc-discordMcp-prompts");
    if (!container) {
        container = document.createElement("div");
        container.id = "vc-discordMcp-prompts";
        container.className = "vc-discordMcp-promptContainer";
        document.body.appendChild(container);
    }

    if (pendingPrompts.length === 0) {
        container.remove();
        return;
    }

    const opacity = ((settings.store.promptOpacity as number) ?? 95) / 100;
    container.setAttribute("style", `${getPositionStyles()} opacity: ${opacity};`);

    container.replaceChildren(...pendingPrompts.map(p => {
        const card = document.createElement("div");
        card.className = "vc-discordMcp-prompt";
        card.dataset.id = p.id;

        const title = document.createElement("div");
        title.className = "vc-discordMcp-promptTitle";
        title.textContent = `MCP: ${p.tool}`;

        const params = document.createElement("div");
        params.className = "vc-discordMcp-promptParams";
        params.textContent = p.paramsSummary;

        const buttons = document.createElement("div");
        buttons.className = "vc-discordMcp-promptButtons";

        const denyBtn = document.createElement("button");
        denyBtn.className = "vc-discordMcp-promptDeny";
        denyBtn.textContent = "Deny";
        denyBtn.addEventListener("click", () => animatePromptExit(card, "vc-discordMcp-flash-deny", denyBtn, () => resolvePrompt(p.id, false)));

        const allowBtn = document.createElement("button");
        allowBtn.className = "vc-discordMcp-promptAllow";
        allowBtn.textContent = "Allow";
        allowBtn.addEventListener("click", () => animatePromptExit(card, "vc-discordMcp-flash-allow", allowBtn, () => resolvePrompt(p.id, true)));

        buttons.append(denyBtn, allowBtn);
        card.append(title, params, buttons);
        return card;
    }));
}

// ─── WebSocket client ──────────────────────────────────────────────────

const WS_URL = "ws://127.0.0.1:21420";
const RECONNECT_INTERVAL = 3000;

let ws: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let isStarted = false;

function connectWs() {
    if (!isStarted) return;

    try {
        ws = new WebSocket(WS_URL);
    } catch {
        scheduleReconnect();
        return;
    }

    ws.addEventListener("open", () => {
        setSendFn(sendWs);
        logger.info("Connected to MCP proxy");
    });

    ws.addEventListener("message", async (e) => {
        let msg: ProxyMessage;
        try {
            msg = JSON.parse(e.data as string);
        } catch {
            return;
        }
        await handleProxyMessage(msg);
    });

    ws.addEventListener("close", () => {
        ws = undefined;
        setSendFn(() => {});
        scheduleReconnect();
    });

    ws.addEventListener("error", () => {
        // error fires before close; close handler does cleanup
    });
}

function scheduleReconnect() {
    if (!isStarted) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, RECONNECT_INTERVAL);
}

function sendWs(msg: PluginMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

async function handleProxyMessage(msg: ProxyMessage) {
    switch (msg.type) {
        case "hello": {
            sendWs({
                type: "ready",
                version: PROTOCOL_VERSION,
                tools: Array.from(toolHandlers.keys()),
            });
            break;
        }
        case "tool_call": {
            const { id, tool, params } = msg as ToolCallMessage;
            await handleToolCall(id, tool, params);
            break;
        }
        case "subscribe": {
            const { id, events, filters } = msg as SubscribeMessage;
            handleSubscribe(id, events, filters);
            break;
        }
        case "unsubscribe": {
            const { subscriptionId } = msg as UnsubscribeMessage;
            handleUnsubscribe(subscriptionId);
            break;
        }
    }
}

async function handleToolCall(id: string, tool: string, params: Record<string, unknown>) {
    // Test prompt tool — always forces a prompt, bypasses normal permission check
    if (tool === TOOL_NAMES.testPrompt) {
        const timeoutSec = (settings.store.promptTimeout as number) ?? 60;
        sendWs({ type: "prompt_pending", id, tool, paramsSummary: "Test prompt — verify UI position, styling, and timeout", timeoutMs: timeoutSec === 0 ? 0 : timeoutSec * 1000 });
        const approved = await requestPrompt(id, tool, params, "Test prompt — verify UI position, styling, and timeout");
        sendWs({ type: "tool_result", id, success: true, data: { approved, message: approved ? "User approved" : "User denied" } });
        return;
    }

    // Auto-deny rebuild when user is in voice/call
    if (tool === TOOL_NAMES.rebuildPlugins && settings.store.denyRebuildInCall) {
        try {
            const VoiceStateStore = (window as any).Vencord?.Webpack?.findStore("VoiceStateStore");
            const UserStore = (window as any).Vencord?.Webpack?.findStore("UserStore");
            const me = UserStore?.getCurrentUser();
            if (me && VoiceStateStore?.getVoiceStateForUser(me.id)) {
                sendWs({ type: "tool_result", id, success: false, error: "Auto-denied: you are currently in a voice call. Disable 'Deny Rebuild in Call' in DiscordMCP settings to override." });
                return;
            }
        } catch { /* swallow — stores may not be ready */ }
    }

    const perm = getPermission(tool);

    if (perm === "deny") {
        sendWs({ type: "tool_result", id, success: false, error: `Tool "${tool}" is denied in DiscordMCP settings` });
        return;
    }

    if (perm === "prompt") {
        const timeoutSec = (settings.store.promptTimeout as number) ?? 60;
        sendWs({ type: "prompt_pending", id, tool, paramsSummary: JSON.stringify(params).slice(0, 200), timeoutMs: timeoutSec === 0 ? 0 : timeoutSec * 1000 });
        const approved = await requestPrompt(id, tool, params);
        if (!approved) {
            sendWs({ type: "tool_result", id, success: false, error: "User denied the action" });
            return;
        }
    }

    const handler = toolHandlers.get(tool);
    if (!handler) {
        sendWs({ type: "tool_result", id, success: false, error: `Unknown tool: ${tool}` });
        return;
    }

    try {
        const data = await handler(params);
        sendWs({ type: "tool_result", id, success: true, data });
    } catch (err) {
        sendWs({ type: "tool_result", id, success: false, error: String(err) });
    }
}

// ─── Event subscription (plugin-side, stateless) ───────────────────────

function handleSubscribe(id: string, events: string[], filters?: Record<string, unknown>) {
    activeSubscriptions.set(id, { id, events, filters, cleanups: [] });
    setupSubscription(id, events, filters);
}

function handleUnsubscribe(subscriptionId: string) {
    const sub = activeSubscriptions.get(subscriptionId);
    if (sub) {
        sub.cleanups.forEach(fn => fn());
        activeSubscriptions.delete(subscriptionId);
    }
}

// ─── Plugin export ─────────────────────────────────────────────────────

export default definePlugin({
    name: "DiscordMCP",
    description: "MCP bridge — expose Discord to AI agents via the Model Context Protocol",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("DiscordMCP")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        (window as any).__settingsHub?.register(createDiscordMcpSchema(settings));
        isStarted = true;
        connectWs();
        logger.info("DiscordMCP started, connecting to proxy...");
    },

    stop() {
        (window as any).__settingsHub?.unregister("DiscordMCP");
        isStarted = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws?.close(1000, "Plugin stopped");
        ws = undefined;
        for (const sub of activeSubscriptions.values()) {
            sub.cleanups.forEach(fn => fn());
        }
        activeSubscriptions.clear();
        pendingPrompts.forEach(p => p.resolve(false));
        pendingPrompts = [];
        document.getElementById("vc-discordMcp-prompts")?.remove();
        logger.info("DiscordMCP stopped");
    },
});

