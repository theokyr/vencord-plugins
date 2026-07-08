/*
 * Vencord userplugin - VipNotifications
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import {
    ChannelStore,
    FluxDispatcher,
    GuildStore,
    PresenceStore,
    StreamerModeStore,
    UserSettingsProtoStore,
    UserStore,
} from "@webpack/common";

import { DecisionCache } from "./decisionCache";
import { buildMessageContext } from "./messageContext";
import { NotificationService } from "./notificationService";
import { resolveDeliveryPlan } from "./profiles";
import { findFirstMatch } from "./ruleEngine";
import { createVipNotificationsSchema } from "./settingsSchema";
import { readConfig, settings } from "./settings";
import {
    createNativeDiscordAdapter,
    probeNativeDiscordCapabilities,
    shouldClaimNativeDesktop,
    shouldBypassNativeDesktopGate,
    type NativeDesktopGate,
} from "./adapters/nativeDiscordAdapter";
import { createPluginAlertAdapter } from "./adapters/pluginAlertAdapter";
import { contextMenus } from "./contextMenus";
import type { DeliveryDecision, VipConfig } from "./types";

declare global {
    interface Window {
        __settingsHub?: {
            register(schema: unknown): void;
            unregister(pluginName: string): void;
            open(pluginName: string): void;
        };
    }
}

interface MessageCreateEvent {
    message?: any;
    optimistic?: boolean;
}

const UserGuildSettingsStore = findStoreLazy("UserGuildSettingsStore") as {
    isGuildOrCategoryOrChannelMuted?: (guildId: string, channelId: string) => boolean;
    isChannelMuted?: (guildId: string, channelId: string) => boolean;
};

let decisionCache: DecisionCache | null = null;
let notificationService: NotificationService | null = null;
let runtimeDecisionTtlMs: number | null = null;
let subscribed = false;
const nativeDesktopGates = new Set<NativeDesktopGate>([
    "status",
    "streamerMode",
    "noMessages",
    "selectedChannel",
    "muted",
]);

function resetRuntime() {
    decisionCache = null;
    notificationService = null;
    runtimeDecisionTtlMs = null;
}

function buildRuntime(config: VipConfig) {
    decisionCache = new DecisionCache(config.decisionTtlMs);
    notificationService = new NotificationService(decisionCache, {
        plugin: createPluginAlertAdapter(),
        native: createNativeDiscordAdapter(),
        capabilities: probeNativeDiscordCapabilities(),
    });
    runtimeDecisionTtlMs = config.decisionTtlMs;
}

function getNotificationService(config: VipConfig): NotificationService {
    if (!notificationService || runtimeDecisionTtlMs !== config.decisionTtlMs)
        buildRuntime(config);

    return notificationService!;
}

function isNativeDesktopGate(gateName: unknown): gateName is NativeDesktopGate {
    return typeof gateName === "string" && nativeDesktopGates.has(gateName as NativeDesktopGate);
}

function getCurrentUserId(): string | null {
    try {
        return UserStore.getCurrentUser()?.id ?? null;
    } catch {
        return null;
    }
}

function getChannel(channelId: string) {
    try {
        return ChannelStore.getChannel(channelId) ?? null;
    } catch {
        return null;
    }
}

function getGuild(guildId: string | null | undefined) {
    if (!guildId)
        return null;

    try {
        return GuildStore.getGuild(guildId) ?? null;
    } catch {
        return null;
    }
}

function getMessageChannelId(message: any, fallbackChannelId = ""): string {
    return typeof message?.channelId === "string"
        ? message.channelId
        : typeof message?.channel_id === "string"
            ? message.channel_id
            : fallbackChannelId;
}

function messageHasChannelId(message: any): boolean {
    return typeof message?.channelId === "string" || typeof message?.channel_id === "string";
}

function withResolvedChannelId(message: any, channelId: string): any {
    if (!channelId || messageHasChannelId(message))
        return message;

    return {
        ...message,
        channel_id: channelId,
    };
}

function getMessageGuildId(message: any, channel: any): string | null {
    const guildId = message?.guildId ?? message?.guild_id ?? channel?.guildId ?? channel?.guild_id;
    return typeof guildId === "string" && guildId ? guildId : null;
}

function isOptimisticMessage(event: MessageCreateEvent, message: any): boolean {
    return Boolean(
        event.optimistic
        || message?.optimistic
        || message?.isOptimistic
        || message?.state === "SENDING"
    );
}

function isStreamerModeEnabled(): boolean {
    try {
        return Boolean(StreamerModeStore.enabled);
    } catch {
        return false;
    }
}

function isCurrentUserDnd(currentUserId: string): boolean {
    try {
        if (UserSettingsProtoStore.settings?.status?.status?.value === "dnd")
            return true;
    } catch {
        // Fall back to presence store.
    }

    try {
        return PresenceStore.getStatus(currentUserId) === "dnd";
    } catch {
        return false;
    }
}

function isChannelMutedForMessage(channel: any, guildId: string | null): boolean {
    if (!channel?.id || !guildId)
        return false;

    try {
        if (UserGuildSettingsStore.isGuildOrCategoryOrChannelMuted?.(guildId, channel.id))
            return true;
    } catch {
        // Fall back to the narrower direct channel check below.
    }

    try {
        return UserGuildSettingsStore.isChannelMuted?.(guildId, channel.id) ?? false;
    } catch {
        return false;
    }
}

function buildDeliveryDecision(message: any, channelId: string, config: VipConfig, event?: MessageCreateEvent): DeliveryDecision | null {
    const messageId = typeof message?.id === "string" ? message.id : "";
    if (!messageId)
        return null;

    const isOptimistic = isOptimisticMessage(event ?? { message }, message);
    if (isOptimistic)
        return null;

    const currentUserId = getCurrentUserId();
    if (!currentUserId)
        return null;

    if (message?.author?.id === currentUserId || message?.authorId === currentUserId || message?.author_id === currentUserId)
        return null;

    const resolvedChannelId = getMessageChannelId(message, channelId);
    if (!resolvedChannelId)
        return null;

    const normalizedMessage = withResolvedChannelId(message, resolvedChannelId);
    const channel = getChannel(resolvedChannelId);
    const guild = getGuild(getMessageGuildId(normalizedMessage, channel));
    const ctx = buildMessageContext({
        message: normalizedMessage,
        channel,
        guild,
        currentUserId,
        isStreamerMode: isStreamerModeEnabled(),
        isDnd: isCurrentUserDnd(currentUserId),
        isOptimistic,
    });

    if (ctx.isCurrentUser || ctx.isOptimistic || !ctx.messageId)
        return null;

    const match = findFirstMatch(ctx, config.rules);
    if (!match)
        return null;

    const planResult = resolveDeliveryPlan(config, match.rule, ctx);
    if (!planResult.ok)
        return null;

    return {
        messageId: ctx.messageId,
        ctx,
        plan: planResult.plan,
        nativeSuppressions: {
            muted: isChannelMutedForMessage(channel, ctx.guildId),
        },
    };
}

async function handleMessageCreate(event: MessageCreateEvent) {
    const message = event.message;
    const channelId = getMessageChannelId(message);
    const { config } = readConfig();
    const decision = buildDeliveryDecision(message, channelId, config, event);
    if (!decision)
        return;

    await getNotificationService(config).deliver(decision);
}

function markNativeDesktopClaimedForMessage(message: any, channelId: string): void {
    try {
        const { config } = readConfig();
        const decision = buildDeliveryDecision(message, channelId, config);
        if (!decision || !shouldClaimNativeDesktop(decision, true))
            return;

        const now = Date.now();
        getNotificationService(config).markNativeDesktopClaimed(decision, now);
    } catch {
        // Native notification hooks must never affect Discord's notification predicate.
    }
}

function claimNativeDesktopForMessage(message: any, channelId: string, nativeAllowed: unknown): boolean {
    if (!nativeAllowed)
        return false;

    try {
        markNativeDesktopClaimedForMessage(message, channelId);
    } catch {
        // Preserve Discord's native allowed result even if our cache hook fails.
    }

    return true;
}

function onMessageCreate(event: MessageCreateEvent) {
    try {
        void handleMessageCreate(event).catch(() => {});
    } catch {
        // Never let FluxDispatcher subscriber failures reset Discord's gateway.
    }
}

export default definePlugin({
    name: "VipNotifications",
    description: "VIP notification rules that can alert through Discord notification restrictions",
    authors: [{ name: "kamaras", id: 132106519264100352n }],
    settings,
    contextMenus,
    settingsAboutComponent() {
        const { Button } = require("@webpack/common");
        return (
            <Button onClick={() => (window as any).__settingsHub?.open("VipNotifications")}>
                Open Full Settings
            </Button>
        );
    },

    patches: [
        {
            find: ".SUPPRESS_NOTIFICATIONS))return!1",
            group: true,
            replacement: [
                {
                    match: /\|\|(\i)\.(\i)\.getSetting\(\)(?=\|\|!(\i)\.ignoreNoMessagesSetting&&\i\.\i\.allowNoMessages\(\i\))/,
                    replace: (_, streamerModeStore, streamerModeExport, options) =>
                        `||!${options}.ignoreStreamerMode&&${streamerModeStore}.${streamerModeExport}.getSetting()`,
                },
                {
                    match: /!(\i)\((\i),(\i),(\i),\{ignoreStatus:(\i),ignoreSameUser:(\i)\.(\i)\.SELF_MENTIONABLE_SYSTEM\.has\((\i)\.type\)\}\)/,
                    replace: (_, canNotify, currentUser, author, channel, ignoreStatus, constants, selfMentionableSystemExport, message) =>
                        `!${canNotify}(${currentUser},${author},${channel},{ignoreStatus:${ignoreStatus}||$self.shouldBypassNativeGate(${message},${channel}.id,"status"),ignoreStreamerMode:$self.shouldBypassNativeGate(${message},${channel}.id,"streamerMode"),ignoreNoMessagesSetting:$self.shouldBypassNativeGate(${message},${channel}.id,"noMessages"),ignoreSameUser:${constants}.${selfMentionableSystemExport}.SELF_MENTIONABLE_SYSTEM.has(${message}.type)})`,
                },
                {
                    match: /!(\i)&&(\i)\((\i)\.id\)/,
                    replace: (_, includeSelectedChannel, isSelectedChannel, channel) =>
                        `!${includeSelectedChannel}&&${isSelectedChannel}(${channel}.id)&&!$self.shouldBypassNativeGate(arguments[0],${channel}.id,"selectedChannel")`,
                },
                {
                    match: /if\((\i)\.(\i)\.isMuted\((\i)\.id\)\)return!1;/,
                    replace: (_, mutedStore, mutedStoreExport, channel) =>
                        `if(${mutedStore}.${mutedStoreExport}.isMuted(${channel}.id)&&!$self.shouldBypassNativeGate(arguments[0],${channel}.id,"muted"))return!1;`,
                },
                {
                    match: /let (\i)=\(0,(\i)\.(\i)\)\((\i)\);return \1!==(\i)\.(\i)\.NO_MESSAGES&&\(\1===\5\.\6\.ALL_MESSAGES\|\|\(0,(\i)\.(\i)\)\(\{rawMessage:(\i),userId:(\i)\.id,suppressEveryone:!1,suppressRoles:!1\}\)\)/,
                    replace: (_, messageSetting, getMessageSetting, getMessageSettingExport, channel, notificationSettingTypes, notificationSettingTypesExport, mentionUtils, mentionUtilsExport, message, currentUser) =>
                        `let ${messageSetting}=(0,${getMessageSetting}.${getMessageSettingExport})(${channel});return $self.claimNativeDesktop(${message},${channel}.id,${messageSetting}!==${notificationSettingTypes}.${notificationSettingTypesExport}.NO_MESSAGES&&(${messageSetting}===${notificationSettingTypes}.${notificationSettingTypesExport}.ALL_MESSAGES||(0,${mentionUtils}.${mentionUtilsExport})({rawMessage:${message},userId:${currentUser}.id,suppressEveryone:!1,suppressRoles:!1})))`,
                },
                {
                    match: /if\((\i)\.(\i)\.allowAllMessages\((\i)\)&&(\i)\)return!0;/,
                    replace: (_, notificationSettings, notificationSettingsExport, channel, canNotifyChannel) =>
                        `if(${notificationSettings}.${notificationSettingsExport}.allowAllMessages(${channel})&&${canNotifyChannel})return $self.claimNativeDesktop(arguments[0],${channel}.id,!0);`,
                },
                {
                    match: /let (\i)=(\i)\.(\i)\.isSuppressEveryoneEnabled\((\i)\.getGuildId\(\)\),(\i)=\2\.\3\.isSuppressRolesEnabled\(\4\.getGuildId\(\)\);return\(0,(\i)\.(\i)\)\(\{rawMessage:(\i),userId:(\i)\.id,suppressEveryone:\1,suppressRoles:\5\}\)/,
                    replace: (_, suppressEveryone, notificationSettings, notificationSettingsExport, channel, suppressRoles, mentionUtils, mentionUtilsExport, message, currentUser) =>
                        `let ${suppressEveryone}=${notificationSettings}.${notificationSettingsExport}.isSuppressEveryoneEnabled(${channel}.getGuildId()),${suppressRoles}=${notificationSettings}.${notificationSettingsExport}.isSuppressRolesEnabled(${channel}.getGuildId());return $self.claimNativeDesktop(${message},${channel}.id,(0,${mentionUtils}.${mentionUtilsExport})({rawMessage:${message},userId:${currentUser}.id,suppressEveryone:${suppressEveryone},suppressRoles:${suppressRoles}}))`,
                },
            ],
        },
    ],

    start() {
        window.__settingsHub?.register(createVipNotificationsSchema(settings));
        buildRuntime(readConfig().config);

        try {
            FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
            subscribed = true;
        } catch {
            subscribed = false;
        }
    },

    stop() {
        window.__settingsHub?.unregister("VipNotifications");

        if (subscribed) {
            try {
                FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
            } catch {
                // FluxDispatcher may already be unavailable during shutdown.
            }
        }

        subscribed = false;
        resetRuntime();
    },

    shouldBypassNativeGate(message: any, channelId: string, gateName: NativeDesktopGate): boolean {
        try {
            if (!isNativeDesktopGate(gateName))
                return false;

            const { config } = readConfig();
            const decision = buildDeliveryDecision(
                message,
                typeof channelId === "string" ? channelId : "",
                config,
            );
            if (!decision || !shouldBypassNativeDesktopGate(decision, gateName))
                return false;

            return true;
        } catch {
            return false;
        }
    },

    markNativeDesktopClaimed(message: any, channelId: string): void {
        markNativeDesktopClaimedForMessage(message, typeof channelId === "string" ? channelId : "");
    },

    claimNativeDesktop(message: any, channelId: string, nativeAllowed = true): boolean {
        return claimNativeDesktopForMessage(
            message,
            typeof channelId === "string" ? channelId : "",
            nativeAllowed,
        );
    },
});
