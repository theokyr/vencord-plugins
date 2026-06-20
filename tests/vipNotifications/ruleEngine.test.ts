import { describe, expect, it } from "vitest";
import { buildMessageContext } from "../../plugins/vipNotifications/messageContext";
import { findFirstMatch, isRuleValid, matchesRule } from "../../plugins/vipNotifications/ruleEngine";
import type { MessageContext, VipRule } from "../../plugins/vipNotifications/types";

const ctx: MessageContext = {
    messageId: "m1",
    channelId: "c1",
    guildId: "g1",
    categoryId: "cat1",
    authorId: "u1",
    isCurrentUser: false,
    isOptimistic: false,
    isStreamerMode: false,
    isDnd: false,
    channelType: "guild",
    mentionedUserIds: ["me"],
    mentionedRoleIds: ["role1"],
    mentionTypes: ["user", "role"],
    content: "urgent deploy is broken",
    authorName: "Ada",
    channelName: "alerts",
    guildName: "Ops",
};

function rule(id: string, conditions: VipRule["conditions"], profileId = "default"): VipRule {
    return { id, name: id, enabled: true, profileId, conditions };
}

describe("vipNotifications/ruleEngine", () => {
    it("uses first enabled matching rule", () => {
        const rules = [
            rule("first", { guildIds: ["g1"] }),
            rule("second", { authorUserIds: ["u1"] }),
        ];

        expect(findFirstMatch(ctx, rules)?.rule.id).toBe("first");
    });

    it("uses OR within a condition group and AND across groups", () => {
        expect(findFirstMatch(ctx, [rule("match", {
            authorUserIds: ["u2", "u1"],
            guildIds: ["g1"],
            keywords: ["missing", "urgent"],
        })])?.rule.id).toBe("match");
        expect(findFirstMatch(ctx, [rule("miss", {
            authorUserIds: ["u1"],
            guildIds: ["wrong"],
        })])).toBeNull();
    });

    it("supports all-keyword mode and case sensitivity", () => {
        expect(findFirstMatch(ctx, [rule("all", {
            keywords: ["urgent", "deploy"],
            keywordMode: "all",
        })])?.rule.id).toBe("all");
        expect(findFirstMatch(ctx, [rule("case", {
            keywords: ["URGENT"],
            keywordCaseSensitive: true,
        })])).toBeNull();
    });

    it("skips disabled and invalid empty-condition rules", () => {
        expect(isRuleValid(rule("empty", {}))).toBe(false);
        expect(findFirstMatch(ctx, [rule("empty", {})])).toBeNull();
        expect(findFirstMatch(ctx, [{ ...rule("disabled", { authorUserIds: ["u1"] }), enabled: false }])).toBeNull();
    });

    it("ignores current-user and optimistic messages", () => {
        expect(findFirstMatch({ ...ctx, isCurrentUser: true }, [rule("r", { authorUserIds: ["u1"] })])).toBeNull();
        expect(findFirstMatch({ ...ctx, isOptimistic: true }, [rule("r", { authorUserIds: ["u1"] })])).toBeNull();
    });

    it("matches dm, group dm, guild channel, category, and guild scopes", () => {
        expect(matchesRule({ ...ctx, channelType: "dm", guildId: null, categoryId: null, guildName: null }, rule("dm", {
            dmChannelIds: ["c1"],
        }))).toBe(true);
        expect(matchesRule({ ...ctx, channelType: "groupDm", guildId: null, categoryId: null, guildName: null }, rule("group", {
            groupDmChannelIds: ["c1"],
        }))).toBe(true);
        expect(matchesRule(ctx, rule("guild-channel", { guildChannelIds: ["c1"] }))).toBe(true);
        expect(matchesRule(ctx, rule("category", { categoryIds: ["cat1"] }))).toBe(true);
        expect(matchesRule(ctx, rule("guild", { guildIds: ["g1"] }))).toBe(true);
    });

    it("matches mentioned roles and mention types", () => {
        expect(matchesRule(ctx, rule("role", { mentionedRoleIds: ["role2", "role1"] }))).toBe(true);
        expect(matchesRule(ctx, rule("mention-type", { mentionTypes: ["everyone", "role"] }))).toBe(true);
        expect(matchesRule(ctx, rule("missing-mention-type", { mentionTypes: ["here"] }))).toBe(false);
    });

    it("builds a normalized message context from plain data", () => {
        expect(buildMessageContext({
            message: {
                id: "m2",
                channelId: "dm1",
                authorId: "me",
                content: "@everyone hello",
                mentionedUserIds: ["u2"],
                mentionedRoleIds: [],
                mentionEveryone: true,
            },
            channel: {
                id: "dm1",
                type: "dm",
                name: "Ada",
            },
            currentUserId: "me",
            isStreamerMode: true,
            isDnd: true,
            isOptimistic: true,
        })).toEqual({
            messageId: "m2",
            channelId: "dm1",
            guildId: null,
            categoryId: null,
            authorId: "me",
            isCurrentUser: true,
            isOptimistic: true,
            isStreamerMode: true,
            isDnd: true,
            channelType: "dm",
            mentionedUserIds: ["u2"],
            mentionedRoleIds: [],
            mentionTypes: ["user", "everyone"],
            content: "@everyone hello",
            authorName: "",
            channelName: "Ada",
            guildName: null,
        });
    });

    it("builds a normalized message context from Discord-like message data", () => {
        const context = buildMessageContext({
            message: {
                id: "m3",
                channel_id: "c3",
                guild_id: "g3",
                author: {
                    id: "me",
                    username: "ada_user",
                    globalName: "Ada Lovelace",
                },
                content: "hello @team",
                mentions: [{ id: "u2" }, "u3"],
                mention_roles: ["role1", "role2"],
                mention_everyone: true,
            },
            channel: {
                id: "c3",
                type: 0,
                parent_id: "cat3",
                name: "alerts",
            },
            guild: {
                id: "g3",
                name: "Ops",
            },
            currentUserId: "me",
        });

        expect(context.authorId).toBe("me");
        expect(context.isCurrentUser).toBe(true);
        expect(context.authorName).toBe("Ada Lovelace");
        expect(context.mentionedUserIds).toEqual(["u2", "u3"]);
        expect(context.mentionedRoleIds).toEqual(["role1", "role2"]);
        expect(context.mentionTypes).toEqual(["user", "role", "everyone"]);
    });

    it("distinguishes @here from @everyone when Discord only sets mention_everyone", () => {
        const hereContext = buildMessageContext({
            message: {
                id: "m4",
                channel_id: "c4",
                author: { id: "u1" },
                content: "@here hello",
                mention_everyone: true,
            },
            channel: { id: "c4", type: 0 },
        });
        const everyoneContext = buildMessageContext({
            message: {
                id: "m5",
                channel_id: "c5",
                author: { id: "u1" },
                content: "@everyone hello",
                mention_everyone: true,
            },
            channel: { id: "c5", type: 0 },
        });

        expect(hereContext.mentionTypes).toContain("here");
        expect(everyoneContext.mentionTypes).toContain("everyone");
    });
});
