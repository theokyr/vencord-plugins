/*
 * Vencord userplugin
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tab metadata resolution — extracted to break circular dependency between
 * tabBar.tsx and groupChip.tsx / groupDropdown.tsx.
 */

import { findStoreLazy, findByPropsLazy } from "@webpack";
import type { Tab } from "./types";

const ChannelStore = findStoreLazy("ChannelStore") as {
    getChannel: (channelId: string) => any;
};

const GuildStore = findStoreLazy("GuildStore") as {
    getGuild: (guildId: string) => any;
};

const UserStore = findStoreLazy("UserStore") as {
    getUser: (userId: string) => any;
};

// ─── Route tab icons (data URIs) ─────────────────────────────────────────

function svgDataUri(svg: string): string {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ROUTE_ICONS: Record<string, string> = {
    "/channels/@me": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-2-4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z"/><path d="M3 18a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v2a1 1 0 1 1-2 0v-2a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v2a1 1 0 1 1-2 0v-2Z"/></svg>'),
    "/message-requests": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/></svg>'),
    "/store": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M2.01 8.5 2 22h20V8.5l-4-6H6l-3.99 6ZM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm-4.47-7h8.94l2.67 4H4.86l2.67-4Z"/></svg>'),
    "/shop": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2Zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2Zm6 16H6V8h2v2a1 1 0 1 0 2 0V8h4v2a1 1 0 1 0 2 0V8h2v12Z"/></svg>'),
    "/quest-home": svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8Zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1Z"/></svg>'),
};

const DISCORD_FALLBACK_ICON = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19.73 4.87a18.2 18.2 0 0 0-4.6-1.44c-.21.4-.4.8-.58 1.21-1.69-.26-3.4-.26-5.1 0-.18-.41-.37-.82-.59-1.2a18.2 18.2 0 0 0-4.6 1.43A19.04 19.04 0 0 0 .96 18.6a18.56 18.56 0 0 0 5.63 2.87c.46-.62.86-1.28 1.2-1.98-.65-.25-1.29-.55-1.9-.92.16-.12.32-.24.47-.37a13.18 13.18 0 0 0 11.28 0c.15.13.31.26.47.37-.6.36-1.25.67-1.9.92.35.7.75 1.35 1.2 1.98 1.94-.57 3.86-1.5 5.63-2.87A19.04 19.04 0 0 0 19.73 4.87ZM8.3 15.63c-1.18 0-2.16-1.08-2.16-2.42 0-1.34.95-2.42 2.15-2.42 1.2 0 2.17 1.08 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.4 0c-1.19 0-2.16-1.08-2.16-2.42 0-1.34.96-2.42 2.16-2.42s2.16 1.08 2.15 2.42c0 1.34-.95 2.42-2.15 2.42Z"/></svg>');

// ─── Stores ──────────────────────────────────────────────────────────────

const RelationshipStore = findStoreLazy("RelationshipStore") as {
    getNickname: (userId: string) => string | undefined;
    isFriend: (userId: string) => boolean;
};

// ─── Tab metadata ────────────────────────────────────────────────────────

export interface TabMeta {
    icon: string | null;
    name: string;
    isDm: boolean;
    dmUserId: string | null;
}

function isGroupDmChannel(channel: any): boolean {
    return channel?.isGroupDM?.() === true || channel?.type === 3;
}

function getGroupDmIconUrl(channel: any): string | null {
    if (!channel?.id || !channel?.icon) return null;
    return `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png?size=32`;
}

function getRawRecipientDisplayName(recipient: any): string | null {
    return recipient?.display_name ?? recipient?.displayName ?? recipient?.globalName ?? recipient?.username ?? null;
}

function getRecipientDisplayName(channel: any, recipientId: string): string | null {
    const rawRecipient = channel.rawRecipients?.find?.((recipient: any) => recipient?.id === recipientId);
    const user = UserStore.getUser(recipientId);
    return channel.nicks?.[recipientId]
        ?? getRawRecipientDisplayName(rawRecipient)
        ?? user?.globalName
        ?? user?.username
        ?? null;
}

function getGroupDmName(channel: any): string {
    if (typeof channel.name === "string" && channel.name.trim()) return channel.name;

    const recipientIds = Array.isArray(channel.recipients)
        ? channel.recipients
        : Array.isArray(channel.rawRecipients)
            ? channel.rawRecipients.map((recipient: any) => recipient?.id).filter(Boolean)
            : [];

    const recipientNames = recipientIds
        .map((recipientId: string) => getRecipientDisplayName(channel, recipientId))
        .filter((name: string | null): name is string => Boolean(name));

    return recipientNames.join(", ") || "Unknown";
}

export function getTabMeta(tab: Tab, showIcon: boolean): TabMeta {
    if (tab.type === "route") {
        return { icon: showIcon ? (ROUTE_ICONS[tab.path] ?? DISCORD_FALLBACK_ICON) : null, name: tab.label, isDm: false, dmUserId: null };
    }

    if (tab.type === "group") {
        return { icon: null, name: tab.name, isDm: false, dmUserId: null };
    }

    const channel = ChannelStore.getChannel(tab.channelId);
    if (!channel) return { icon: null, name: "Unknown", isDm: false, dmUserId: null };

    if (isGroupDmChannel(channel)) {
        return {
            icon: showIcon ? getGroupDmIconUrl(channel) : null,
            name: getGroupDmName(channel),
            isDm: false,
            dmUserId: null,
        };
    }

    if (!tab.guildId || channel.isDM?.()) {
        const recipientId = channel.recipients?.[0] ?? null;
        const user = recipientId ? UserStore.getUser(recipientId) : null;
        const friendNick = recipientId ? RelationshipStore?.getNickname?.(recipientId) : undefined;
        return {
            icon: showIcon ? (user?.getAvatarURL(undefined, 32) ?? null) : null,
            name: friendNick ?? user?.globalName ?? user?.username ?? "DM",
            isDm: true,
            dmUserId: recipientId,
        };
    }

    const guild = showIcon ? GuildStore.getGuild(tab.guildId) : null;
    const guildIcon = guild?.icon
        ? `https://cdn.discordapp.com/icons/${tab.guildId}/${guild.icon}.webp?size=32`
        : null;
    return { icon: guildIcon, name: `#${channel.name ?? "unknown"}`, isDm: false, dmUserId: null };
}
