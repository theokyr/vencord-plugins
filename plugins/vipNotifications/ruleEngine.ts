import type { MessageContext, VipRule, VipRuleConditions } from "./types";

export interface VipMatch {
    rule: VipRule;
}

const ARRAY_CONDITION_KEYS = [
    "authorUserIds",
    "dmChannelIds",
    "groupDmChannelIds",
    "guildChannelIds",
    "categoryIds",
    "guildIds",
    "mentionedRoleIds",
    "mentionTypes",
    "keywords",
] as const;

type ArrayConditionKey = typeof ARRAY_CONDITION_KEYS[number];

function populated(values: string[] | undefined): string[] {
    return values?.filter(value => typeof value === "string" && value.length > 0) ?? [];
}

function hasIntersection(left: string[], right: string[]): boolean {
    const rightSet = new Set(right);
    return left.some(value => rightSet.has(value));
}

function hasPopulatedConditionGroup(conditions: VipRuleConditions): boolean {
    return ARRAY_CONDITION_KEYS.some(key => populated(conditions[key] as string[] | undefined).length > 0);
}

function keywordMatches(ctx: MessageContext, conditions: VipRuleConditions): boolean {
    const keywords = populated(conditions.keywords);
    if (!keywords.length)
        return true;

    const content = conditions.keywordCaseSensitive ? ctx.content : ctx.content.toLowerCase();
    const normalizedKeywords = conditions.keywordCaseSensitive
        ? keywords
        : keywords.map(keyword => keyword.toLowerCase());

    if (conditions.keywordMode === "all")
        return normalizedKeywords.every(keyword => content.includes(keyword));

    return normalizedKeywords.some(keyword => content.includes(keyword));
}

function conditionGroupMatches(ctx: MessageContext, key: ArrayConditionKey, conditions: VipRuleConditions): boolean {
    const values = populated(conditions[key] as string[] | undefined);
    if (!values.length)
        return true;

    switch (key) {
        case "authorUserIds":
            return values.includes(ctx.authorId);
        case "dmChannelIds":
            return ctx.channelType === "dm" && values.includes(ctx.channelId);
        case "groupDmChannelIds":
            return ctx.channelType === "groupDm" && values.includes(ctx.channelId);
        case "guildChannelIds":
            return ctx.channelType === "guild" && values.includes(ctx.channelId);
        case "categoryIds":
            return ctx.categoryId !== null && values.includes(ctx.categoryId);
        case "guildIds":
            return ctx.guildId !== null && values.includes(ctx.guildId);
        case "mentionedRoleIds":
            return hasIntersection(values, ctx.mentionedRoleIds);
        case "mentionTypes":
            return hasIntersection(values, ctx.mentionTypes);
        case "keywords":
            return keywordMatches(ctx, conditions);
    }
}

export function isRuleValid(rule: VipRule): boolean {
    return rule.enabled && hasPopulatedConditionGroup(rule.conditions);
}

export function matchesRule(ctx: MessageContext, rule: VipRule): boolean {
    if (ctx.isCurrentUser || ctx.isOptimistic || !isRuleValid(rule))
        return false;

    return ARRAY_CONDITION_KEYS.every(key => conditionGroupMatches(ctx, key, rule.conditions));
}

export function findFirstMatch(ctx: MessageContext, rules: VipRule[]): VipMatch | null {
    for (const rule of rules) {
        if (matchesRule(ctx, rule))
            return { rule };
    }

    return null;
}
