/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

// ─── Icon ────────────────────────────────────────────────────────────────────

function ChannelTabsIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 3h18a1 1 0 0 1 1 1v3H2V4a1 1 0 0 1 1-1zm-1 5h20v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8zm3 3v2h4v-2H5zm0 4v2h6v-2H5z" />
        </svg>
    );
}

// ─── Appearance Preview ───────────────────────────────────────────────────────

const MOCK_TABS = [
    { label: "# general", active: true },
    { label: "# off-topic", active: false },
    { label: "User2", active: false, isDm: true },
];

function makeAppearancePreview(settings: DefinedSettings) {
    return function AppearancePreview() {
        (window as any).__settingsHub?.useSettingsReactive(settings);
        const s = settings.store;

        const isBottom = s.tabBarPosition === "bottom";

        const tabBarStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "flex-end",
            gap: s.tabGap + "px",
            background: "var(--background-secondary, #2b2d31)",
            padding: isBottom ? "0 8px 4px" : "4px 8px 0",
            borderRadius: isBottom ? "0 0 6px 6px" : "6px 6px 0 0",
            marginBottom: isBottom ? 0 : s.bottomMargin + "px",
            marginTop: isBottom ? s.bottomMargin + "px" : 0,
            height: (s.tabHeight + 10) + "px",
            overflow: "hidden",
        };

        const baseTabStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            height: s.tabHeight + "px",
            padding: `0 ${s.tabPadding}px`,
            borderRadius: isBottom
                ? `0 0 ${s.tabRadius}px ${s.tabRadius}px`
                : `${s.tabRadius}px ${s.tabRadius}px 0 0`,
            fontSize: s.fontSize + "px",
            whiteSpace: "nowrap",
            cursor: "pointer",
            userSelect: "none",
        };

        const activeTabStyle: React.CSSProperties = {
            ...baseTabStyle,
            background: "var(--background-primary, #313338)",
            color: "var(--text-normal, #dbdee1)",
        };

        const inactiveTabStyle: React.CSSProperties = {
            ...baseTabStyle,
            background: "var(--background-tertiary, #1e1f22)",
            color: "var(--text-muted, #80848e)",
        };

        const tabBarEl = (
            <div style={tabBarStyle}>
                {MOCK_TABS.map((tab, i) => {
                    const style = tab.active ? activeTabStyle : inactiveTabStyle;
                    return (
                        <div key={i} style={style}>
                            {s.showServerIcon && !tab.isDm && (
                                <span style={{
                                    width: s.iconSize + "px",
                                    height: s.iconSize + "px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}>
                                    <svg viewBox="0 0 24 24" width={s.iconSize} height={s.iconSize} fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                                    </svg>
                                </span>
                            )}
                            <span>{tab.label}</span>
                        </div>
                    );
                })}
            </div>
        );

        const contentEl = (
            <div style={{
                height: "48px",
                background: "var(--background-primary, #313338)",
                borderRadius: isBottom ? "6px 6px 0 0" : "0 0 6px 6px",
                display: "flex",
                alignItems: "center",
                paddingLeft: "12px",
                color: "var(--text-muted, #80848e)",
                fontSize: "12px",
            }}>
                # general
            </div>
        );

        return (
            <div style={{ padding: "12px 16px", background: "var(--background-tertiary, #1e1f22)", borderRadius: "6px" }}>
                {isBottom ? <>{contentEl}{tabBarEl}</> : <>{tabBarEl}{contentEl}</>}
            </div>
        );
    };
}

// ─── Enriched Header Preview ──────────────────────────────────────────────────

function makeEnrichedHeaderPreview(settings: DefinedSettings) {
    return function EnrichedHeaderPreview() {
        (window as any).__settingsHub?.useSettingsReactive(settings);
        const s = settings.store;

        const showBreadcrumb = s.guildNameStyle === "breadcrumb";
        const showNav = s.navButtonsStyle !== "hidden";
        const navCompact = s.navButtonsStyle === "compact";
        const togglesLeft = s.sidebarTogglePosition === "left";

        const headerStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "var(--background-secondary, #2b2d31)",
            borderRadius: "6px",
            padding: "6px 10px",
            minHeight: "44px",
            fontSize: "13px",
            color: "var(--text-normal, #dbdee1)",
        };

        const navBtnStyle: React.CSSProperties = {
            width: navCompact ? "22px" : "28px",
            height: navCompact ? "22px" : "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            background: "var(--background-tertiary, #1e1f22)",
            color: "var(--text-muted, #80848e)",
            cursor: "pointer",
            flexShrink: 0,
        };

        const toggleBtnStyle: React.CSSProperties = {
            width: "22px",
            height: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            background: "var(--background-tertiary, #1e1f22)",
            color: "var(--text-muted, #80848e)",
            cursor: "pointer",
            flexShrink: 0,
        };

        const toggleButtons = s.enrichedHeader ? (
            <div style={{ display: "flex", gap: "2px" }}>
                <span style={toggleBtnStyle} title="Show guilds only">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm12 0H10V4h10v16z" />
                    </svg>
                </span>
                <span style={toggleBtnStyle} title="Show all sidebars">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4V4h4v16zm6 0h-4V4h4v16zm6 0h-4V4h4v16z" />
                    </svg>
                </span>
                <span style={toggleBtnStyle} title="Show channels only">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
                    </svg>
                </span>
            </div>
        ) : null;

        const trailingIcons = (
            <div style={{ display: "flex", gap: "6px", marginLeft: "auto", color: "var(--text-muted, #80848e)" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
            </div>
        );

        if (!s.enrichedHeader) {
            return (
                <div style={{ padding: "12px 16px", background: "var(--background-tertiary, #1e1f22)", borderRadius: "6px" }}>
                    <div style={headerStyle}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M5.88 4.12L13.76 12l-7.88 7.88L8 22l10-10L8 2z" />
                        </svg>
                        <span style={{ fontWeight: 600 }}># general</span>
                        {trailingIcons}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted, #80848e)", marginTop: "6px", paddingLeft: "4px" }}>
                        Enriched header is disabled — standard Discord title bar
                    </div>
                </div>
            );
        }

        return (
            <div style={{ padding: "12px 16px", background: "var(--background-tertiary, #1e1f22)", borderRadius: "6px" }}>
                    <div style={headerStyle}>
                        {showNav && (
                            <div style={{ display: "flex", gap: "3px" }}>
                                <span style={navBtnStyle}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                                    </svg>
                                </span>
                                <span style={navBtnStyle}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                    </svg>
                                </span>
                            </div>
                        )}
                        {togglesLeft && toggleButtons}
                        {showBreadcrumb ? (
                            <span style={{ fontWeight: 500 }}>
                                <span style={{ color: "var(--text-muted, #80848e)" }}>My Server</span>
                                <span style={{ margin: "0 4px", color: "var(--text-muted, #80848e)" }}>›</span>
                                <span style={{ fontWeight: 600 }}># general</span>
                            </span>
                        ) : (
                            <span style={{ fontWeight: 600 }}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: "3px", verticalAlign: "middle" }}>
                                    <path d="M5.88 4.12L13.76 12l-7.88 7.88L8 22l10-10L8 2z" />
                                </svg>
                                # general
                            </span>
                        )}
                        {!togglesLeft && toggleButtons}
                        {trailingIcons}
                    </div>
            </div>
        );
    };
}

// ─── Sidebar Preview ──────────────────────────────────────────────────────────

function makeSidebarPreview(settings: DefinedSettings) {
    return function SidebarPreview() {
        (window as any).__settingsHub?.useSettingsReactive(settings);
        const s = settings.store;

        const containerStyle: React.CSSProperties = {
            display: "flex",
            height: "90px",
            borderRadius: "6px",
            overflow: "hidden",
            background: "var(--background-primary, #313338)",
            gap: "2px",
        };

        const guildSidebarStyle: React.CSSProperties = {
            width: s.hideGuildSidebar ? "0" : "28px",
            minWidth: s.hideGuildSidebar ? "0" : "28px",
            background: "var(--background-tertiary, #1e1f22)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: s.hideGuildSidebar ? "0" : "6px 0",
            gap: "5px",
            overflow: "hidden",
            transition: "width 0.15s, min-width 0.15s",
        };

        const channelListStyle: React.CSSProperties = {
            width: s.hideChannelList ? "0" : "60px",
            minWidth: s.hideChannelList ? "0" : "60px",
            background: "var(--background-secondary, #2b2d31)",
            padding: s.hideChannelList ? "0" : "6px",
            overflow: "hidden",
            transition: "width 0.15s, min-width 0.15s",
        };

        const chatStyle: React.CSSProperties = {
            flex: 1,
            background: "var(--background-primary, #313338)",
            padding: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
        };

        const iconDotStyle: React.CSSProperties = {
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "var(--background-primary, #313338)",
        };

        const channelRowStyle: React.CSSProperties = {
            height: "8px",
            borderRadius: "3px",
            background: "var(--background-tertiary, #1e1f22)",
            marginBottom: "3px",
        };

        const chatLineStyle: React.CSSProperties = {
            height: "7px",
            borderRadius: "3px",
            background: "var(--background-secondary, #2b2d31)",
        };

        return (
            <div style={{ padding: "12px 16px", background: "var(--background-tertiary, #1e1f22)", borderRadius: "6px" }}>
                    <div style={containerStyle}>
                        {/* Guild sidebar */}
                        <div style={guildSidebarStyle}>
                            {!s.hideGuildSidebar && (
                                <>
                                    <div style={iconDotStyle} />
                                    <div style={iconDotStyle} />
                                    <div style={iconDotStyle} />
                                </>
                            )}
                        </div>
                        {/* Channel list */}
                        <div style={channelListStyle}>
                            {!s.hideChannelList && (
                                <>
                                    <div style={channelRowStyle} />
                                    <div style={{ ...channelRowStyle, width: "80%" }} />
                                    <div style={channelRowStyle} />
                                    <div style={{ ...channelRowStyle, width: "60%" }} />
                                </>
                            )}
                        </div>
                        {/* Chat area */}
                        <div style={chatStyle}>
                            {s.showSidebarToggles && (
                                <div style={{ display: "flex", gap: "3px", marginBottom: "2px" }}>
                                    <div style={{ width: "14px", height: "14px", borderRadius: "2px", background: "var(--background-secondary, #2b2d31)" }} />
                                    <div style={{ width: "14px", height: "14px", borderRadius: "2px", background: "var(--background-secondary, #2b2d31)" }} />
                                </div>
                            )}
                            <div style={chatLineStyle} />
                            <div style={{ ...chatLineStyle, width: "70%" }} />
                            <div style={{ ...chatLineStyle, width: "85%" }} />
                            <div style={{ ...chatLineStyle, width: "55%" }} />
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "11px", color: "var(--text-muted, #80848e)", paddingLeft: "4px" }}>
                        <span>Guild sidebar: {s.hideGuildSidebar ? "hidden" : "visible"}</span>
                        <span>Channel list: {s.hideChannelList ? "hidden" : "visible"}</span>
                    </div>
            </div>
        );
    };
}

// ─── Schema factory ───────────────────────────────────────────────────────────

export function createChannelTabsSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "ChannelTabs",
        description: "IDE-style tabbed channel navigation",
        icon: ChannelTabsIcon,
        settings,
        sections: [
            {
                id: "appearance",
                label: "Appearance",
                preview: makeAppearancePreview(settings),
                groups: [
                    {
                        label: "Layout",
                        settings: [
                            {
                                key: "tabBarPosition",
                                control: "select",
                            },
                        ],
                    },
                    {
                        label: "Tab Dimensions",
                        settings: [
                            {
                                key: "fontSize",
                                control: "slider",
                                slider: { min: 8, max: 20, step: 1, unit: "px" },
                            },
                            {
                                key: "tabHeight",
                                control: "slider",
                                slider: { min: 18, max: 40, step: 1, unit: "px" },
                            },
                            {
                                key: "iconSize",
                                control: "slider",
                                slider: { min: 10, max: 24, step: 1, unit: "px" },
                            },
                            {
                                key: "showServerIcon",
                                control: "toggle",
                            },
                        ],
                    },
                    {
                        label: "Spacing",
                        settings: [
                            {
                                key: "tabGap",
                                control: "slider",
                                slider: { min: 0, max: 8, step: 1, unit: "px" },
                            },
                            {
                                key: "tabPadding",
                                control: "slider",
                                slider: { min: 2, max: 16, step: 1, unit: "px" },
                            },
                            {
                                key: "tabRadius",
                                control: "slider",
                                slider: { min: 0, max: 12, step: 1, unit: "px" },
                            },
                            {
                                key: "bottomMargin",
                                control: "slider",
                                slider: { min: 0, max: 12, step: 1, unit: "px" },
                            },
                        ],
                    },
                    {
                        label: "Animation",
                        settings: [
                            {
                                key: "animationSpeed",
                                control: "slider",
                                slider: { min: 0, max: 500, step: 25, unit: "ms" },
                            },
                        ],
                    },
                    {
                        label: "Tab Style",
                        settings: [
                            { key: "tabMaxWidth", label: "Max Tab Width", description: "Maximum width per tab (0 = no limit)", slider: { min: 0, max: 300, step: 10, unit: "px" }, tags: ["width", "max", "limit"] },
                            { key: "closeButtonVisibility", label: "Close Button", description: "When to show close button on tabs", tags: ["close", "button", "visibility"] },
                            { key: "activeTabStyle", label: "Active Tab Style", description: "Visual style for the selected tab", tags: ["active", "style", "selected"] },
                            { key: "doubleClickAction", label: "Double-Click Action", description: "What happens on double-click", tags: ["double", "click", "action", "pin"] },
                            { key: "pinIconOpacity", label: "Pin Icon Opacity", description: "Resting opacity of the pin icon", control: "slider", slider: { min: 0, max: 1, step: 0.1 }, tags: ["pin", "icon", "opacity"] },
                            { key: "closeIconOpacity", label: "Close Icon Opacity", description: "Resting opacity of the close button", control: "slider", slider: { min: 0, max: 1, step: 0.1 }, tags: ["close", "icon", "opacity"] },
                        ],
                    },
                ],
            },
            {
                id: "enriched-header",
                label: "Enriched Header",
                preview: makeEnrichedHeaderPreview(settings),
                groups: [
                    {
                        settings: [
                            {
                                key: "enrichedHeader",
                                control: "toggle",
                            },
                            {
                                key: "sidebarTogglePosition",
                                control: "select",
                            },
                            {
                                key: "guildNameStyle",
                                control: "select",
                            },
                            {
                                key: "navButtonsStyle",
                                control: "select",
                            },
                        ],
                    },
                ],
            },
            {
                id: "behavior",
                label: "Behavior",
                groups: [
                    {
                        settings: [
                            {
                                key: "autoOpenDMs",
                                control: "toggle",
                            },
                            {
                                key: "autoOpenMentions",
                                control: "toggle",
                            },
                            {
                                key: "restoreTabs",
                                control: "toggle",
                            },
                            { key: "tabOverflowMode", label: "Tab Overflow", description: "How to handle too many tabs", tags: ["overflow", "scroll", "compress"] },
                        ],
                    },
                ],
            },
            {
                id: "sidebar",
                label: "Sidebar",
                preview: makeSidebarPreview(settings),
                groups: [
                    {
                        settings: [
                            {
                                key: "hideGuildSidebar",
                                control: "toggle",
                            },
                            {
                                key: "hideChannelList",
                                control: "toggle",
                            },
                            {
                                key: "showSidebarToggles",
                                control: "toggle",
                            },
                        ],
                    },
                ],
            },
            {
                id: "context-menu",
                label: "Context Menu",
                groups: [
                    {
                        label: "Tab Action Placement",
                        settings: [
                            {
                                key: "contextMenuMode",
                                control: "select",
                            },
                        ],
                    },
                    {
                        label: "Tabs Submenu",
                        description: "The 'Tabs >' submenu appears when any action is set to Hidden (Hybrid mode)",
                        settings: [
                            {
                                key: "tabsSubmenuPosition",
                                control: "select",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
