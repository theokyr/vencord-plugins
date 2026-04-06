/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";

// ─── Icon ─────────────────────────────────────────────────────────────────────

const BsNoMoreIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 14.5-4.5-4.5 1.41-1.41L10 13.67l7.59-7.59L19 7.5l-9 9Z" />
    </svg>
);

// ─── DM Navigation Preview ────────────────────────────────────────────────────

function DMNavPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    const iconOnly = settings.store.iconOnlyMode;
    const iconSize = settings.store.iconSize;
    const textSize = settings.store.textSize;
    const alignment = settings.store.barAlignment;
    const padding = settings.store.barPadding;
    const compactDMNav = settings.store.compactDMNav;

    const justifyContent =
        alignment === "center" ? "center" :
        alignment === "right" ? "flex-end" :
        "flex-start";

    const mockButtons = [
        { label: "Friends", active: true },
        { label: "Requests", active: false },
        { label: "Nitro", active: false },
    ];

    const pillStyle: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: iconOnly ? `${(iconSize + 8 - iconSize) / 2}px` : `4px 10px`,
        borderRadius: iconOnly ? "50%" : 20,
        fontSize: textSize,
        fontWeight: 500,
        cursor: "default",
        width: iconOnly ? iconSize + 8 : undefined,
        height: iconOnly ? iconSize + 8 : undefined,
        justifyContent: "center",
    };

    return (
        <div style={{
            background: "var(--background-secondary, #2b2d31)",
            borderRadius: 8,
            padding: "8px 12px",
            minWidth: 200,
        }}>
            <div style={{
                fontSize: 10,
                color: "var(--text-muted, #949ba4)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
            }}>
                DM Sidebar
            </div>
                {compactDMNav ? (
                    <div style={{
                        display: "flex",
                        gap: 6,
                        padding: `${padding}px 0`,
                        justifyContent,
                        flexWrap: "wrap",
                    }}>
                        {mockButtons.map(btn => (
                            <div
                                key={btn.label}
                                style={{
                                    ...pillStyle,
                                    background: btn.active
                                        ? "var(--brand-experiment, #5865f2)"
                                        : "var(--background-modifier-hover, rgba(79,84,92,0.16))",
                                    color: btn.active
                                        ? "#fff"
                                        : "var(--interactive-normal, #b5bac1)",
                                }}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width={iconSize} height={iconSize} style={{ flexShrink: 0 }}>
                                    <circle cx="12" cy="8" r="4" />
                                    <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
                                </svg>
                                {!iconOnly && (
                                    <span style={{ fontSize: textSize, whiteSpace: "nowrap" }}>{btn.label}</span>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
                        {mockButtons.map(btn => (
                            <div
                                key={btn.label}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "6px 8px",
                                    borderRadius: 4,
                                    background: btn.active
                                        ? "var(--background-modifier-selected, rgba(79,84,92,0.32))"
                                        : "transparent",
                                    color: btn.active
                                        ? "var(--interactive-active, #fff)"
                                        : "var(--interactive-normal, #b5bac1)",
                                    fontSize: textSize,
                                }}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                                    <circle cx="12" cy="8" r="4" />
                                    <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
                                </svg>
                                {btn.label}
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}

// ─── Clutter Removal Preview ──────────────────────────────────────────────────

function ClutterPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);

    const hideClanTags = settings.store.hideClanTags;
    const hideDecorations = settings.store.hideProfileDecorations;

    return (
        <div style={{
            background: "var(--background-secondary, #2b2d31)",
            borderRadius: 8,
            padding: "8px 12px",
            minWidth: 260,
        }}>
            <div style={{
                fontSize: 10,
                color: "var(--text-muted, #949ba4)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
            }}>
                Message Preview
            </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    {/* Avatar with optional decoration ring */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "var(--brand-experiment, #5865f2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 700,
                        }}>K</div>
                        {!hideDecorations && (
                            <div style={{
                                position: "absolute",
                                inset: -3,
                                borderRadius: "50%",
                                border: "2px solid var(--brand-experiment, #5865f2)",
                                boxShadow: "0 0 6px 2px rgba(88,101,242,0.6)",
                                pointerEvents: "none",
                            }} />
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                            <span style={{
                                color: "var(--text-normal, #dbdee1)",
                                fontWeight: 600,
                                fontSize: 13,
                            }}>User1</span>
                            {!hideClanTags && (
                                <span style={{
                                    background: "var(--background-tertiary, #1e1f22)",
                                    border: "1px solid var(--background-modifier-accent, rgba(255,255,255,0.06))",
                                    borderRadius: 3,
                                    padding: "0 4px",
                                    fontSize: 10,
                                    color: "var(--text-muted, #949ba4)",
                                    fontWeight: 500,
                                }}>⚔ ClanTag</span>
                            )}
                        </div>
                        <div style={{
                            color: "var(--text-normal, #dbdee1)",
                            fontSize: 13,
                            marginTop: 2,
                        }}>
                            Hey, what's up?
                        </div>
                    </div>
                </div>
                <div style={{
                    marginTop: 8,
                    paddingTop: 6,
                    borderTop: "1px solid var(--background-modifier-accent, rgba(255,255,255,0.06))",
                    fontSize: 10,
                    color: "var(--text-muted, #949ba4)",
                    display: "flex",
                    gap: 8,
                }}>
                    <span>Clan tag: <strong style={{ color: hideClanTags ? "var(--status-positive, #3ba55c)" : "var(--text-normal, #dbdee1)" }}>{hideClanTags ? "hidden" : "visible"}</strong></span>
                    <span>Decoration: <strong style={{ color: hideDecorations ? "var(--status-positive, #3ba55c)" : "var(--text-normal, #dbdee1)" }}>{hideDecorations ? "hidden" : "visible"}</strong></span>
                </div>
        </div>
    );
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export const bsNoMoreSchema: any = {
    plugin: "BSNoMore",
    description: "Remove upsell clutter from Discord",
    icon: BsNoMoreIcon,
    settings,
    sections: [
        {
            id: "dm-nav",
            label: "DM Navigation",
            preview: DMNavPreview,
            groups: [
                {
                    label: "Layout",
                    settings: [
                        {
                            key: "compactDMNav",
                            label: "Compact DM Nav",
                            description: "Replace vertical DM nav list with compact horizontal button bar (restart required)",
                        },
                        {
                            key: "iconOnlyMode",
                            label: "Icon Only Mode",
                            description: "Use circular icon buttons instead of labeled pills",
                        },
                        {
                            key: "barAlignment",
                            label: "Bar Alignment",
                            description: "Button bar alignment",
                        },
                    ],
                },
                {
                    label: "Sizes",
                    settings: [
                        {
                            key: "iconSize",
                            label: "Icon Size",
                            description: "Icon size in pixels",
                            control: "slider",
                            slider: { min: 12, max: 24, step: 1, unit: "px" },
                        },
                        {
                            key: "textSize",
                            label: "Text Size",
                            description: "Label text size in pixels (pill mode only)",
                            control: "slider",
                            slider: { min: 10, max: 16, step: 1, unit: "px" },
                        },
                        {
                            key: "barPadding",
                            label: "Bar Padding",
                            description: "Vertical padding above and below the button bar",
                            control: "slider",
                            slider: { min: 0, max: 16, step: 1, unit: "px" },
                        },
                    ],
                },
            ],
        },
        {
            id: "button-visibility",
            label: "Button Visibility",
            groups: [
                {
                    label: "Buttons",
                    settings: [
                        { key: "showFriends", label: "Friends" },
                        { key: "showMessageRequests", label: "Message Requests" },
                        { key: "showNitroHome", label: "Nitro Home" },
                        { key: "showShop", label: "Shop" },
                        { key: "showQuests", label: "Quests" },
                    ],
                },
            ],
        },
        {
            id: "clutter",
            label: "Clutter Removal",
            preview: ClutterPreview,
            groups: [
                {
                    label: "Hide",
                    settings: [
                        { key: "hideClanTags", label: "Clan Tags", description: "Hide clan tag badges everywhere" },
                        { key: "hideProfileDecorations", label: "Profile Decorations", description: "Hide avatar decoration effects" },
                        { key: "hideQuestPopups", label: "Quest Popups", description: "Suppress quest/orb advertisement popups (restart required)" },
                        { key: "hideStoreTabs", label: "Store Tabs", description: "Hide store UI elements and upsell banners" },
                        { key: "hideServerBanners", label: "Server Banners", description: "Hide server banner images in the channel list header" },
                    ],
                },
            ],
        },
    ],
};
