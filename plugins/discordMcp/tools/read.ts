/*
 * Read tool handlers — non-destructive Discord data queries.
 */

import { findStoreLazy } from "@webpack";
import {
    ChannelStore,
    GuildStore,
    MessageStore,
    UserStore,
} from "@webpack/common";
import { registerTool } from "../shared";
import { TOOL_NAMES } from "../../../proxy/src/protocol";

const ChannelListStore = findStoreLazy("ChannelListStore") as {
    getGuild: (guildId: string) => {
        guildChannels: {
            getSortedNamedCategories: () => {
                id: string;
                record: { name: string };
                isCollapsed: boolean;
                isMuted: boolean;
                shownChannelIds: string[];
            }[];
            favoritesCategory: { isCollapsed: boolean; shownChannelIds: string[] };
            noParentCategory: { shownChannelIds: string[] };
        };
    } | undefined;
};

registerTool(TOOL_NAMES.listGuilds, async () => {
    const guilds = Object.values(GuildStore.getGuilds());
    return guilds.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
    }));
});

registerTool(TOOL_NAMES.listChannels, async (params) => {
    const guildId = params.guildId as string;
    const guild = ChannelListStore.getGuild(guildId);
    if (!guild) return { error: "Guild not found or not loaded" };

    const categories = guild.guildChannels.getSortedNamedCategories();
    const result: { categoryName: string; categoryId: string; channels: { id: string; name: string; type: number }[] }[] = [];

    const favIds = guild.guildChannels.favoritesCategory.shownChannelIds;
    if (favIds.length > 0) {
        result.push({
            categoryName: "Favorites",
            categoryId: "favorites",
            channels: favIds.map(id => {
                const ch = ChannelStore.getChannel(id);
                return { id, name: ch?.name ?? "unknown", type: ch?.type ?? 0 };
            }),
        });
    }

    const noParentIds = guild.guildChannels.noParentCategory.shownChannelIds;
    if (noParentIds.length > 0) {
        result.push({
            categoryName: "No Category",
            categoryId: "none",
            channels: noParentIds.map(id => {
                const ch = ChannelStore.getChannel(id);
                return { id, name: ch?.name ?? "unknown", type: ch?.type ?? 0 };
            }),
        });
    }

    for (const cat of categories) {
        result.push({
            categoryName: cat.record.name,
            categoryId: cat.id,
            channels: cat.shownChannelIds.map(id => {
                const ch = ChannelStore.getChannel(id);
                return { id, name: ch?.name ?? "unknown", type: ch?.type ?? 0 };
            }),
        });
    }

    return result;
});

registerTool(TOOL_NAMES.readMessages, async (params) => {
    const channelId = params.channelId as string;
    const count = Math.min((params.count as number) || 50, 100);

    const msgs = MessageStore.getMessages(channelId);
    if (!msgs) return { error: "No messages loaded for this channel" };

    let items = msgs.toArray();

    if (params.before) {
        const idx = items.findIndex((m: any) => m.id === params.before);
        if (idx >= 0) items = items.slice(0, idx);
    }
    if (params.after) {
        const idx = items.findIndex((m: any) => m.id === params.after);
        if (idx >= 0) items = items.slice(idx + 1);
    }

    return items.slice(-count).map((m: any) => ({
        id: m.id,
        content: m.content,
        author: { id: m.author.id, username: m.author.username, globalName: m.author.globalName },
        timestamp: m.timestamp?.toISOString?.() ?? m.timestamp,
        attachments: m.attachments?.map((a: any) => ({ id: a.id, filename: a.filename, url: a.url })) ?? [],
        embeds: m.embeds?.length ?? 0,
    }));
});

registerTool(TOOL_NAMES.getUser, async (params) => {
    const userId = params.userId as string | undefined;
    const user = userId ? UserStore.getUser(userId) : UserStore.getCurrentUser();
    if (!user) return { error: "User not found" };
    return {
        id: user.id,
        username: user.username,
        globalName: user.globalName,
        avatar: user.avatar,
        discriminator: user.discriminator,
        bot: user.bot,
    };
});

registerTool(TOOL_NAMES.getGuild, async (params) => {
    const guild = GuildStore.getGuild(params.guildId as string);
    if (!guild) return { error: "Guild not found" };
    return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
        memberCount: guild.memberCount,
        description: guild.description,
        features: guild.features,
    };
});

registerTool(TOOL_NAMES.getChannel, async (params) => {
    const ch = ChannelStore.getChannel(params.channelId as string);
    if (!ch) return { error: "Channel not found" };
    return {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        guildId: ch.guild_id,
        parentId: ch.parent_id,
        topic: ch.topic,
        nsfw: ch.nsfw,
        position: ch.position,
    };
});

registerTool(TOOL_NAMES.getPinnedMessages, async (params) => {
    const channelId = params.channelId as string;
    const msgs = MessageStore.getMessages(channelId);
    if (!msgs) return { error: "Channel messages not loaded" };

    const pinned = msgs.toArray().filter((m: any) => m.pinned);
    return pinned.map((m: any) => ({
        id: m.id,
        content: m.content,
        author: { id: m.author.id, username: m.author.username },
        timestamp: m.timestamp?.toISOString?.() ?? m.timestamp,
    }));
});

registerTool(TOOL_NAMES.getThread, async (params) => {
    const threadId = params.threadId as string;
    const ch = ChannelStore.getChannel(threadId);
    if (!ch) return { error: "Thread not found" };

    const msgs = MessageStore.getMessages(threadId);
    const items = msgs?.toArray() ?? [];

    return {
        thread: { id: ch.id, name: ch.name, parentId: ch.parent_id, type: ch.type },
        messages: items.slice(-50).map((m: any) => ({
            id: m.id,
            content: m.content,
            author: { id: m.author.id, username: m.author.username },
            timestamp: m.timestamp?.toISOString?.() ?? m.timestamp,
        })),
    };
});
