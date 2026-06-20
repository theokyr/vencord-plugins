import { describe, expect, it } from "vitest";
import {
    probeNativeDiscordCapabilities,
    shouldClaimNativeDesktop,
    shouldBypassNativeDesktopGate,
    type NativeDesktopGate,
} from "../../plugins/vipNotifications/adapters/nativeDiscordAdapter";
import type { DeliveryDecision, VipDeliveryPlan } from "../../plugins/vipNotifications/types";

const basePlan: VipDeliveryPlan = {
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
    allowStreamerModeOverride: true,
    allowStreamerContent: true,
    allowMuteOverride: true,
    cooldownMs: 1000,
    cooldownKey: "profileChannel",
};

const baseDecision: DeliveryDecision = {
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
        content: "urgent deploy is broken",
        authorName: "Ada",
        channelName: "alerts",
        guildName: "Ops",
    },
    plan: basePlan,
};

function decision(overrides: {
    plan?: Partial<VipDeliveryPlan>;
    ctx?: Partial<DeliveryDecision["ctx"]>;
} = {}): DeliveryDecision {
    return {
        ...baseDecision,
        ctx: {
            ...baseDecision.ctx,
            ...overrides.ctx,
        },
        plan: {
            ...baseDecision.plan,
            ...overrides.plan,
        },
    };
}

describe("vipNotifications/nativeDiscordAdapter", () => {
    it("keeps active native delivery capabilities disabled", () => {
        expect(probeNativeDiscordCapabilities()).toEqual({
            native: {
                sound: false,
                desktop: false,
            },
        });
    });

    it("allows safe full desktop decisions to bypass native desktop gates", () => {
        const gates: NativeDesktopGate[] = ["status", "streamerMode", "noMessages", "selectedChannel", "muted"];

        for (const gate of gates)
            expect(shouldBypassNativeDesktopGate(decision(), gate)).toBe(true);
    });

    it("blocks native gate bypass when the rendered alert text is redacted", () => {
        const redacted = decision({ plan: { privacyMode: "generic" } });

        expect(shouldBypassNativeDesktopGate(redacted, "selectedChannel")).toBe(false);
        expect(shouldBypassNativeDesktopGate(redacted, "muted")).toBe(false);
    });

    it("blocks native gate bypass when the profile does not request desktop notifications", () => {
        expect(shouldBypassNativeDesktopGate(
            decision({ plan: { showDesktopNotification: false } }),
            "selectedChannel",
        )).toBe(false);
    });

    it("requires mute override for muted and no-message gates", () => {
        const noMuteOverride = decision({ plan: { allowMuteOverride: false } });

        expect(shouldBypassNativeDesktopGate(noMuteOverride, "muted")).toBe(false);
        expect(shouldBypassNativeDesktopGate(noMuteOverride, "noMessages")).toBe(false);
        expect(shouldBypassNativeDesktopGate(noMuteOverride, "selectedChannel")).toBe(true);
    });

    it("requires streamer override when streamer mode is active", () => {
        const streamerDecision = decision({
            ctx: { isStreamerMode: true },
            plan: {
                allowStreamerModeOverride: false,
                allowStreamerContent: true,
            },
        });

        expect(shouldBypassNativeDesktopGate(streamerDecision, "streamerMode")).toBe(false);
        expect(shouldBypassNativeDesktopGate(
            decision({
                ctx: { isStreamerMode: true },
                plan: {
                    allowStreamerModeOverride: true,
                    allowStreamerContent: true,
                },
            }),
            "streamerMode",
        )).toBe(true);
    });

    it("requires streamer override even when only Discord's native gate is known to be active", () => {
        expect(shouldBypassNativeDesktopGate(
            decision({
                ctx: { isStreamerMode: false },
                plan: {
                    allowStreamerModeOverride: false,
                    allowStreamerContent: true,
                },
            }),
            "streamerMode",
        )).toBe(false);
    });

    it("does not bypass streamer mode with streamer-aware redacted native text", () => {
        expect(shouldBypassNativeDesktopGate(
            decision({
                ctx: { isStreamerMode: false },
                plan: {
                    privacyMode: "streamerAware",
                    allowStreamerModeOverride: true,
                    allowStreamerContent: false,
                },
            }),
            "streamerMode",
        )).toBe(false);
    });

    it("requires DND override when DND status is active", () => {
        const dndDecision = decision({
            ctx: { isDnd: true },
            plan: { allowDndOverride: false },
        });

        expect(shouldBypassNativeDesktopGate(dndDecision, "status")).toBe(false);
        expect(shouldBypassNativeDesktopGate(
            decision({
                ctx: { isDnd: true },
                plan: { allowDndOverride: true },
            }),
            "status",
        )).toBe(true);
    });

    it("requires DND override even when only Discord's native gate is known to be active", () => {
        expect(shouldBypassNativeDesktopGate(
            decision({
                ctx: { isDnd: false },
                plan: { allowDndOverride: false },
            }),
            "status",
        )).toBe(false);
    });

    it("keeps gate bypass eligibility separate from final native desktop claiming", () => {
        const vipDecision = decision({
            plan: { allowMuteOverride: false },
        });

        expect(shouldBypassNativeDesktopGate(vipDecision, "status")).toBe(true);
        expect(shouldClaimNativeDesktop(vipDecision, false)).toBe(false);
        expect(shouldClaimNativeDesktop(vipDecision, true)).toBe(true);
    });

    it("does not claim native desktop for redacted or non-desktop decisions", () => {
        expect(shouldClaimNativeDesktop(
            decision({ plan: { privacyMode: "generic" } }),
            true,
        )).toBe(false);
        expect(shouldClaimNativeDesktop(
            decision({ plan: { showDesktopNotification: false } }),
            true,
        )).toBe(false);
    });
});
