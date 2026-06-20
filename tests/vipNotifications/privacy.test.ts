import { describe, expect, it } from "vitest";
import { renderAlertText } from "../../plugins/vipNotifications/privacy";
import type { MessageContext, VipDeliveryPlan } from "../../plugins/vipNotifications/types";

const guildCtx: MessageContext = {
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
};

const dmCtx: MessageContext = {
    ...guildCtx,
    channelType: "dm",
    guildId: null,
    categoryId: null,
    guildName: null,
    channelName: "Ada",
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
    privacyMode: "streamerAware",
    allowDndOverride: true,
    allowStreamerModeOverride: false,
    allowStreamerContent: false,
    allowMuteOverride: false,
    cooldownMs: 60000,
    cooldownKey: "profileChannel",
};

describe("vipNotifications/privacy", () => {
    it("renders streamer-aware alerts as generic when streamer mode hides content", () => {
        expect(renderAlertText(guildCtx, plan, { isStreamerMode: true })).toEqual({
            title: "VIP message received",
            body: "",
            isNativePrivacySafe: false,
        });
    });

    it("renders full alerts with sender, location, content, and native-safe status", () => {
        expect(renderAlertText(guildCtx, { ...plan, privacyMode: "full" }, { isStreamerMode: true })).toEqual({
            title: "Ada (#alerts)",
            body: "urgent deploy is broken",
            isNativePrivacySafe: true,
        });
    });

    it("uses author-only titles for DMs in full mode", () => {
        expect(renderAlertText(dmCtx, { ...plan, privacyMode: "full" }, { isStreamerMode: false })).toEqual({
            title: "Ada",
            body: "urgent deploy is broken",
            isNativePrivacySafe: true,
        });
    });

    it("marks sender-only and generic alerts as not native-safe", () => {
        expect(renderAlertText(guildCtx, { ...plan, privacyMode: "senderOnly" }, { isStreamerMode: false })).toEqual({
            title: "Ada (#alerts)",
            body: "",
            isNativePrivacySafe: false,
        });
        expect(renderAlertText(guildCtx, { ...plan, privacyMode: "generic" }, { isStreamerMode: false })).toEqual({
            title: "VIP message received",
            body: "",
            isNativePrivacySafe: false,
        });
    });
});
