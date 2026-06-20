import { describe, expect, it } from "vitest";
import { createDefaultConfig, createDefaultProfile } from "../../plugins/vipNotifications/defaults";
import { resolveDeliveryPlan } from "../../plugins/vipNotifications/profiles";
import type { MessageContext, VipProfile, VipRule } from "../../plugins/vipNotifications/types";

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
    mentionedUserIds: [],
    mentionedRoleIds: [],
    mentionTypes: [],
    content: "urgent",
    authorName: "Ada",
    channelName: "alerts",
    guildName: "Ops",
};

function rule(profileId = "default"): VipRule {
    return {
        id: "rule-1",
        name: "Rule",
        enabled: true,
        profileId,
        conditions: { authorUserIds: ["u1"] },
    };
}

function profile(overrides: Partial<VipProfile>): VipProfile {
    return { ...createDefaultProfile(), ...overrides };
}

describe("vipNotifications/profiles", () => {
    it("resolves a successful delivery plan from the rule profile", () => {
        const config = createDefaultConfig();
        const result = resolveDeliveryPlan(config, rule(), ctx);

        expect(result.ok).toBe(true);
        if (!result.ok)
            return;

        expect(result.plan).toMatchObject({
            ruleId: "rule-1",
            profileId: "default",
            profileName: "Default",
            soundKind: "builtIn",
            soundId: "default",
            customSoundUrl: "",
            soundVolume: 80,
            showDesktopNotification: true,
            showVencordNotification: true,
            privacyMode: "streamerAware",
            allowDndOverride: true,
            allowStreamerModeOverride: false,
            allowStreamerContent: false,
            allowMuteOverride: false,
            cooldownMs: 60000,
            cooldownKey: "profileChannel",
        });
        expect(result.diagnostics).toEqual([]);
    });

    it("fails disabled matched profiles without falling back", () => {
        const config = {
            ...createDefaultConfig(),
            profiles: [
                profile({ id: "default", enabled: true }),
                profile({ id: "quiet", name: "Quiet", enabled: false }),
            ],
        };

        const result = resolveDeliveryPlan(config, rule("quiet"), ctx);

        expect(result).toMatchObject({
            ok: false,
            reason: "disabled_profile",
        });
    });

    it("falls back to the enabled default profile when the rule profile is missing", () => {
        const config = {
            ...createDefaultConfig(),
            profiles: [
                profile({ id: "default", name: "Fallback", enabled: true }),
            ],
        };

        const result = resolveDeliveryPlan(config, rule("missing"), ctx);

        expect(result.ok).toBe(true);
        if (!result.ok)
            return;

        expect(result.plan.profileId).toBe("default");
        expect(result.plan.profileName).toBe("Fallback");
        expect(result.diagnostics.some(diagnostic => diagnostic.code === "profile_fallback_default")).toBe(true);
    });

    it("fails when both the rule profile and default profile are missing", () => {
        const config = {
            ...createDefaultConfig(),
            defaultProfileId: "missing-default",
            profiles: [
                profile({ id: "other", enabled: true }),
            ],
        };

        const result = resolveDeliveryPlan(config, rule("missing"), ctx);

        expect(result).toMatchObject({
            ok: false,
            reason: "missing_profile",
        });
    });
});
