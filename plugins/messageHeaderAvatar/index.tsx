/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";
import "../_libAnimationKit/animations.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { SelectedGuildStore, useState } from "@webpack/common";
import { createMessageHeaderAvatarSchema } from "./settingsSchema";

export const settings = definePluginSettings({
    size: {
        type: OptionType.NUMBER,
        description: "Avatar size in pixels",
        default: 16,
    },
    avatarShape: {
        type: OptionType.SELECT,
        description: "Shape of inline avatars",
        options: [
            { label: "Circle", value: "circle", default: true },
            { label: "Rounded square", value: "rounded" },
        ],
    },
    replyAvatarSize: {
        type: OptionType.NUMBER,
        description: "Avatar size in reply previews (px)",
        default: 12,
    },
    hideConsecutive: {
        type: OptionType.BOOLEAN,
        description: "Hide avatar on consecutive messages from the same user",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-msgHeaderAvatar-hideConsecutive", val),
    },
    hideConsecutiveNames: {
        type: OptionType.BOOLEAN,
        description: "Hide username on consecutive messages from the same user",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-msgHeaderAvatar-hideConsecutiveNames", val),
    },
    hideClanTags: {
        type: OptionType.BOOLEAN,
        description: "Hide server identity / clan tag badges next to usernames",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-msgHeaderAvatar-hideClanTags", val),
    },
    consecutiveLine: {
        type: OptionType.BOOLEAN,
        description: "Show a vertical line on the left of consecutive messages from the same user",
        default: false,
        onChange: (val: boolean) => document.body.classList.toggle("vc-msgHeaderAvatar-consecutiveLine", val),
    },
    lineOffset: {
        type: OptionType.NUMBER,
        description: "Consecutive line: left offset in pixels",
        default: 52,
        onChange: (val: number) => document.documentElement.style.setProperty("--vc-msgHeaderAvatar-line-offset", val + "px"),
    },
    lineWidth: {
        type: OptionType.NUMBER,
        description: "Consecutive line: width in pixels",
        default: 2,
        onChange: (val: number) => document.documentElement.style.setProperty("--vc-msgHeaderAvatar-line-width", val + "px"),
    },
    lineOpacity: {
        type: OptionType.NUMBER,
        description: "Consecutive line: opacity (0.0 to 1.0)",
        default: 0.4,
        onChange: (val: number) => document.documentElement.style.setProperty("--vc-msgHeaderAvatar-line-opacity", String(val)),
    },
    lineColor: {
        type: OptionType.STRING,
        description: "Consecutive line: CSS color (e.g. var(--text-muted), #5865f2)",
        default: "var(--text-muted)",
        onChange: (val: string) => document.documentElement.style.setProperty("--vc-msgHeaderAvatar-line-color", val),
    },
});

function InlineAvatarComponent({ message, isReply }: { message: Message; isReply?: boolean; }) {
    const [isHovering, setIsHovering] = useState(false);
    const author = message.author;
    if (!author) return null;

    const size = isReply ? (settings.store.replyAvatarSize as number) : (settings.store.size as number);

    return (
        <img
            className={`vc-msgHeaderAvatar-icon${isReply ? " vc-msgHeaderAvatar-reply" : ""}`}
            src={author.getAvatarURL(SelectedGuildStore.getGuildId(), size * 2, isHovering)}
            width={size}
            height={size}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{
                borderRadius: settings.store.avatarShape === "rounded" ? "4px" : "50%",
            }}
        />
    );
}

export default definePlugin({
    name: "MessageHeaderAvatar",
    description: "Displays user avatars inline in message headers next to the username",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("MessageHeaderAvatar")}>
                Open Full Settings
            </Button>
        );
    },

    start() {
        (window as any).__settingsHub?.register(createMessageHeaderAvatarSchema(settings));
        document.body.classList.toggle("vc-msgHeaderAvatar-hideConsecutive", settings.store.hideConsecutive);
        document.body.classList.toggle("vc-msgHeaderAvatar-hideConsecutiveNames", settings.store.hideConsecutiveNames);
        document.body.classList.toggle("vc-msgHeaderAvatar-hideClanTags", settings.store.hideClanTags);
        document.body.classList.toggle("vc-msgHeaderAvatar-consecutiveLine", settings.store.consecutiveLine);

        const s = document.documentElement.style;
        s.setProperty("--vc-msgHeaderAvatar-line-offset", settings.store.lineOffset + "px");
        s.setProperty("--vc-msgHeaderAvatar-line-width", settings.store.lineWidth + "px");
        s.setProperty("--vc-msgHeaderAvatar-line-opacity", String(settings.store.lineOpacity));
        s.setProperty("--vc-msgHeaderAvatar-line-color", settings.store.lineColor);
    },

    stop() {
        (window as any).__settingsHub?.unregister("MessageHeaderAvatar");
        document.body.classList.remove("vc-msgHeaderAvatar-hideConsecutive");
        document.body.classList.remove("vc-msgHeaderAvatar-hideConsecutiveNames");
        document.body.classList.remove("vc-msgHeaderAvatar-hideClanTags");
        document.body.classList.remove("vc-msgHeaderAvatar-consecutiveLine");

        const s = document.documentElement.style;
        s.removeProperty("--vc-msgHeaderAvatar-line-offset");
        s.removeProperty("--vc-msgHeaderAvatar-line-width");
        s.removeProperty("--vc-msgHeaderAvatar-line-opacity");
        s.removeProperty("--vc-msgHeaderAvatar-line-color");
    },

    patches: [
        // Inject avatar inside the username span's children (handles both messages and replies)
        {
            find: '="SYSTEM_TAG"',
            replacement: {
                match: /(children:)(.*?)(,"data-text":)/,
                replace: "$1[$self.UsernameAvatar(arguments[0]),$2]$3"
            }
        },
    ],

    UsernameAvatar: ErrorBoundary.wrap((props: { message: Message; withMentionPrefix?: boolean; }) => {
        return <InlineAvatarComponent message={props.message} isReply={!!props.withMentionPrefix} />;
    }, { noop: true }),
});
