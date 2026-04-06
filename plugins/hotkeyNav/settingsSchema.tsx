/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";

// Initialized by createHotkeyNavSchema() before any component renders
let settings: DefinedSettings;

// ─── Icon ──────────────────────────────────────────────────────────────────

function HotkeyNavIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
    );
}

// ─── Keybind section ──────────────────────────────────────────────────────

const KEYBIND_ENTRIES: any[] = [
    {
        id: "notificationJump",
        actionName: "Notification Jump",
        actionDesc: "Jump to unread notifications by position (1-9)",
        keybindKey: "notificationModifier",
        enableKey: "enableNotificationLayer",
        suffix: "1-9",
    },
    {
        id: "dmPositional",
        actionName: "DM Positional",
        actionDesc: "Jump to DM by position in the DM list (1-9)",
        keybindKey: "dmPositionalModifier",
        enableKey: "enableDmPositionalLayer",
        suffix: "1-9",
    },
    {
        id: "serverPositional",
        actionName: "Server Positional",
        actionDesc: "Jump to server by position in the server list (1-9)",
        keybindKey: "serverPositionalModifier",
        enableKey: "enableServerPositionalLayer",
        suffix: "1-9",
    },
    {
        id: "channelNavigation",
        actionName: "Channel Navigation",
        actionDesc: "Navigate to category (1-9), then channel within it",
        keybindKey: "channelModifier",
        enableKey: "enableChannelLayer",
        suffix: "1-9",
    },
];

function KeybindSectionRender() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    return (
        <div>
            {/* Keycap hint preview — mock guild icons */}
            <div className="vc-settingsLib-preview" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: "12px 16px" }}>
                {[1, 2, 3, 4, 5].map(n => (
                    <div key={n} style={{ position: "relative", display: "inline-flex" }}>
                        {/* Mock guild icon */}
                        <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            background: "var(--background-secondary, #2b2d31)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            fontWeight: 700,
                            color: "var(--text-muted, #949ba4)",
                        }}>
                            {n}
                        </div>
                        {/* Keycap badge */}
                        <div
                            className={`vc-hotkeyNav-keycap vc-hotkeyNav-keycap-${settings.store.keycapSide}`}
                            style={{ pointerEvents: "none" }}
                        >
                            <span className="vc-hotkeyNav-keycap-dim">
                                {settings.store.serverPositionalModifier?.split("+").map((s: string) => s.trim()[0]?.toUpperCase()).join("+") ?? "A+S"}
                            </span>
                            <span>+{n}</span>
                        </div>
                    </div>
                ))}
            </div>

            {(() => { const KeybindTable = (window as any).__settingsHub?.KeybindTable; return KeybindTable ? <KeybindTable entries={KEYBIND_ENTRIES} settings={settings} /> : null; })()}
        </div>
    );
}

// ─── Visual section preview ──────────────────────────────────────────────

function VisualPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    const side = settings.store.keycapSide ?? "left";
    const mod = settings.store.serverPositionalModifier ?? "alt+shift";
    const abbrev = mod.split("+").map((s: string) => s.trim()[0]?.toUpperCase()).join("+");

    return (
        <div className="vc-settingsLib-preview" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted, #949ba4)", marginRight: 4 }}>
                Badge position ({side}):
            </span>
            {[1, 2, 3].map(n => (
                <div key={n} style={{ position: "relative", display: "inline-flex" }}>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "var(--background-secondary, #2b2d31)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text-muted, #949ba4)",
                    }}>
                        {n}
                    </div>
                    <div
                        className={`vc-hotkeyNav-keycap vc-hotkeyNav-keycap-${side}`}
                        style={{ pointerEvents: "none", fontSize: 10 }}
                    >
                        <span className="vc-hotkeyNav-keycap-dim">{abbrev}</span>
                        <span>+{n}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Schema ──────────────────────────────────────────────────────────────

export function createHotkeyNavSchema(s: DefinedSettings): any {
    settings = s;
    return {
    plugin: "HotkeyNav",
    description: "Keyboard-driven navigation with inline keycap hints",
    icon: HotkeyNavIcon,
    settings,
    sections: [
        {
            id: "keybinds",
            label: "Keybinds",
            render: KeybindSectionRender,
        },
        {
            id: "notificationTracking",
            label: "Notification Tracking",
            groups: [
                {
                    settings: [
                        { key: "trackDms", label: "Track DMs", description: "Include unread DMs in notification layer" },
                        { key: "trackMentions", label: "Track Mentions", description: "Include @mention channels in notification layer" },
                        { key: "trackRolePings", label: "Track Role Pings", description: "Include @role ping channels in notification layer" },
                        { key: "trackEveryone", label: "Track @everyone", description: "Include @everyone/@here channels in notification layer" },
                    ],
                },
                {
                    label: "Priority",
                    settings: [
                        {
                            key: "priorityOrder",
                            control: "text",
                            label: "Priority Order",
                            description: "Notification type priority, comma-separated (e.g. dm,mention,role,everyone)",
                        },
                    ],
                },
            ],
        },
        {
            id: "channelNavigation",
            label: "Channel Navigation",
            groups: [
                {
                    settings: [
                        {
                            key: "channelNavMode",
                            label: "Navigation Mode",
                            description: "How channel navigation works after pressing the modifier",
                        },
                        {
                            key: "channelTimeout",
                            control: "slider",
                            label: "Timeout",
                            description: "How long to wait for the second keypress (category state / chord window)",
                            slider: { min: 500, max: 10000, step: 500, unit: "ms" },
                        },
                        {
                            key: "includeCollapsedCategories",
                            label: "Include Collapsed Categories",
                            description: "Count collapsed categories when numbering channel positions",
                        },
                        {
                            key: "treatFavoritesAsCategory",
                            label: "Favorites as Category",
                            description: "Treat pinned/favorite channels as their own category (slot 1)",
                        },
                    ],
                },
            ],
        },
        {
            id: "visual",
            label: "Visual",
            preview: VisualPreview,
            groups: [
                {
                    settings: [
                        {
                            key: "alwaysShowHints",
                            label: "Always Show Hints",
                            description: "Show keycap badges at all times, not just when a modifier is held",
                        },
                        {
                            key: "showHintsOnModHold",
                            label: "Show on Modifier Hold",
                            description: "Reveal relevant hints when holding a modifier key (when always-show is off)",
                        },
                        {
                            key: "keycapSide",
                            label: "Badge Side",
                            description: "Which side of the avatar or icon to place keycap badges",
                        },
                        { key: "keycapStyle", label: "Badge Style", description: "Visual style of keycap hint badges", tags: ["keycap", "style", "badge", "outlined", "filled"] },
                        { key: "keycapSize", label: "Badge Size", description: "Size of keycap hints in pixels", control: "slider", slider: { min: 14, max: 24, unit: "px" }, tags: ["keycap", "size", "badge"] },
                        { key: "hintOpacity", label: "Hint Opacity", description: "Opacity of keycap hint overlays", control: "slider", slider: { min: 0.1, max: 1.0, step: 0.05 }, tags: ["opacity", "hint", "transparency"] },
                    ],
                },
            ],
        },
    ],
    };
}
