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
            replacement: [
                {
                    match: /\|\|y\.NO\.getSetting\(\)(?=\|\|!i\.ignoreNoMessagesSetting&&M\.Ay\.allowNoMessages\(n\))/,
                    replace: "||!i.ignoreStreamerMode&&y.NO.getSetting()",
                },
                {
                    match: /!K\(l,u,o,\{ignoreStatus:s,ignoreSameUser:H\.MRS\.SELF_MENTIONABLE_SYSTEM\.has\(e\.type\)\}\)/,
                    replace: "!K(l,u,o,{ignoreStatus:s||w.A.getStatus()===H.clD.DND&&$self.shouldBypassNativeGate(e,t,\"status\"),ignoreStreamerMode:y.NO.getSetting()&&$self.shouldBypassNativeGate(e,t,\"streamerMode\"),ignoreNoMessagesSetting:M.Ay.allowNoMessages(o)&&$self.shouldBypassNativeGate(e,t,\"noMessages\"),ignoreSameUser:H.MRS.SELF_MENTIONABLE_SYSTEM.has(e.type)})",
                },
                {
                    match: /!r&&d\(o\.id\)/,
                    replace: "!r&&d(o.id)&&!$self.shouldBypassNativeGate(e,t,\"selectedChannel\")",
                },
                {
                    match: /if\(T\.A\.isMuted\(o\.id\)\)return!1;/,
                    replace: "if(T.A.isMuted(o.id)&&!$self.shouldBypassNativeGate(e,t,\"muted\"))return!1;",
                },
                {
                    match: /return t!==Y\.CP\.NO_MESSAGES&&\(t===Y\.CP\.ALL_MESSAGES\|\|\(0,A\.bG\)\(\{rawMessage:e,userId:l\.id,suppressEveryone:!1,suppressRoles:!1\}\)\)/,
                    replace: "return $self.claimNativeDesktop(e,o.id,t!==Y.CP.NO_MESSAGES&&(t===Y.CP.ALL_MESSAGES||(0,A.bG)({rawMessage:e,userId:l.id,suppressEveryone:!1,suppressRoles:!1})))",
                },
                {
                    match: /if\(M\.Ay\.allowAllMessages\(o\)&&t\)return!0;/,
                    replace: "if(M.Ay.allowAllMessages(o)&&t)return $self.claimNativeDesktop(e,o.id,!0);",
                },
                {
                    match: /return\(0,A\.bG\)\(\{rawMessage:e,userId:l\.id,suppressEveryone:n,suppressRoles:i\}\)/,
                    replace: "return $self.claimNativeDesktop(e,o.id,(0,A.bG)({rawMessage:e,userId:l.id,suppressEveryone:n,suppressRoles:i}))",
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
