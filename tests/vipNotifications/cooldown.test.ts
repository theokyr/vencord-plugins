import { describe, expect, it } from "vitest";
import { buildCooldownKey, CooldownTracker } from "../../plugins/vipNotifications/cooldown";
import type { MessageContext, VipDeliveryPlan } from "../../plugins/vipNotifications/types";

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

const plan: VipDeliveryPlan = {
    ruleId: "rule-1",
    profileId: "default",
    profileName: "Default",
    soundKind: "builtIn",
    soundId: "default",
    customSoundUrl: "",
    soundVolume: 80,
    showDesktopNotification: true,
    showVencordNotification: true,
    privacyMode: "full",
    allowDndOverride: true,
    allowStreamerModeOverride: false,
    allowStreamerContent: false,
    allowMuteOverride: false,
    cooldownMs: 1000,
    cooldownKey: "profileChannel",
};

describe("vipNotifications/cooldown", () => {
    it("builds distinct keys for every cooldown mode", () => {
        expect(buildCooldownKey({ ...plan, cooldownKey: "profileChannel" }, ctx)).toBe("profile:default:channel:c1");
        expect(buildCooldownKey({ ...plan, cooldownKey: "profileRule" }, ctx)).toBe("profile:default:rule:rule-1");
        expect(buildCooldownKey({ ...plan, cooldownKey: "profileAuthor" }, ctx)).toBe("profile:default:author:u1");
        expect(buildCooldownKey({ ...plan, cooldownKey: "profileOnly" }, ctx)).toBe("profile:default");
    });

    it("blocks deliveries until the cooldown expires", () => {
        const tracker = new CooldownTracker();
        const input = { plan, ctx };

        expect(tracker.canDeliver(input, 1000)).toBe(true);
        tracker.record(input, 1000);
        expect(tracker.canDeliver(input, 1500)).toBe(false);
        expect(tracker.canDeliver(input, 2000)).toBe(true);
    });

    it("does not block when cooldown is disabled", () => {
        const tracker = new CooldownTracker();
        const input = { plan: { ...plan, cooldownMs: 0 }, ctx };

        tracker.record(input, 1000);
        expect(tracker.canDeliver(input, 1000)).toBe(true);
    });
});
