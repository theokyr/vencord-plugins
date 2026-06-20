/*
 * Vencord userplugin - EnrichedHeader
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

function EnrichedHeaderIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 3v3h16V7H4Zm0 5v6h4v-6H4Zm6 0v6h10v-6H10Z" />
        </svg>
    );
}

function makeHeaderPreview(settings: DefinedSettings) {
    return function HeaderPreview() {
        (window as any).__settingsHub?.useSettingsReactive(settings);
        const s = settings.store;

        const enabled = Boolean(s.headerEnabled);
        const showNav = enabled && s.navButtonsStyle !== "hidden";
        const compactNav = s.navButtonsStyle === "compact";
        const togglesLeft = s.sidebarTogglePosition === "left";
        const showBreadcrumb = enabled && s.guildNameStyle === "breadcrumb";
        const previewBase = "var(--background-surface-highest, var(--background-tertiary, #1e1f22))";
        const previewSurface = "var(--background-surface-high, var(--background-secondary, #2b2d31))";
        const previewText = "var(--text-default, var(--text-normal, #dbdee1))";
        const previewSubtle = "var(--text-subtle, var(--text-muted, #949ba4))";
        const previewInteractive = "var(--interactive-text-default, var(--interactive-normal, var(--text-subtle, #80848e)))";

        const buttonSize = compactNav ? 22 : 28;
        const iconButton: React.CSSProperties = {
            width: buttonSize,
            height: buttonSize,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            background: previewBase,
            color: previewInteractive,
            flexShrink: 0,
        };

        const toggleButton: React.CSSProperties = {
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            background: previewBase,
            color: previewInteractive,
            flexShrink: 0,
        };

        const toggles = enabled ? (
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                <span style={toggleButton}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4 4h5v16H4V4Zm7 0h9v16h-9V4Z" /></svg>
                </span>
                <span style={toggleButton}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4 4h4v16H4V4Zm6 0h4v16h-4V4Zm6 0h4v16h-4V4Z" /></svg>
                </span>
                <span style={toggleButton}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 7h18v2H3V7Zm0 4h12v2H3v-2Zm0 4h7v2H3v-2Z" /></svg>
                </span>
            </div>
        ) : null;

        return (
            <div style={{ padding: "12px 16px", background: previewBase, borderRadius: "6px" }}>
                <div style={{
                    minHeight: 42,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: previewSurface,
                    color: previewText,
                    overflow: "hidden",
                }}>
                    {showNav && (
                        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <span style={iconButton}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59Z" /></svg>
                            </span>
                            <span style={iconButton}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="m10 6-1.41 1.41L13.17 12l-4.58 4.59L10 18l6-6-6-6Z" /></svg>
                            </span>
                        </div>
                    )}
                    {togglesLeft && toggles}
                    {showBreadcrumb && <span style={{ color: previewSubtle, whiteSpace: "nowrap" }}>Server ›</span>}
                    <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                        {enabled ? "# general" : "Standard Discord header"}
                    </strong>
                    {!togglesLeft && toggles}
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto", color: previewSubtle, flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 13.73 14l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z" /></svg>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" /></svg>
                    </div>
                </div>
            </div>
        );
    };
}

export function createEnrichedHeaderSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "EnrichedHeader",
        description: "Moves Discord channel header controls into the title bar",
        icon: EnrichedHeaderIcon,
        settings,
        sections: [
            {
                id: "display",
                label: "Display",
                preview: makeHeaderPreview(settings),
                groups: [{ settings: [{ key: "headerEnabled", control: "toggle" }] }],
            },
            {
                id: "header-layout",
                label: "Header Layout",
                groups: [
                    {
                        settings: [
                            { key: "sidebarTogglePosition", control: "select" },
                            { key: "guildNameStyle", control: "select" },
                            { key: "navButtonsStyle", control: "select" },
                        ],
                    },
                ],
            },
            {
                id: "sidebar",
                label: "Sidebar",
                groups: [
                    {
                        settings: [
                            { key: "hideGuildSidebar", control: "toggle" },
                            { key: "hideChannelList", control: "toggle" },
                        ],
                    },
                ],
            },
        ],
    };
}
