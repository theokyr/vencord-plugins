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
                id: "groups",
                label: "Groups",
                groups: [
                    {
                        settings: [
                            {
                                key: "maxGroupIcons",
                                control: "slider",
                                slider: { min: 1, max: 8, step: 1 },
                            },
                            {
                                key: "groupChipStyle",
                                control: "select",
                            },
                            {
                                key: "emptyGroupBehavior",
                                control: "select",
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
