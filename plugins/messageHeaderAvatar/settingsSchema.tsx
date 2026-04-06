/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";

// Initialized by createAvatarSchema() before any component renders
let settings: DefinedSettings;

// ─── Icon ─────────────────────────────────────────────────────────────────────

function AvatarIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
    );
}

// ─── Preview: Avatar section ──────────────────────────────────────────────────

function AvatarPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);
    const size = settings.store.size;

    const containerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "8px",
        background: "var(--background-secondary, #2f3136)",
        borderRadius: "6px",
    };

    const avatarStyle: React.CSSProperties = {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: "var(--brand-500, #5865f2)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: "16px",
        fontWeight: 700,
    };

    const contentStyle: React.CSSProperties = {
        flex: 1,
        minWidth: 0,
    };

    const headerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "baseline",
        gap: "4px",
        marginBottom: "4px",
    };

    const inlineAvatarStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "var(--brand-500, #5865f2)",
        display: "inline-block",
        verticalAlign: "-0.2em",
        marginRight: "4px",
        flexShrink: 0,
    };

    const usernameStyle: React.CSSProperties = {
        color: "var(--header-primary, #fff)",
        fontWeight: 600,
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
    };

    const timestampStyle: React.CSSProperties = {
        color: "var(--text-muted, #72767d)",
        fontSize: "11px",
    };

    const textStyle: React.CSSProperties = {
        color: "var(--text-normal, #dcddde)",
        fontSize: "14px",
        lineHeight: "1.375",
    };

    return (
        <div>
            <div style={containerStyle}>
                <div style={avatarStyle}>K</div>
                <div style={contentStyle}>
                    <div style={headerStyle}>
                        <span style={usernameStyle}>
                            <span style={inlineAvatarStyle} />
                            User1
                        </span>
                        <span style={timestampStyle}>Today at 12:00 PM</span>
                    </div>
                    <div style={textStyle}>Hey, this is a message with an inline avatar!</div>
                </div>
            </div>
            <div style={{ marginTop: "6px", color: "var(--text-muted, #72767d)", fontSize: "12px", textAlign: "center" }}>
                Inline avatar size: {size}px
            </div>
        </div>
    );
}

// ─── Preview: Consecutive Messages section ────────────────────────────────────

function ConsecutivePreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);
    const {
        hideConsecutive,
        hideConsecutiveNames,
        consecutiveLine,
        lineOffset,
        lineWidth,
        lineOpacity,
        lineColor,
        size,
    } = settings.store;

    const outerStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        background: "var(--background-secondary, #2f3136)",
        borderRadius: "6px",
        overflow: "hidden",
    };

    const messageStyle = (isGroupStart: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: isGroupStart ? "8px 8px 4px" : "2px 8px",
        position: "relative",
    });

    const avatarColStyle: React.CSSProperties = {
        width: "40px",
        flexShrink: 0,
    };

    const bigAvatarStyle: React.CSSProperties = {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: "var(--brand-500, #5865f2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: "16px",
        fontWeight: 700,
    };

    const inlineAvatarStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "var(--brand-500, #5865f2)",
        display: "inline-block",
        verticalAlign: "-0.2em",
        marginRight: "4px",
    };

    const usernameStyle: React.CSSProperties = {
        color: "var(--header-primary, #fff)",
        fontWeight: 600,
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        marginBottom: "2px",
    };

    const textStyle: React.CSSProperties = {
        color: "var(--text-normal, #dcddde)",
        fontSize: "14px",
        lineHeight: "1.375",
    };

    const timestampStyle: React.CSSProperties = {
        color: "var(--text-muted, #72767d)",
        fontSize: "11px",
        marginLeft: "4px",
    };

    // Vertical line for continuation messages
    const lineStyle: React.CSSProperties = consecutiveLine ? {
        position: "absolute",
        left: `${lineOffset}px`,
        top: 0,
        bottom: 0,
        width: `${lineWidth}px`,
        background: lineColor,
        opacity: lineOpacity,
        borderRadius: "1px",
    } : {};

    const contTextColStyle: React.CSSProperties = {
        flex: 1,
        paddingLeft: "0",
    };

    return (
        <div style={outerStyle}>
            {/* Group start message */}
            <div style={messageStyle(true)}>
                <div style={avatarColStyle}>
                    <div style={bigAvatarStyle}>U</div>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={usernameStyle}>
                        <span style={inlineAvatarStyle} />
                        User1
                        <span style={timestampStyle}>12:00 PM</span>
                    </div>
                    <div style={textStyle}>First message in the group</div>
                </div>
            </div>

            {/* Continuation message */}
            {!hideConsecutive && (
                <div style={{ ...messageStyle(false), paddingLeft: "8px" }}>
                    {consecutiveLine && <div style={lineStyle} />}
                    <div style={avatarColStyle} />
                    <div style={contTextColStyle}>
                        {!hideConsecutiveNames && (
                            <div style={{ ...usernameStyle, fontSize: "12px", opacity: 0.7 }}>
                                User1
                            </div>
                        )}
                        <div style={textStyle}>Continuation message (same user)</div>
                    </div>
                </div>
            )}

            {hideConsecutive && (
                <div style={{ padding: "4px 8px 8px", color: "var(--text-muted, #72767d)", fontSize: "12px", fontStyle: "italic" }}>
                    Continuation message avatar hidden
                </div>
            )}
        </div>
    );
}

// ─── Preview: Cleanup section ─────────────────────────────────────────────────

function CleanupPreview() {
    (window as any).__settingsHub?.useSettingsReactive(settings);
    const { hideClanTags } = settings.store;

    const containerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px",
        background: "var(--background-secondary, #2f3136)",
        borderRadius: "6px",
    };

    const usernameStyle: React.CSSProperties = {
        color: "var(--header-primary, #fff)",
        fontWeight: 600,
        fontSize: "14px",
    };

    const clanTagStyle: React.CSSProperties = {
        display: hideClanTags ? "none" : "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "1px 6px",
        background: "var(--background-modifier-accent, #4f545c)",
        borderRadius: "4px",
        fontSize: "12px",
        color: "var(--text-muted, #72767d)",
    };

    return (
        <div>
            <div style={containerStyle}>
                <span style={usernameStyle}>User1</span>
                <span style={clanTagStyle}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                        <path d="M12 2L3 7v6c0 5 4 9.7 9 11 5-1.3 9-6 9-11V7L12 2z" />
                    </svg>
                    TheServer
                </span>
            </div>
            {hideClanTags && (
                <div style={{ marginTop: "6px", color: "var(--text-muted, #72767d)", fontSize: "12px", textAlign: "center" }}>
                    Clan tag hidden
                </div>
            )}
        </div>
    );
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export function createMessageHeaderAvatarSchema(s: DefinedSettings): any {
    settings = s;
    return {
    plugin: "MessageHeaderAvatar",
    description: "Inline avatars in message headers with consecutive message controls",
    icon: AvatarIcon,
    settings,
    sections: [
        {
            id: "avatar",
            label: "Avatar",
            preview: AvatarPreview,
            groups: [
                {
                    label: "Size",
                    settings: [
                        {
                            key: "size",
                            label: "Avatar Size",
                            description: "Inline avatar diameter in pixels",
                            tags: ["avatar", "size", "icon", "inline", "px"],
                            control: "slider",
                            slider: { min: 10, max: 24, step: 1, unit: "px" },
                        },
                        { key: "avatarShape", label: "Avatar Shape", description: "Circle or rounded square", tags: ["shape", "circle", "round", "square"] },
                        { key: "replyAvatarSize", label: "Reply Avatar Size", description: "Size of avatar in reply previews", control: "slider", slider: { min: 8, max: 16, unit: "px" }, tags: ["reply", "size", "avatar"] },
                    ],
                },
            ],
        },
        {
            id: "consecutive",
            label: "Consecutive Messages",
            preview: ConsecutivePreview,
            groups: [
                {
                    label: "Visibility",
                    settings: [
                        {
                            key: "hideConsecutive",
                            label: "Hide Consecutive Avatars",
                            description: "Hide avatar on follow-up messages from the same user",
                            tags: ["consecutive", "hide", "avatar", "repeat", "same user"],
                        },
                        {
                            key: "hideConsecutiveNames",
                            label: "Hide Consecutive Usernames",
                            description: "Hide username on follow-up messages from the same user",
                            tags: ["consecutive", "hide", "username", "name", "repeat", "same user"],
                        },
                    ],
                },
                {
                    label: "Vertical Line",
                    settings: [
                        {
                            key: "consecutiveLine",
                            label: "Show Vertical Line",
                            description: "Draw a line on the left side of consecutive messages",
                            tags: ["line", "consecutive", "vertical", "indicator", "thread"],
                        },
                        {
                            key: "lineOffset",
                            label: "Line Offset",
                            description: "Distance from the left edge in pixels",
                            tags: ["line", "offset", "position", "left"],
                            control: "slider",
                            slider: { min: 20, max: 80, step: 1, unit: "px" },
                        },
                        {
                            key: "lineWidth",
                            label: "Line Width",
                            description: "Thickness of the vertical line in pixels",
                            tags: ["line", "width", "thickness", "size"],
                            control: "slider",
                            slider: { min: 1, max: 6, step: 1, unit: "px" },
                        },
                        {
                            key: "lineOpacity",
                            label: "Line Opacity",
                            description: "Transparency of the vertical line (0.05 = nearly invisible, 1.0 = fully opaque)",
                            tags: ["line", "opacity", "transparency", "alpha"],
                            control: "slider",
                            slider: { min: 0.05, max: 1.0, step: 0.05 },
                        },
                        {
                            key: "lineColor",
                            label: "Line Color",
                            description: "Color of the vertical line (CSS color or variable)",
                            tags: ["line", "color", "colour"],
                            control: "color",
                        },
                    ],
                },
            ],
        },
        {
            id: "cleanup",
            label: "Cleanup",
            preview: CleanupPreview,
            groups: [
                {
                    label: "Elements to Hide",
                    settings: [
                        {
                            key: "hideClanTags",
                            label: "Hide Clan Tags",
                            description: "Remove server identity and clan tag badges next to usernames",
                            tags: ["clan", "tag", "badge", "server identity", "hide", "cleanup"],
                        },
                    ],
                },
            ],
        },
    ],
    };
}
