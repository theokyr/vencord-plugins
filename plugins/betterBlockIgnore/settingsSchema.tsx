/*
 * Vencord userplugin - BetterBlockIgnore
 * Authors: kamaras
 * Forked from Vencord's NoBlockedMessages plugin.
 * Upstream copyright: Vendicated and contributors.
 * Upstream plugin authors: rushii, Samu, jamesbt365.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DefinedSettings } from "@api/Settings";
import type { SettingsSchema } from "../settingsHub/schema";

function BetterBlockIgnoreIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a6.96 6.96 0 0 1 4.2 1.4l-9.8 9.8A7 7 0 0 1 12 5Zm0 14a6.96 6.96 0 0 1-4.2-1.4l9.8-9.8A7 7 0 0 1 12 19Z" />
        </svg>
    );
}

export function createBetterBlockIgnoreSchema(settings: DefinedSettings): SettingsSchema {
    return {
        plugin: "BetterBlockIgnore",
        description: "Hide blocked and ignored users more completely",
        icon: BetterBlockIgnoreIcon,
        settings,
        sections: [
            {
                id: "messages",
                label: "Messages",
                groups: [
                    {
                        label: "Blocked Content",
                        settings: [
                            {
                                key: "hideBlockedMessages",
                                label: "Hide Blocked Message Groups",
                                description: "Remove Discord's collapsed blocked-message placeholder from chat.",
                            },
                            {
                                key: "ignoreMessages",
                                label: "Ignore Incoming Messages",
                                description: "Drop incoming messages authored by blocked or ignored users before stores process them.",
                            },
                            {
                                key: "hideRepliesToBlockedUsers",
                                label: "Hide Replies",
                                description: "Hide direct replies to messages from blocked or ignored users.",
                            },
                            {
                                key: "hideMentionsOfBlockedUsers",
                                label: "Hide Mentions",
                                description: "Hide messages that mention blocked or ignored users.",
                            },
                        ],
                    },
                ],
            },
            {
                id: "relationships",
                label: "Relationships",
                groups: [
                    {
                        settings: [
                            {
                                key: "applyToIgnoredUsers",
                                label: "Apply to Ignored Users",
                                description: "Use the same filters for Discord's ignored-user relationship state.",
                            },
                        ],
                    },
                ],
            },
            {
                id: "reactions",
                label: "Reactions",
                groups: [
                    {
                        settings: [
                            {
                                key: "hideReactionsFromBlockedUsers",
                                label: "Hide Reactions",
                                description: "Hide reaction events and reaction-list users from blocked or ignored users.",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
