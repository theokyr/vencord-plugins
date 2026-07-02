import type { Tab } from "./types";
import { isGroupTab } from "./types";

interface DiscordChannelLike {
    guild_id?: string | null;
    recipients?: string[];
    isDM?: () => boolean;
}

type GetChannel = (channelId: string) => DiscordChannelLike | null | undefined;

function forEachChannelTab(tabs: Tab[], visit: (channelId: string) => void) {
    for (const tab of tabs) {
        if (tab.type === "channel") {
            visit(tab.channelId);
            continue;
        }

        if (!isGroupTab(tab)) continue;
        for (const child of tab.children) {
            if (child.type === "channel") visit(child.channelId);
        }
    }
}

export function tabListContainsChannel(tabs: Tab[], channelId: string | null | undefined): boolean {
    if (!channelId) return false;

    let found = false;
    forEachChannelTab(tabs, id => {
        if (id === channelId) found = true;
    });
    return found;
}

export function getDirectDmRecipientIds(tabs: Tab[], getChannel: GetChannel): Set<string> {
    const recipientIds = new Set<string>();

    forEachChannelTab(tabs, channelId => {
        const channel = getChannel(channelId);
        const recipientId = channel?.recipients?.[0];
        if (!recipientId) return;

        if (channel.isDM?.() === true || channel.guild_id == null) {
            recipientIds.add(recipientId);
        }
    });

    return recipientIds;
}

function addChannelId(ids: Set<string>, value: unknown) {
    if (typeof value === "string" && value) ids.add(value);
}

export function getPayloadChannelIds(payload: any): Set<string> {
    const ids = new Set<string>();

    addChannelId(ids, payload?.channelId);
    addChannelId(ids, payload?.channel_id);
    addChannelId(ids, payload?.message?.channelId);
    addChannelId(ids, payload?.message?.channel_id);

    if (Array.isArray(payload?.channelIds)) {
        for (const channelId of payload.channelIds) addChannelId(ids, channelId);
    }

    if (Array.isArray(payload?.voiceStates)) {
        for (const voiceState of payload.voiceStates) {
            addChannelId(ids, voiceState?.channelId);
            addChannelId(ids, voiceState?.channel_id);
        }
    }

    return ids;
}

export function channelPayloadTouchesOpenTabs(tabs: Tab[], payload: any): boolean {
    const ids = getPayloadChannelIds(payload);
    if (ids.size === 0) return true;

    for (const channelId of ids) {
        if (tabListContainsChannel(tabs, channelId)) return true;
    }
    return false;
}

export function presencePayloadTouchesOpenDmTabs(tabs: Tab[], payload: any, getChannel: GetChannel): boolean {
    if (!Array.isArray(payload?.updates)) return true;
    if (payload.updates.length === 0) return false;

    const recipients = getDirectDmRecipientIds(tabs, getChannel);
    if (recipients.size === 0) return false;

    return payload.updates.some((update: any) => {
        const userId = update?.user?.id ?? update?.userId ?? update?.id;
        return typeof userId === "string" && recipients.has(userId);
    });
}

export function voicePayloadTouchesOpenTabs(tabs: Tab[], payload: any): boolean {
    if (!Array.isArray(payload?.voiceStates)) return channelPayloadTouchesOpenTabs(tabs, payload);

    if (channelPayloadTouchesOpenTabs(tabs, payload)) return true;

    // A null channelId is how some leave events arrive; refresh conservatively so
    // call indicators do not get stuck on an open tab.
    return payload.voiceStates.some((voiceState: any) =>
        voiceState && ("channelId" in voiceState || "channel_id" in voiceState)
            && (voiceState.channelId == null && voiceState.channel_id == null)
    );
}
