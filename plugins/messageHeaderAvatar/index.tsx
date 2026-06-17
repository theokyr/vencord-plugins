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
import { getHiddenGroupingDecisions, type HiddenGroupingRow } from "./hiddenGrouping";
import { createMessageHeaderAvatarSchema } from "./settingsSchema";

const AUTHOR_ID_ATTRIBUTE = "data-vc-msg-header-avatar-author-id";
const FORCE_HEADER_CLASS = "vc-msgHeaderAvatar-forceHeader";
const COLLAPSE_HEADER_CLASS = "vc-msgHeaderAvatar-collapseHeader";

let hiddenGroupingObserver: MutationObserver | null = null;
let hiddenGroupingFrame: number | null = null;

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

function messageElementForListItem(item: HTMLLIElement): HTMLElement | null {
    return item.querySelector<HTMLElement>('[class*="message_"]');
}

function rowForListItem(item: HTMLLIElement): HiddenGroupingRow {
    return {
        authorId: item.getAttribute(AUTHOR_ID_ATTRIBUTE),
        hidden: item.classList.contains("vc-better-block-ignore-hidden"),
        groupStart: String(messageElementForListItem(item)?.className ?? "").includes("groupStart_"),
    };
}

function syncHiddenGroupingClasses() {
    const items = Array.from(document.querySelectorAll<HTMLLIElement>(`li[${AUTHOR_ID_ATTRIBUTE}],li.vc-better-block-ignore-hidden`));
    const decisions = getHiddenGroupingDecisions(items.map(rowForListItem));

    items.forEach((item, index) => {
        item.classList.toggle(FORCE_HEADER_CLASS, decisions[index] === "forceHeader");
        item.classList.toggle(COLLAPSE_HEADER_CLASS, decisions[index] === "collapseHeader");
    });
}

function scheduleHiddenGroupingSync() {
    if (hiddenGroupingFrame != null) return;

    hiddenGroupingFrame = requestAnimationFrame(() => {
        hiddenGroupingFrame = null;
        syncHiddenGroupingClasses();
    });
}

function startHiddenGroupingObserver() {
    syncHiddenGroupingClasses();
    hiddenGroupingObserver = new MutationObserver(scheduleHiddenGroupingSync);
    hiddenGroupingObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", AUTHOR_ID_ATTRIBUTE],
        childList: true,
        subtree: true,
    });
}

function stopHiddenGroupingObserver() {
    hiddenGroupingObserver?.disconnect();
    hiddenGroupingObserver = null;

    if (hiddenGroupingFrame != null) {
        cancelAnimationFrame(hiddenGroupingFrame);
        hiddenGroupingFrame = null;
    }

    document.querySelectorAll(`.${FORCE_HEADER_CLASS},.${COLLAPSE_HEADER_CLASS}`).forEach(item => {
        item.classList.remove(FORCE_HEADER_CLASS, COLLAPSE_HEADER_CLASS);
    });
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

        startHiddenGroupingObserver();
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

        stopHiddenGroupingObserver();
    },

    patches: [
        // Add the author id to message list items so hidden BetterBlockIgnore messages can be
        // ignored when deciding whether the next visible message should keep its header.
        {
            find: "Message must not be a thread starter message",
            replacement: {
                match: /"aria-setsize":-1,/,
                replace: `"${AUTHOR_ID_ATTRIBUTE}":arguments[0]?.message?.author?.id,$&`
            }
        },
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
