import { beforeEach, describe, expect, it, vi } from "vitest";
import { showNotification } from "@api/Notifications";
import { ChannelRouter, NavigationRouter, __resetWebpackCommonMocks } from "@webpack/common";

import { createPluginAlertAdapter } from "../../plugins/vipNotifications/adapters/pluginAlertAdapter";
import type { AlertText, DeliveryDecision, SoundKind } from "../../plugins/vipNotifications/types";

const alertText: AlertText = {
    title: "VIP alert",
    body: "Ada in #alerts",
    isNativePrivacySafe: true,
};

function createDecision(overrides: Partial<DeliveryDecision["plan"]> = {}): DeliveryDecision {
    const soundKind: SoundKind = overrides.soundKind ?? "builtIn";

    return {
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
        plan: {
            ruleId: "rule-1",
            profileId: "default",
            profileName: "Default",
            soundKind,
            soundId: "default",
            customSoundUrl: "",
            soundVolume: 80,
            showDesktopNotification: true,
            showVencordNotification: true,
            privacyMode: "full",
            allowDndOverride: true,
            allowStreamerModeOverride: true,
            allowStreamerContent: true,
            allowMuteOverride: false,
            cooldownMs: 1000,
            cooldownKey: "profileChannel",
            ...overrides,
        },
    };
}

beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(showNotification).mockReset();
    __resetWebpackCommonMocks();
});

describe("vipNotifications/pluginAlertAdapter", () => {
    it("resolves disabled sound without touching audio APIs", async () => {
        const adapter = createPluginAlertAdapter();

        await expect(adapter.sound(createDecision({ soundKind: "disabled" }), alertText)).resolves.toBeUndefined();
    });

    it("rejects custom sound playback failures", async () => {
        const play = vi.fn().mockRejectedValue(new Error("play failed"));
        class MockAudio {
            volume = 0;
            constructor(public src: string) {}
            play = play;
        }
        vi.stubGlobal("Audio", MockAudio);
        const adapter = createPluginAlertAdapter();

        await expect(adapter.sound(createDecision({
            soundKind: "custom",
            customSoundUrl: "https://example.test/vip.mp3",
        }), alertText)).rejects.toThrow("play failed");
    });

    it("rejects built-in sound setup failures", async () => {
        class FailingAudioContext {
            constructor() {
                throw new Error("audio context failed");
            }
        }
        vi.stubGlobal("window", { AudioContext: FailingAudioContext });
        const adapter = createPluginAlertAdapter();

        await expect(adapter.sound(createDecision({ soundKind: "builtIn" }), alertText)).rejects.toThrow("audio context failed");
    });

    it("rejects unavailable desktop notifications", async () => {
        vi.stubGlobal("Notification", undefined);
        const adapter = createPluginAlertAdapter();

        await expect(adapter.desktop(createDecision(), alertText)).rejects.toThrow("Desktop notifications are unavailable");
    });

    it("rejects denied desktop notification permission", async () => {
        class DeniedNotification {
            static permission = "denied";
        }
        vi.stubGlobal("Notification", DeniedNotification);
        const adapter = createPluginAlertAdapter();

        await expect(adapter.desktop(createDecision(), alertText)).rejects.toThrow("Desktop notification permission denied");
    });

    it("resolves after creating a desktop notification", async () => {
        const notifications: MockNotification[] = [];
        class MockNotification {
            static permission = "granted";
            onclick: (() => void) | null = null;
            close = vi.fn();

            constructor(public title: string, public options: NotificationOptions) {
                notifications.push(this);
            }
        }
        vi.stubGlobal("Notification", MockNotification);
        const adapter = createPluginAlertAdapter();

        await expect(adapter.desktop(createDecision(), alertText)).resolves.toBeUndefined();

        expect(notifications).toHaveLength(1);
        expect(notifications[0].title).toBe("VIP alert");
        expect(notifications[0].options.body).toBe("Ada in #alerts");
    });

    it("keeps desktop notification click navigation best-effort", async () => {
        const notifications: MockNotification[] = [];
        class MockNotification {
            static permission = "granted";
            onclick: (() => void) | null = null;
            close = vi.fn();

            constructor(_title: string, _options: NotificationOptions) {
                notifications.push(this);
            }
        }
        vi.stubGlobal("Notification", MockNotification);
        vi.stubGlobal("window", { focus: vi.fn(() => { throw new Error("focus failed"); }) });
        NavigationRouter.transitionToGuild.mockImplementation(() => { throw new Error("guild nav failed"); });
        NavigationRouter.transitionTo.mockImplementation(() => { throw new Error("route nav failed"); });
        ChannelRouter.transitionToChannel.mockImplementation(() => { throw new Error("channel nav failed"); });
        const adapter = createPluginAlertAdapter();

        await adapter.desktop(createDecision(), alertText);

        expect(() => notifications[0].onclick?.()).not.toThrow();
        expect(notifications[0].close).toHaveBeenCalled();
    });

    it("rejects Vencord notification failures", async () => {
        vi.mocked(showNotification).mockRejectedValue(new Error("show failed"));
        const adapter = createPluginAlertAdapter();

        await expect(adapter.vencord(createDecision(), alertText)).rejects.toThrow("show failed");
    });
});
