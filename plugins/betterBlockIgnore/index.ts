/*
 * Vencord userplugin - BetterBlockIgnore
 * Authors: kamaras
 * Forked from Vencord's NoBlockedMessages plugin.
 * Upstream copyright: Vendicated and contributors.
 * Upstream plugin authors: rushii, Samu, jamesbt365.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { runtimeHashMessageKey } from "@utils/intlHash";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { i18n, MessageStore, RelationshipStore, useStateFromStores } from "@webpack/common";

import {
    filterReactionCountsByRelationship,
    shouldHideMessageByRelationship,
    shouldHideMemberListRow,
    shouldHideReactionByRelationship,
    type BetterBlockIgnoreOptions,
    type MessageLike,
    type MemberListRowLike,
    type ReactionEventLike,
    type RelationshipChecks,
} from "./filter";
import { createBetterBlockIgnoreSchema } from "./settingsSchema";

interface MessageDeleteProps {
    collapsedReason: () => unknown;
}

const logger = new Logger("BetterBlockIgnore");
const MessageReactionsStore = findStoreLazy("MessageReactionsStore");

const settings = definePluginSettings({
    hideBlockedMessages: {
        description: "Hide blocked message groups instead of showing Discord's collapsed placeholder",
        type: OptionType.BOOLEAN,
        default: true,
    },
    ignoreMessages: {
        description: "Completely ignore incoming messages authored by blocked or ignored users",
        type: OptionType.BOOLEAN,
        default: false,
    },
    applyToIgnoredUsers: {
        description: "Also apply filters to ignored users",
        type: OptionType.BOOLEAN,
        default: true,
    },
    hideReactionsFromBlockedUsers: {
        description: "Hide new reactions and reaction-list users from blocked or ignored users",
        type: OptionType.BOOLEAN,
        default: true,
    },
    hideRepliesToBlockedUsers: {
        description: "Hide direct replies to messages from blocked or ignored users",
        type: OptionType.BOOLEAN,
        default: true,
    },
    hideMentionsOfBlockedUsers: {
        description: "Hide messages that mention blocked or ignored users",
        type: OptionType.BOOLEAN,
        default: true,
    },
    hideSidebarMembers: {
        description: "Remove blocked or ignored users from the channel member list",
        type: OptionType.BOOLEAN,
        default: true,
    },
});

function currentOptions(): BetterBlockIgnoreOptions {
    return {
        applyToIgnoredUsers: settings.store.applyToIgnoredUsers,
        hideBlockedMessages: settings.store.hideBlockedMessages,
        hideRepliesToBlockedUsers: settings.store.hideRepliesToBlockedUsers,
        hideMentionsOfBlockedUsers: settings.store.hideMentionsOfBlockedUsers,
        hideReactionsFromBlockedUsers: settings.store.hideReactionsFromBlockedUsers,
    };
}

function relationshipChecks(): RelationshipChecks {
    return {
        isBlocked: userId => RelationshipStore.isBlocked(userId),
        isIgnored: userId => RelationshipStore.isIgnored(userId),
    };
}

function resolveMessage(channelId: string, messageId: string): MessageLike | undefined {
    return MessageStore.getMessage(channelId, messageId) as MessageLike | undefined;
}

function withoutAuthorFiltering(options: BetterBlockIgnoreOptions): BetterBlockIgnoreOptions {
    return {
        ...options,
        hideBlockedMessages: false,
    };
}

export default definePlugin({
    name: "BetterBlockIgnore",
    description: "Hides blocked and ignored users more completely: messages, replies, mentions, and reactions",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    tags: ["Accessibility", "Chat", "Privacy"],
    settings,
    settingsAboutComponent() {
        const { Button, React } = require("@webpack/common");
        return React.createElement(
            Button,
            { onClick: () => (window as any).__settingsHub?.open("BetterBlockIgnore") },
            "Open Full Settings",
        );
    },

    start() {
        (window as any).__settingsHub?.register(createBetterBlockIgnoreSchema(settings));
    },

    stop() {
        (window as any).__settingsHub?.unregister("BetterBlockIgnore");
    },

    patches: [
        {
            find: ".__invalid_blocked,",
            replacement: [
                {
                    match: /let{messages:\i,[^}]*?collapsedReason[^}]*}/,
                    replace: "if($self.shouldHideCollapsedGroup(arguments[0]))return null;$&"
                }
            ]
        },
        {
            find: '"MessageStore"',
            replacement: [
                {
                    match: /(?<=MESSAGE_CREATE:function\((\i)\){)/,
                    replace: (_, props) => `if($self.shouldDropIncomingMessage(${props}.message))return;`
                },
                {
                    match: /(?<=MESSAGE_REACTION_ADD:function\((\i)\){)/,
                    replace: (_, props) => `if($self.shouldDropReaction(${props}))return;`
                }
            ]
        },
        {
            find: '"ReadStateStore"',
            replacement: [
                {
                    match: /(?<=MESSAGE_CREATE:function\((\i)\){)/,
                    replace: (_, props) => `if($self.shouldDropIncomingMessage(${props}.message))return;`
                }
            ]
        },
        {
            find: '"MessageReactionsStore"',
            replacement: {
                match: /(?<=MESSAGE_REACTION_ADD:function\((\i)\){)/,
                replace: (_, props) => `if($self.shouldDropReaction(${props}))return;`
            }
        },
        {
            find: "hoistReaction:",
            replacement: {
                match: /function\((\i)\)\{let\{message:(\i),maxReactions:(\i),hoistReaction:(\i)\}=\1,/,
                replace: "function($1){let{message:$2,maxReactions:$3,hoistReaction:$4}=$1;$2=$self.useFilteredReactions($2);let "
            }
        },
        {
            find: "Message must not be a thread starter message",
            replacement: {
                match: /\)\("li",\{(.+?),className:/,
                replace: ")(\"li\",{$1,className:($self.shouldHideRenderedMessage(arguments[0]?.message)?\"vc-better-block-ignore-hidden \":\"\")+"
            }
        },
        {
            find: "content-inventory-hidden-entry",
            group: true,
            replacement: [
                {
                    match: /((\i)=this\.getRowProps\(\i\);)(?=if\(null!=\2\))/,
                    replace: "$1if($self.shouldHideMemberListRow($2))return null;"
                },
                {
                    match: /rowHeight:this\.getRowHeightComputer\(\)/,
                    replace: "rowHeight:$self.wrapMemberListRowHeight(this,this.getRowHeightComputer())"
                }
            ]
        }
    ],

    shouldHideCollapsedGroup(props: MessageDeleteProps): boolean {
        if (!settings.store.hideBlockedMessages) return false;

        try {
            const collapsedReason = props.collapsedReason();
            const is = (key: string) => collapsedReason === i18n.t[runtimeHashMessageKey(key)]();

            return is("BLOCKED_MESSAGE_COUNT") || (settings.store.applyToIgnoredUsers && is("IGNORED_MESSAGE_COUNT"));
        } catch (e) {
            logger.error("Failed to check collapsed message group:", e);
            return false;
        }
    },

    shouldHideRenderedMessage(message: Message | null | undefined): boolean {
        try {
            return shouldHideMessageByRelationship(
                message as MessageLike | null | undefined,
                currentOptions(),
                relationshipChecks(),
                resolveMessage
            );
        } catch (e) {
            logger.error("Failed to check rendered message:", e);
            return false;
        }
    },

    shouldDropIncomingMessage(message: MessageLike | null | undefined): boolean {
        try {
            if (!message) return false;

            if (settings.store.ignoreMessages) {
                const authorOnlyOptions = {
                    ...currentOptions(),
                    hideRepliesToBlockedUsers: false,
                    hideMentionsOfBlockedUsers: false,
                };

                if (shouldHideMessageByRelationship(message, authorOnlyOptions, relationshipChecks(), resolveMessage)) {
                    return true;
                }
            }

            return shouldHideMessageByRelationship(
                message,
                withoutAuthorFiltering(currentOptions()),
                relationshipChecks(),
                resolveMessage
            );
        } catch (e) {
            logger.error("Failed to check incoming message:", e);
            return false;
        }
    },

    shouldDropReaction(event: ReactionEventLike | null | undefined): boolean {
        try {
            return shouldHideReactionByRelationship(event, currentOptions(), relationshipChecks());
        } catch (e) {
            logger.error("Failed to check reaction event:", e);
            return false;
        }
    },

    shouldHideMemberListRow(row: MemberListRowLike | null | undefined): boolean {
        try {
            return shouldHideMemberListRow(
                row,
                settings.store.hideSidebarMembers,
                relationshipChecks(),
                settings.store.applyToIgnoredUsers
            );
        } catch (e) {
            logger.error("Failed to check member-list row:", e);
            return false;
        }
    },

    wrapMemberListRowHeight(
        list: { getRowProps(props: { section: number; row: number; type: string; }): MemberListRowLike | null; },
        rowHeight: number | ((section: number, row: number, ...args: unknown[]) => number)
    ) {
        return (section: number, row: number, ...args: unknown[]) => {
            const member = list.getRowProps({ section, row, type: "row" });
            if (this.shouldHideMemberListRow(member)) return 0;
            return typeof rowHeight === "function"
                ? rowHeight(section, row, ...args)
                : rowHeight;
        };
    },

    useFilteredReactions(message: Message): Message {
        return useStateFromStores([MessageReactionsStore], () => {
            if (!settings.store.hideReactionsFromBlockedUsers) return message;

            let changed = false;
            const reactions = message.reactions.flatMap(reaction => {
                const getReactorIds = (type: number) => MessageReactionsStore
                    .getReactions(message.channel_id, message.id, reaction.emoji, 100, type)
                    ?.keys() ?? [];
                const filtered = filterReactionCountsByRelationship(
                    reaction,
                    getReactorIds(0),
                    getReactorIds(1),
                    currentOptions(),
                    relationshipChecks()
                );
                changed ||= filtered !== reaction;
                return filtered ? [filtered] : [];
            });

            return changed ? message.set("reactions", reactions) : message;
        });
    },
});
