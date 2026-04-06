/*
 * State tool handlers — current Discord UI/presence state.
 */

import { findStoreLazy } from "@webpack";
import {
    ChannelStore,
    GuildStore,
    PresenceStore,
    ReadStateStore,
    SelectedChannelStore,
    SelectedGuildStore,
    UserStore,
} from "@webpack/common";
import { registerTool } from "../shared";
import { TOOL_NAMES } from "../../../proxy/src/protocol";

const GuildMemberStore = findStoreLazy("GuildMemberStore") as {
    getMembers: (guildId: string) => { userId: string }[];
};

registerTool(TOOL_NAMES.getPresence, async (params) => {
    const userId = (params.userId as string) || UserStore.getCurrentUser()?.id;
    if (!userId) return { error: "No user ID" };

    const presence = PresenceStore.getState()?.presences?.[userId];
    if (!presence) return { status: "offline", activities: [] };

    return {
        status: presence.status,
        clientStatus: presence.clientStatus,
        activities: presence.activities?.map((a: any) => ({
            name: a.name,
            type: a.type,
            state: a.state,
            details: a.details,
        })) ?? [],
    };
});

registerTool(TOOL_NAMES.getUnread, async (params) => {
    const guildId = params.guildId as string | undefined;
    const guilds = guildId ? [GuildStore.getGuild(guildId)] : Object.values(GuildStore.getGuilds());

    const result: { guildId: string; guildName: string; channels: { id: string; name: string; unreadCount: number; mentionCount: number }[] }[] = [];

    for (const guild of guilds) {
        if (!guild) continue;
        const channels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guild.id));
        const unreadChannels: { id: string; name: string; unreadCount: number; mentionCount: number }[] = [];

        for (const ch of channels) {
            if (!ch) continue;
            const hasUnread = ReadStateStore.hasUnread(ch.id);
            const mentionCount = ReadStateStore.getMentionCount(ch.id);
            if (hasUnread || mentionCount > 0) {
                unreadChannels.push({
                    id: ch.id,
                    name: ch.name,
                    unreadCount: hasUnread ? 1 : 0,
                    mentionCount,
                });
            }
        }

        if (unreadChannels.length > 0) {
            result.push({ guildId: guild.id, guildName: guild.name, channels: unreadChannels });
        }
    }

    return result;
});

registerTool(TOOL_NAMES.getSelected, async () => {
    const guildId = SelectedGuildStore.getGuildId();
    const channelId = SelectedChannelStore.getChannelId();
    const channel = channelId ? ChannelStore.getChannel(channelId) : null;
    const guild = guildId ? GuildStore.getGuild(guildId) : null;

    return {
        guildId,
        guildName: guild?.name ?? null,
        channelId,
        channelName: channel?.name ?? null,
    };
});

registerTool(TOOL_NAMES.listOnline, async (params) => {
    const guildId = params.guildId as string;

    const members = GuildMemberStore.getMembers(guildId) ?? [];

    const online = members
        .filter((m: any) => {
            const presence = PresenceStore.getState()?.presences?.[m.userId ?? m.id];
            return presence && presence.status !== "offline";
        })
        .slice(0, 100)
        .map((m: any) => {
            const userId = m.userId ?? m.id;
            const user = UserStore.getUser(userId);
            const presence = PresenceStore.getState()?.presences?.[userId];
            return {
                id: userId,
                username: user?.username ?? "unknown",
                globalName: user?.globalName ?? null,
                status: presence?.status ?? "unknown",
            };
        });

    return { guildId, count: online.length, members: online };
});
