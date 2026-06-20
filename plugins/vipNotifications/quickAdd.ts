import type { VipConfig, VipRule } from "./types";

export type QuickAddTarget =
    | { type: "user"; userId: string; label?: string; }
    | { type: "dm"; channelId: string; label?: string; }
    | { type: "groupDm"; channelId: string; label?: string; }
    | { type: "guildChannel"; channelId: string; label?: string; }
    | { type: "category"; categoryId: string; label?: string; }
    | { type: "guild"; guildId: string; label?: string; };

export type QuickAddIdGenerator = () => string;

function defaultIdGenerator(): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid)
        return `quick-add-${uuid}`;

    return `quick-add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function labelOrId(label: string | undefined, id: string): string {
    const trimmed = label?.trim();
    return trimmed || id;
}

export function createQuickAddRule(
    target: QuickAddTarget,
    defaultProfileId: string,
    idGenerator: QuickAddIdGenerator = defaultIdGenerator,
): VipRule {
    switch (target.type) {
        case "user":
            return {
                id: idGenerator(),
                name: `VIP User: ${labelOrId(target.label, target.userId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { authorUserIds: [target.userId] },
            };
        case "dm":
            return {
                id: idGenerator(),
                name: `VIP DM: ${labelOrId(target.label, target.channelId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { dmChannelIds: [target.channelId] },
            };
        case "groupDm":
            return {
                id: idGenerator(),
                name: `VIP Group DM: ${labelOrId(target.label, target.channelId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { groupDmChannelIds: [target.channelId] },
            };
        case "guildChannel":
            return {
                id: idGenerator(),
                name: `VIP Channel: ${labelOrId(target.label, target.channelId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { guildChannelIds: [target.channelId] },
            };
        case "category":
            return {
                id: idGenerator(),
                name: `VIP Category: ${labelOrId(target.label, target.categoryId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { categoryIds: [target.categoryId] },
            };
        case "guild":
            return {
                id: idGenerator(),
                name: `VIP Server: ${labelOrId(target.label, target.guildId)}`,
                enabled: true,
                profileId: defaultProfileId,
                conditions: { guildIds: [target.guildId] },
            };
    }
}

export function insertQuickAddRule(config: VipConfig, rule: VipRule): VipConfig {
    return {
        ...config,
        rules: config.quickAddPlacement === "bottom"
            ? [...config.rules, rule]
            : [rule, ...config.rules],
    };
}
