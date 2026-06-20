import { describe, expect, it } from "vitest";
import { DecisionCache } from "../../plugins/vipNotifications/decisionCache";
import type { DeliveryDecision } from "../../plugins/vipNotifications/types";

const decision: DeliveryDecision = {
    messageId: "m1",
    ctx: {
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
    },
    plan: {
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
    },
};

describe("vipNotifications/decisionCache", () => {
    it("stores decisions by message id and initializes requested outcomes as planned", () => {
        const cache = new DecisionCache(5000);

        cache.set(decision, 1000);

        expect(cache.get("m1", 1000)).toEqual(decision);
        expect(cache.getOutcomeState("m1", "sound", 1000)).toBe("planned");
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("planned");
        expect(cache.getOutcomeState("m1", "vencord", 1000)).toBe("planned");
    });

    it("tracks independent outcome state transitions", () => {
        const cache = new DecisionCache(5000);
        cache.set(decision, 1000);

        cache.markNativeClaimed("m1", "desktop", 1000);
        cache.markPluginDelivered("m1", "sound", 1000);
        cache.markFailed("m1", "vencord", 1000);

        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("nativeClaimed");
        expect(cache.getOutcomeState("m1", "sound", 1000)).toBe("pluginDelivered");
        expect(cache.getOutcomeState("m1", "vencord", 1000)).toBe("failed");
    });

    it("atomically claims planned outcomes while adapter delivery is in flight", () => {
        const cache = new DecisionCache(5000);
        cache.set(decision, 1000);

        expect(cache.tryClaimOutcome("m1", "desktop", 1000)).toBe(true);
        expect(cache.tryClaimOutcome("m1", "desktop", 1000)).toBe(false);
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("planned");

        cache.markPluginDelivered("m1", "desktop", 1000);
        expect(cache.tryClaimOutcome("m1", "desktop", 1000)).toBe(false);
    });

    it("starts fresh outcome states when set replaces an expired entry", () => {
        const cache = new DecisionCache(5000);
        cache.set(decision, 1000);
        cache.markNativeClaimed("m1", "desktop", 1000);
        cache.markPluginDelivered("m1", "sound", 1000);
        cache.markFailed("m1", "vencord", 1000);

        cache.set({ ...decision, ctx: { ...decision.ctx, content: "fresh" } }, 6000);

        expect(cache.getOutcomeState("m1", "desktop", 6000)).toBe("planned");
        expect(cache.getOutcomeState("m1", "sound", 6000)).toBe("planned");
        expect(cache.getOutcomeState("m1", "vencord", 6000)).toBe("planned");
        expect(cache.get("m1", 6000)?.ctx.content).toBe("fresh");
    });

    it("clears in-flight claims when get expires an entry", () => {
        const cache = new DecisionCache(5000);
        cache.set(decision, 1000);
        expect(cache.tryClaimOutcome("m1", "desktop", 1000)).toBe(true);

        expect(cache.get("m1", 6000)).toBeUndefined();
        cache.set(decision, 6000);

        expect(cache.tryClaimOutcome("m1", "desktop", 6000)).toBe(true);
    });

    it("expires decisions after ttl and prunes expired entries", () => {
        const cache = new DecisionCache(5000);
        cache.set(decision, 1000);

        expect(cache.get("m1", 5999)).toEqual(decision);
        expect(cache.get("m1", 6000)).toBeUndefined();

        cache.set({ ...decision, messageId: "m2" }, 6000);
        cache.prune(10999);
        expect(cache.get("m2", 10999)).toBeDefined();
        cache.prune(11000);
        expect(cache.get("m2", 11000)).toBeUndefined();
    });
});
