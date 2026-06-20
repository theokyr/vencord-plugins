import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../../plugins/vipNotifications/defaults";
import { createQuickAddRule, insertQuickAddRule } from "../../plugins/vipNotifications/quickAdd";
import type { QuickAddTarget } from "../../plugins/vipNotifications/quickAdd";
import type { VipRule } from "../../plugins/vipNotifications/types";

function idGenerator(id: string) {
    return () => id;
}

function rule(id: string): VipRule {
    return {
        id,
        name: id,
        enabled: true,
        profileId: "default",
        conditions: { guildIds: [id] },
    };
}

describe("vipNotifications/quickAdd", () => {
    it.each([
        [
            { type: "user", userId: "user-1", label: "Ada" },
            "VIP User: Ada",
            { authorUserIds: ["user-1"] },
        ],
        [
            { type: "dm", channelId: "dm-1", label: "Ada DM" },
            "VIP DM: Ada DM",
            { dmChannelIds: ["dm-1"] },
        ],
        [
            { type: "groupDm", channelId: "gdm-1", label: "Study Group" },
            "VIP Group DM: Study Group",
            { groupDmChannelIds: ["gdm-1"] },
        ],
        [
            { type: "guildChannel", channelId: "channel-1", label: "#alerts" },
            "VIP Channel: #alerts",
            { guildChannelIds: ["channel-1"] },
        ],
        [
            { type: "category", categoryId: "category-1", label: "Operations" },
            "VIP Category: Operations",
            { categoryIds: ["category-1"] },
        ],
        [
            { type: "guild", guildId: "guild-1", label: "Ops" },
            "VIP Server: Ops",
            { guildIds: ["guild-1"] },
        ],
    ] satisfies Array<[QuickAddTarget, string, VipRule["conditions"]]>)(
        "creates a valid %s quick-add rule",
        (target, expectedName, expectedConditions) => {
            expect(createQuickAddRule(target, "profile-1", idGenerator(`rule-${target.type}`))).toEqual({
                id: `rule-${target.type}`,
                name: expectedName,
                enabled: true,
                profileId: "profile-1",
                conditions: expectedConditions,
            });
        }
    );

    it("uses an injected id generator for deterministic rule ids", () => {
        const rule = createQuickAddRule(
            { type: "guild", guildId: "guild-1", label: "Ops" },
            "default",
            idGenerator("deterministic-id"),
        );

        expect(rule.id).toBe("deterministic-id");
    });

    it("inserts quick-add rules at the top when configured", () => {
        const existing = [rule("existing-1"), rule("existing-2")];
        const config = { ...createDefaultConfig(), quickAddPlacement: "top" as const, rules: existing };
        const quickRule = rule("quick");

        const next = insertQuickAddRule(config, quickRule);

        expect(next).not.toBe(config);
        expect(next.rules).toEqual([quickRule, ...existing]);
        expect(config.rules).toEqual(existing);
    });

    it("inserts quick-add rules at the bottom when configured", () => {
        const existing = [rule("existing-1"), rule("existing-2")];
        const config = { ...createDefaultConfig(), quickAddPlacement: "bottom" as const, rules: existing };
        const quickRule = rule("quick");

        const next = insertQuickAddRule(config, quickRule);

        expect(next).not.toBe(config);
        expect(next.rules).toEqual([...existing, quickRule]);
        expect(config.rules).toEqual(existing);
    });
});
