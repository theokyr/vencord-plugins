export interface RelationshipChecks {
    isBlocked(userId: string): boolean;
    isIgnored(userId: string): boolean;
}

export interface BetterBlockIgnoreOptions {
    applyToIgnoredUsers: boolean;
    hideBlockedMessages: boolean;
    hideRepliesToBlockedUsers: boolean;
    hideMentionsOfBlockedUsers: boolean;
    hideReactionsFromBlockedUsers: boolean;
}

export interface UserLike {
    id?: string | null;
    user_id?: string | null;
}

export interface MessageReferenceLike {
    channel_id?: string | null;
    message_id?: string | null;
}

export interface ReferencedMessageLike {
    state?: number;
    message?: MessageLike | null;
    author?: UserLike | null;
}

export interface MessageLike {
    author?: UserLike | null;
    channel_id?: string | null;
    mentions?: Array<string | UserLike> | null;
    referenced_message?: MessageLike | null;
    referencedMessage?: ReferencedMessageLike | MessageLike | null;
    message_reference?: MessageReferenceLike | null;
    messageReference?: MessageReferenceLike | null;
}

export interface ReactionEventLike {
    user?: UserLike | null;
    userId?: string | null;
    user_id?: string | null;
}

export type ResolveMessage = (channelId: string, messageId: string) => MessageLike | undefined | null;

function getUserId(user: string | UserLike | null | undefined): string | undefined {
    if (typeof user === "string") return user;
    return user?.id ?? user?.user_id ?? undefined;
}

function getReferencedMessage(candidate: ReferencedMessageLike | MessageLike | null | undefined): MessageLike | undefined {
    if (!candidate) return undefined;
    if ("message" in candidate && candidate.message) return candidate.message;
    if ("author" in candidate && candidate.author) return candidate as MessageLike;
    return undefined;
}

function getReference(message: MessageLike): MessageReferenceLike | undefined {
    return message.messageReference ?? message.message_reference ?? undefined;
}

function resolveReferencedMessage(message: MessageLike, resolveMessage?: ResolveMessage): MessageLike | undefined {
    const reference = getReference(message);
    const channelId = reference?.channel_id ?? message.channel_id;
    const messageId = reference?.message_id;

    if (!resolveMessage || !channelId || !messageId) return undefined;
    return resolveMessage(channelId, messageId) ?? undefined;
}

export function isFilteredRelationshipUser(
    userId: string | undefined,
    relationshipChecks: RelationshipChecks,
    applyToIgnoredUsers: boolean
): boolean {
    if (!userId) return false;
    if (relationshipChecks.isBlocked(userId)) return true;
    return applyToIgnoredUsers && relationshipChecks.isIgnored(userId);
}

export function shouldHideMessageByRelationship(
    message: MessageLike | null | undefined,
    options: BetterBlockIgnoreOptions,
    relationshipChecks: RelationshipChecks,
    resolveMessage?: ResolveMessage
): boolean {
    if (!message) return false;

    if (
        options.hideBlockedMessages &&
        isFilteredRelationshipUser(getUserId(message.author), relationshipChecks, options.applyToIgnoredUsers)
    ) {
        return true;
    }

    if (options.hideRepliesToBlockedUsers) {
        const referencedMessage =
            getReferencedMessage(message.referenced_message) ??
            getReferencedMessage(message.referencedMessage) ??
            resolveReferencedMessage(message, resolveMessage);

        if (isFilteredRelationshipUser(getUserId(referencedMessage?.author), relationshipChecks, options.applyToIgnoredUsers)) {
            return true;
        }
    }

    if (options.hideMentionsOfBlockedUsers) {
        const mentions = message.mentions ?? [];
        if (mentions.some(mention => isFilteredRelationshipUser(getUserId(mention), relationshipChecks, options.applyToIgnoredUsers))) {
            return true;
        }
    }

    return false;
}

export function shouldHideReactionByRelationship(
    event: ReactionEventLike | null | undefined,
    options: BetterBlockIgnoreOptions,
    relationshipChecks: RelationshipChecks
): boolean {
    if (!event || !options.hideReactionsFromBlockedUsers) return false;
    return isFilteredRelationshipUser(
        event.userId ?? event.user_id ?? getUserId(event.user),
        relationshipChecks,
        options.applyToIgnoredUsers
    );
}
