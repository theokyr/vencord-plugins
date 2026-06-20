import type { MessageContext, VipChannelType, VipMentionType } from "./types";

interface PlainMessage {
    id: string;
    channelId?: string | null;
    channel_id?: string | null;
    guildId?: string | null;
    guild_id?: string | null;
    author?: {
        id?: string | null;
        username?: string | null;
        globalName?: string | null;
        global_name?: string | null;
    } | null;
    authorId?: string | null;
    author_id?: string | null;
    authorName?: string | null;
    content?: string | null;
    mentionedUserIds?: string[] | null;
    mentionedRoleIds?: string[] | null;
    mentions?: Array<string | { id?: string | null }> | null;
    mention_roles?: string[] | null;
    mentionTypes?: VipMentionType[] | null;
    mentionEveryone?: boolean | null;
    mention_everyone?: boolean | null;
    mentionHere?: boolean | null;
    mention_here?: boolean | null;
}

interface PlainChannel {
    id?: string | null;
    guildId?: string | null;
    guild_id?: string | null;
    parentId?: string | null;
    parent_id?: string | null;
    categoryId?: string | null;
    category_id?: string | null;
    type?: VipChannelType | "private" | "group" | "guildText" | "guildVoice" | number | null;
    name?: string | null;
}

interface PlainGuild {
    id?: string | null;
    name?: string | null;
}

export interface BuildMessageContextInput {
    message: PlainMessage;
    channel?: PlainChannel | null;
    guild?: PlainGuild | null;
    currentUserId?: string | null;
    isStreamerMode?: boolean;
    isDnd?: boolean;
    isOptimistic?: boolean;
}

function stringOrEmpty(value: string | null | undefined): string {
    return typeof value === "string" ? value : "";
}

function nullableString(value: string | null | undefined): string | null {
    return typeof value === "string" && value ? value : null;
}

function uniqueStrings(values: string[] | null | undefined): string[] {
    if (!Array.isArray(values))
        return [];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (typeof value !== "string" || !value || seen.has(value))
            continue;

        seen.add(value);
        result.push(value);
    }

    return result;
}

function uniqueMentionIds(values: PlainMessage["mentions"]): string[] {
    if (!Array.isArray(values))
        return [];

    const ids = values
        .map(value => typeof value === "string" ? value : value.id)
        .filter((value): value is string => typeof value === "string");

    return uniqueStrings(ids);
}

function normalizeChannelType(type: PlainChannel["type"]): VipChannelType {
    if (type === "dm" || type === "private" || type === 1)
        return "dm";
    if (type === "groupDm" || type === "group" || type === 3)
        return "groupDm";

    return "guild";
}

function buildMentionTypes(message: PlainMessage, mentionedUserIds: string[], mentionedRoleIds: string[]): VipMentionType[] {
    const mentionTypes = new Set<VipMentionType>();
    const hasMentionEveryone = Boolean(message.mentionEveryone || message.mention_everyone);
    const content = stringOrEmpty(message.content);

    for (const mentionType of message.mentionTypes ?? [])
        mentionTypes.add(mentionType);

    if (mentionedUserIds.length)
        mentionTypes.add("user");
    if (mentionedRoleIds.length)
        mentionTypes.add("role");

    if (hasMentionEveryone && content.includes("@everyone"))
        mentionTypes.add("everyone");
    else if (hasMentionEveryone && !content.includes("@here"))
        mentionTypes.add("everyone");

    if (hasMentionEveryone && content.includes("@here"))
        mentionTypes.add("here");
    if (message.mentionHere || message.mention_here)
        mentionTypes.add("here");

    return Array.from(mentionTypes);
}

export function buildMessageContext(input: BuildMessageContextInput): MessageContext {
    const { message, channel = null, guild = null } = input;
    const channelId = stringOrEmpty(message.channelId ?? message.channel_id ?? channel?.id);
    const channelType = normalizeChannelType(channel?.type);
    const authorId = stringOrEmpty(message.authorId ?? message.author_id ?? message.author?.id);
    const authorName = stringOrEmpty(
        message.authorName
        ?? message.author?.globalName
        ?? message.author?.global_name
        ?? message.author?.username
    );
    const mentionedUserIds = uniqueStrings(message.mentionedUserIds ?? uniqueMentionIds(message.mentions));
    const mentionedRoleIds = uniqueStrings(message.mentionedRoleIds ?? message.mention_roles);
    const guildId = channelType === "guild"
        ? nullableString(message.guildId ?? message.guild_id ?? channel?.guildId ?? channel?.guild_id ?? guild?.id)
        : null;

    return {
        messageId: message.id,
        channelId,
        guildId,
        categoryId: channelType === "guild"
            ? nullableString(channel?.categoryId ?? channel?.category_id ?? channel?.parentId ?? channel?.parent_id)
            : null,
        authorId,
        isCurrentUser: Boolean(input.currentUserId && authorId === input.currentUserId),
        isOptimistic: Boolean(input.isOptimistic),
        isStreamerMode: Boolean(input.isStreamerMode),
        isDnd: Boolean(input.isDnd),
        channelType,
        mentionedUserIds,
        mentionedRoleIds,
        mentionTypes: buildMentionTypes(message, mentionedUserIds, mentionedRoleIds),
        content: stringOrEmpty(message.content),
        authorName,
        channelName: stringOrEmpty(channel?.name),
        guildName: channelType === "guild" ? nullableString(guild?.name) : null,
    };
}
