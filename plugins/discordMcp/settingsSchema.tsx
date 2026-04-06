/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import { Button } from "@webpack/common";

let settings: DefinedSettings;

// ─── Icon ──────────────────────────────────────────────────────────────

function ShieldIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

// ─── Permission preset key list ────────────────────────────────────────

const ALL_PERM_KEYS = [
    "readTools", "stateTools", "eventTools",
    "sendMessage", "react", "editMessage", "deleteMessage", "setPresence", "joinVoice", "leaveVoice",
    "rebuildPlugins",
    "evalCode", "querySelector", "getWebpackModule", "getStore", "getVencordPlugins",
] as const;

// Default values for "Reset to Defaults"
const PERM_DEFAULTS: Record<string, string> = {
    readTools: "allow",
    stateTools: "allow",
    eventTools: "allow",
    sendMessage: "prompt",
    react: "prompt",
    editMessage: "prompt",
    deleteMessage: "prompt",
    setPresence: "prompt",
    joinVoice: "prompt",
    leaveVoice: "prompt",
    rebuildPlugins: "prompt",
    evalCode: "prompt",
    querySelector: "allow",
    getWebpackModule: "allow",
    getStore: "allow",
    getVencordPlugins: "allow",
};

// ─── Read & State section — custom render with preset buttons ──────────

function ReadStateSection() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    function applyPreset(value: string) {
        for (const key of ALL_PERM_KEYS) {
            settings.store[key] = value as any;
        }
    }

    function resetDefaults() {
        for (const key of ALL_PERM_KEYS) {
            settings.store[key] = PERM_DEFAULTS[key] as any;
        }
    }

    return (
        <div className="vc-settingsLib-group">
            <div className="vc-settingsLib-preset-row" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <Button color={Button.Colors.RED} size={Button.Sizes.SMALL} onClick={() => applyPreset("prompt")}>
                    Paranoid
                </Button>
                <Button color={Button.Colors.GREEN} size={Button.Sizes.SMALL} onClick={() => applyPreset("allow")}>
                    Trusting
                </Button>
                <Button look={Button.Looks.OUTLINED} size={Button.Sizes.SMALL} onClick={resetDefaults}>
                    Reset to Defaults
                </Button>
            </div>
            {(() => { const TriStateToggle = (window as any).__settingsHub?.TriStateToggle; return TriStateToggle ? (<>
                <TriStateToggle settingKey="readTools" settings={settings} label="Read Tools" description="Read-only tools (list guilds, read messages, channels, threads, etc.)" />
                <TriStateToggle settingKey="stateTools" settings={settings} label="State Tools" description="State tools (presence, unread counts, selected channel, online members)" />
                <TriStateToggle settingKey="eventTools" settings={settings} label="Event Subscription Tools" description="Subscribe/unsubscribe from Discord Flux events" />
            </>) : null; })()}
        </div>
    );
}

// ─── Prompt UI Preview ─────────────────────────────────────────────────

function PromptPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    const pos = (settings.store.promptPosition as string) || "bottom-right";
    const opacity = ((settings.store.promptOpacity as number) ?? 95) / 100;

    const positionStyle: React.CSSProperties = (() => {
        switch (pos) {
            case "bottom-left": return { bottom: 16, left: 16 };
            case "top-right":   return { top: 16, right: 16 };
            case "top-left":    return { top: 16, left: 16 };
            case "center":      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
            default:            return { bottom: 16, right: 16 };
        }
    })();

    return (
        <div style={{ position: "relative", height: 160, background: "var(--background-secondary, #2b2d31)", borderRadius: 8, overflow: "hidden" }}>
                <div
                    style={{
                        position: "absolute",
                        ...positionStyle,
                        opacity,
                        background: "var(--background-floating, #18191c)",
                        border: "1px solid var(--background-modifier-accent, #3f4147)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        minWidth: 200,
                        maxWidth: 260,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                        fontSize: 13,
                        color: "var(--text-normal, #dbdee1)",
                        pointerEvents: "none",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--header-primary, #f2f3f5)" }}>
                        MCP: discord_send_message
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted, #949ba4)", marginBottom: 8 }}>
                        channel_id: "1234…", content: "Hello!"
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ flex: 1, textAlign: "center", padding: "4px 8px", borderRadius: 4, background: "var(--button-danger-background, #da373c)", color: "#fff", fontSize: 12 }}>
                            Deny
                        </div>
                        <div style={{ flex: 1, textAlign: "center", padding: "4px 8px", borderRadius: 4, background: "var(--button-positive-background, #248046)", color: "#fff", fontSize: 12 }}>
                            Allow
                        </div>
                    </div>
                </div>
        </div>
    );
}

// ─── Schema ────────────────────────────────────────────────────────────

export function createDiscordMcpSchema(s: DefinedSettings): any {
    settings = s;
    return {
    plugin: "DiscordMCP",
    description: "MCP bridge — expose Discord to AI agents",
    icon: ShieldIcon,
    settings,
    sections: [
        {
            id: "permissions-read-state",
            label: "Permissions — Read & State",
            render: ReadStateSection,
        },
        {
            id: "permissions-actions",
            label: "Permissions — Actions",
            groups: [
                {
                    settings: [
                        { key: "sendMessage",   control: "tristate", label: "Send Messages",     description: "Send messages to channels" },
                        { key: "react",         control: "tristate", label: "Add Reactions",     description: "React to messages with emoji" },
                        { key: "editMessage",   control: "tristate", label: "Edit Messages",     description: "Edit your own messages" },
                        { key: "deleteMessage", control: "tristate", label: "Delete Messages",   description: "Delete your own messages" },
                        { key: "setPresence",   control: "tristate", label: "Set Presence",      description: "Change your status and activity" },
                        { key: "joinVoice",     control: "tristate", label: "Join Voice",        description: "Join voice channels" },
                        { key: "leaveVoice",    control: "tristate", label: "Leave Voice",       description: "Leave voice channels" },
                    ],
                },
                {
                    label: "Build",
                    settings: [
                        { key: "rebuildPlugins", control: "tristate", label: "Rebuild Plugins",   description: "Build and deploy Vencord userplugins (requires Discord restart)" },
                        { key: "denyRebuildInCall", control: "toggle", label: "Deny Rebuild in Call", description: "Auto-deny rebuild when you are in a voice call or DM call" },
                    ],
                },
            ],
        },
        {
            id: "permissions-devtools",
            label: "Permissions — DevTools",
            groups: [
                {
                    settings: [
                        { key: "evalCode",           control: "tristate", label: "Eval Code",             description: "Execute arbitrary JavaScript (discord_eval)" },
                        { key: "querySelector",      control: "tristate", label: "Query Selector",        description: "Query DOM elements by CSS selector" },
                        { key: "getWebpackModule",   control: "tristate", label: "Get Webpack Module",    description: "Read webpack module source code" },
                        { key: "getStore",           control: "tristate", label: "Get Flux Store",        description: "Query Flux store state" },
                        { key: "getVencordPlugins",  control: "tristate", label: "Get Vencord Plugins",   description: "List all installed Vencord plugins" },
                    ],
                },
            ],
        },
        {
            id: "prompt-ui",
            label: "Prompt UI",
            preview: PromptPreview,
            groups: [
                {
                    settings: [
                        {
                            key: "promptPosition",
                            control: "select",
                            label: "Prompt Position",
                            description: "Where the permission prompt appears on screen",
                        },
                        {
                            key: "promptOpacity",
                            control: "slider",
                            label: "Prompt Opacity",
                            description: "Opacity of the permission prompt overlay",
                            slider: { min: 50, max: 100, step: 5, unit: "%", markers: [50, 60, 70, 80, 90, 100] },
                        },
                        {
                            key: "promptTimeout",
                            control: "select",
                            label: "Prompt Timeout",
                            description: "How long to wait before auto-denying (0 = wait forever)",
                        },
                        {
                            key: "promptAnimation",
                            label: "Prompt Animation",
                            description: "How the permission prompt appears",
                            tags: ["animation", "prompt", "fade", "slide"],
                        },
                    ],
                },
            ],
        },
    ],
    };
}
