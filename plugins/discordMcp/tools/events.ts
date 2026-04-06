/*
 * Event subscription handlers — FluxDispatcher-based real-time event forwarding.
 */

import {
    FluxDispatcher,
} from "@webpack/common";
import { send, activeSubscriptions, logger } from "../shared";

// Map Discord FluxDispatcher event types to our subscription event names
const FLUX_EVENT_MAP: Record<string, string> = {
    MESSAGE_CREATE: "message_create",
    MESSAGE_UPDATE: "message_update",
    MESSAGE_DELETE: "message_delete",
    TYPING_START: "typing_start",
    PRESENCE_UPDATES: "presence_update",
    VOICE_STATE_UPDATES: "voice_state_update",
    GUILD_MEMBER_UPDATE: "guild_member_update",
};

const REVERSE_FLUX_MAP: Record<string, string> = {};
for (const [flux, sub] of Object.entries(FLUX_EVENT_MAP)) {
    REVERSE_FLUX_MAP[sub] = flux;
}

function matchesFilters(filters: Record<string, unknown> | undefined, data: any): boolean {
    if (!filters) return true;
    if (filters.guildId && data.guildId !== filters.guildId && data.guild_id !== filters.guildId) return false;
    if (filters.channelId && data.channelId !== filters.channelId && data.channel_id !== filters.channelId) return false;
    if (filters.userId) {
        const authorId = data.author?.id ?? data.userId ?? data.user_id ?? data.user?.id;
        if (authorId !== filters.userId) return false;
    }
    return true;
}

function serializeEventData(fluxEvent: string, data: any): unknown {
    switch (fluxEvent) {
        case "MESSAGE_CREATE":
        case "MESSAGE_UPDATE":
            return {
                id: data.message?.id ?? data.id,
                channelId: data.channelId ?? data.channel_id,
                content: data.message?.content ?? data.content,
                author: data.message?.author ? {
                    id: data.message.author.id,
                    username: data.message.author.username,
                } : undefined,
            };
        case "MESSAGE_DELETE":
            return {
                id: data.id,
                channelId: data.channelId ?? data.channel_id,
            };
        case "TYPING_START":
            return {
                channelId: data.channelId,
                userId: data.userId,
            };
        case "PRESENCE_UPDATES":
            return {
                updates: data.updates?.map((u: any) => ({
                    userId: u.user?.id,
                    status: u.status,
                })) ?? [],
            };
        case "VOICE_STATE_UPDATES":
            return {
                updates: data.voiceStates?.map((v: any) => ({
                    userId: v.userId,
                    channelId: v.channelId,
                    guildId: v.guildId,
                })) ?? [],
            };
        case "GUILD_MEMBER_UPDATE":
            return {
                guildId: data.guildId,
                userId: data.user?.id,
                nick: data.nick,
                roles: data.roles,
            };
        default:
            return data;
    }
}

/** Called from index.tsx handleSubscribe to wire up real FluxDispatcher listeners */
export function setupSubscription(subId: string, events: string[], filters?: Record<string, unknown>) {
    const sub = activeSubscriptions.get(subId);
    if (!sub) return;

    for (const eventName of events) {
        const fluxEvent = REVERSE_FLUX_MAP[eventName];
        if (!fluxEvent) {
            logger.warn(`Unknown event type: ${eventName}`);
            continue;
        }

        const handler = (data: any) => {
            if (!matchesFilters(filters, data)) return;

            send({
                type: "event",
                subscription: subId,
                event: eventName,
                data: serializeEventData(fluxEvent, data),
            });
        };

        FluxDispatcher.subscribe(fluxEvent, handler);
        sub.cleanups.push(() => FluxDispatcher.unsubscribe(fluxEvent, handler));
    }
}
