import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Menu } from "@webpack/common";

import { createQuickAddRule, insertQuickAddRule, type QuickAddTarget } from "./quickAdd";
import { updateConfig } from "./settings";

interface ContextUser {
    id?: string;
    username?: string;
    globalName?: string;
    global_name?: string;
    displayName?: string;
    tag?: string;
}

interface ContextChannel {
    id?: string;
    type?: string | number;
    name?: string;
    isDM?: () => boolean;
    isGroupDM?: () => boolean;
    isCategory?: () => boolean;
}

interface ContextGuild {
    id?: string;
    name?: string;
}

interface UserContextProps {
    user?: ContextUser;
    channel?: ContextChannel;
    guildId?: string;
}

interface ChannelContextProps {
    channel?: ContextChannel;
}

interface GuildContextProps {
    guild?: ContextGuild;
}

const DM_TYPE = 1;
const GROUP_DM_TYPE = 3;
const CATEGORY_TYPE = 4;

function safeCallBoolean(fn: (() => boolean) | undefined): boolean {
    try {
        return fn?.() === true;
    } catch {
        return false;
    }
}

function isDmChannel(channel: ContextChannel | undefined): boolean {
    return safeCallBoolean(channel?.isDM)
        || channel?.type === DM_TYPE
        || channel?.type === "dm"
        || channel?.type === "private";
}

function isGroupDmChannel(channel: ContextChannel | undefined): boolean {
    return safeCallBoolean(channel?.isGroupDM)
        || channel?.type === GROUP_DM_TYPE
        || channel?.type === "groupDm"
        || channel?.type === "group";
}

function isCategoryChannel(channel: ContextChannel | undefined): boolean {
    return safeCallBoolean(channel?.isCategory)
        || channel?.type === CATEGORY_TYPE
        || channel?.type === "category"
        || channel?.type === "GUILD_CATEGORY";
}

function userLabel(user: ContextUser | undefined): string | undefined {
    return user?.globalName
        ?? user?.global_name
        ?? user?.displayName
        ?? user?.username
        ?? user?.tag;
}

function channelLabel(channel: ContextChannel | undefined, prefixHash = false): string | undefined {
    if (!channel?.name)
        return undefined;

    return prefixHash ? `#${channel.name}` : channel.name;
}

function addTarget(target: QuickAddTarget) {
    try {
        updateConfig(config => insertQuickAddRule(
            config,
            createQuickAddRule(target, config.defaultProfileId),
        ));
    } catch {
        // Native Discord menu handlers must never bubble plugin failures.
    }
}

function insertQuickAddItem(children: Parameters<NavContextMenuPatchCallback>[0], target: QuickAddTarget) {
    children.splice(-1, 0, (
        <Menu.MenuGroup key={`vc-vipNotifications-quickAdd-${target.type}`}>
            <Menu.MenuItem
                id={`vc-vipNotifications-add-${target.type}`}
                label="Add to VIP Notifications"
                action={() => addTarget(target)}
            />
        </Menu.MenuGroup>
    ));
}

const UserContext: NavContextMenuPatchCallback = (children, props: UserContextProps) => {
    try {
        const { channel, user, guildId } = props;

        // Discord uses user-context for direct DM rows; there, the channel is the actionable VIP target.
        const target: QuickAddTarget | null = channel?.id && isDmChannel(channel) && !guildId
            ? { type: "dm", channelId: channel.id, label: userLabel(user) ?? channelLabel(channel) }
            : user?.id
                ? { type: "user", userId: user.id, label: userLabel(user) }
                : null;

        if (target)
            insertQuickAddItem(children, target);
    } catch {
        // Context menu prop shapes can vary by Discord surface.
    }
};

const ChannelContext: NavContextMenuPatchCallback = (children, props: ChannelContextProps) => {
    try {
        const channel = props.channel;
        if (!channel?.id)
            return;

        const target: QuickAddTarget = isCategoryChannel(channel)
            ? { type: "category", categoryId: channel.id, label: channelLabel(channel) }
            : isGroupDmChannel(channel)
                ? { type: "groupDm", channelId: channel.id, label: channelLabel(channel) }
                : isDmChannel(channel)
                    ? { type: "dm", channelId: channel.id, label: channelLabel(channel) }
                    : { type: "guildChannel", channelId: channel.id, label: channelLabel(channel, true) };

        insertQuickAddItem(children, target);
    } catch {
        // Context menu prop shapes can vary by Discord surface.
    }
};

const GroupDmContext: NavContextMenuPatchCallback = (children, props: ChannelContextProps) => {
    try {
        const channel = props.channel;
        if (!channel?.id)
            return;

        insertQuickAddItem(children, {
            type: "groupDm",
            channelId: channel.id,
            label: channelLabel(channel),
        });
    } catch {
        // Context menu prop shapes can vary by Discord surface.
    }
};

const GuildContext: NavContextMenuPatchCallback = (children, props: GuildContextProps) => {
    try {
        const guild = props.guild;
        if (!guild?.id)
            return;

        insertQuickAddItem(children, {
            type: "guild",
            guildId: guild.id,
            label: guild.name,
        });
    } catch {
        // Context menu prop shapes can vary by Discord surface.
    }
};

export const contextMenus = {
    "user-context": UserContext,
    "channel-context": ChannelContext,
    "gdm-context": GroupDmContext,
    "guild-context": GuildContext,
};
