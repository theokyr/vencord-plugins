/*
 * Vencord userplugin — minimalCallBar
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";

/** The subset of a Discord voice state the bar actually renders. */
export interface CallVoiceState {
    userId: string;
    selfMute: boolean;
    selfDeaf: boolean;
    mute: boolean;
    deaf: boolean;
    selfVideo: boolean;
    selfStream: boolean;
}

/**
 * Discord's own sorted view of a channel's voice states — the exact source the native
 * voice channel member list renders from. Entries carry a precomputed `comparator` key
 * built from the member's display name, so ordering matches the client for nicknames,
 * emoji and other non-ASCII names without us reimplementing the collation.
 *
 * Guild channels live under their guild id; DM/group calls live under a "@me" bucket,
 * which is what passing `undefined` as the guild id selects.
 */
const SortedVoiceStateStore = findStoreLazy("SortedVoiceStateStore") as {
    getVoiceStatesForChannelAlt: (channelId: string, guildId?: string | null) => Array<{ voiceState: CallVoiceState; }>;
} | undefined;

/** Unsorted fallback, used when the sorted store has nothing for the channel. */
const VoiceStateStore = findStoreLazy("VoiceStateStore") as {
    getVoiceStatesForChannel: (channelId: string) => Record<string, CallVoiceState>;
} | undefined;

const ChannelStore = findStoreLazy("ChannelStore") as {
    getChannel: (channelId: string) => { getGuildId?: () => string | null; guild_id?: string | null; } | null;
} | undefined;

/**
 * Pick between the sorted and unsorted sources.
 *
 * The sorted store is authoritative whenever it has entries. An empty result is not
 * proof the channel is empty — it also happens if the sorted store is unavailable or
 * has not indexed this channel yet — so fall back rather than render an empty stack.
 *
 * Pure and exported for tests.
 */
export function pickVoiceStates(
    sorted: Array<{ voiceState: CallVoiceState; }> | null | undefined,
    raw: Record<string, CallVoiceState> | null | undefined
): CallVoiceState[] {
    if (Array.isArray(sorted) && sorted.length > 0) {
        return sorted.map(entry => entry.voiceState).filter(Boolean);
    }
    return Object.values(raw ?? {});
}

/**
 * Voice states for a call, ordered the way Discord orders the native member list.
 *
 * The guild id is resolved from the channel when the caller does not already know it;
 * DM and group calls resolve to `undefined`, which is the "@me" bucket.
 */
export function getSortedVoiceStates(channelId: string, guildId?: string | null): CallVoiceState[] {
    let resolvedGuildId = guildId ?? undefined;
    if (resolvedGuildId == null) {
        try {
            const channel = ChannelStore?.getChannel?.(channelId);
            resolvedGuildId = (channel?.getGuildId?.() ?? channel?.guild_id) ?? undefined;
        } catch { /* store not ready */ }
    }

    let sorted: Array<{ voiceState: CallVoiceState; }> | undefined;
    try {
        sorted = SortedVoiceStateStore?.getVoiceStatesForChannelAlt?.(channelId, resolvedGuildId);
    } catch { /* store not ready */ }

    let raw: Record<string, CallVoiceState> | undefined;
    try {
        raw = VoiceStateStore?.getVoiceStatesForChannel?.(channelId);
    } catch { /* store not ready */ }

    return pickVoiceStates(sorted, raw);
}
