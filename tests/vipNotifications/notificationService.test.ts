import { describe, expect, it } from "vitest";
import { DecisionCache } from "../../plugins/vipNotifications/decisionCache";
import { NotificationService } from "../../plugins/vipNotifications/notificationService";
import type { DeliveryDecision, NotificationServiceAdapters, NotificationServiceCapabilities } from "../../plugins/vipNotifications/types";

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
        allowStreamerModeOverride: true,
        allowStreamerContent: true,
        allowMuteOverride: false,
        cooldownMs: 1000,
        cooldownKey: "profileChannel",
    },
};

interface FakeAdapters extends NotificationServiceAdapters {
    plugin: NotificationServiceAdapters["plugin"] & {
        soundCalls: number;
        desktopCalls: number;
        vencordCalls: number;
    };
    native: NonNullable<NotificationServiceAdapters["native"]> & {
        soundCalls: number;
        desktopCalls: number;
    };
}

function createFakeAdapters(options: {
    nativeAvailable?: boolean;
    nativeFailures?: Partial<Record<"sound" | "desktop", boolean>>;
    pluginFailures?: Partial<Record<"sound" | "desktop" | "vencord", boolean>>;
    pluginDelays?: Partial<Record<"sound" | "desktop" | "vencord", Promise<void>>>;
} = {}): FakeAdapters {
    const nativeAvailable = options.nativeAvailable ?? true;
    const nativeFailures = options.nativeFailures ?? {};
    const pluginFailures = options.pluginFailures ?? {};
    const pluginDelays = options.pluginDelays ?? {};

    const adapters: FakeAdapters = {
        plugin: {
            soundCalls: 0,
            desktopCalls: 0,
            vencordCalls: 0,
            async sound() {
                this.soundCalls++;
                await pluginDelays.sound;
                if (pluginFailures.sound)
                    throw new Error("sound failed");
            },
            async desktop() {
                this.desktopCalls++;
                await pluginDelays.desktop;
                if (pluginFailures.desktop)
                    throw new Error("desktop failed");
            },
            async vencord() {
                this.vencordCalls++;
                await pluginDelays.vencord;
                if (pluginFailures.vencord)
                    throw new Error("vencord failed");
            },
        },
        native: {
            soundCalls: 0,
            desktopCalls: 0,
            async sound() {
                this.soundCalls++;
                if (nativeFailures.sound)
                    throw new Error("native sound failed");
            },
            async desktop() {
                this.desktopCalls++;
                if (nativeFailures.desktop)
                    throw new Error("native desktop failed");
            },
        },
        capabilities: {
            native: {
                sound: nativeAvailable,
                desktop: nativeAvailable,
            },
        },
    };

    return adapters;
}

function createService(cache: DecisionCache, adapters: NotificationServiceAdapters, capabilities?: NotificationServiceCapabilities): NotificationService {
    return new NotificationService(cache, adapters, capabilities);
}

describe("vipNotifications/notificationService", () => {
    it("uses native first and does not plugin-deliver duplicate outcomes", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver(baseDecision, 1000);
        await service.deliver(baseDecision, 1000);

        expect(adapters.native.soundCalls).toBe(1);
        expect(adapters.native.desktopCalls).toBe(1);
        expect("vencord" in adapters.native).toBe(false);
        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(1);
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("nativeClaimed");
        expect(cache.getOutcomeState("m1", "vencord", 1000)).toBe("pluginDelivered");
    });

    it("does not plugin-deliver an outcome already claimed by native", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);
        cache.set(baseDecision, 1000);

        service.markNativeClaimed("m1", "desktop", 1000);
        await service.deliver(baseDecision, 1000);

        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.soundCalls).toBe(1);
        expect(adapters.plugin.vencordCalls).toBe(1);
    });

    it("treats a passive native desktop claim as covering native sound", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);

        service.markNativeDesktopClaimed(baseDecision, 1000);
        await service.deliver(baseDecision, 1000);

        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(1);
        expect(cache.getOutcomeState("m1", "sound", 1000)).toBe("nativeClaimed");
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("nativeClaimed");
    });

    it("does not duplicate plugin sends for concurrent deliveries of the same message", async () => {
        const cache = new DecisionCache(5000);
        let releaseDesktop: () => void = () => {};
        const desktopDelay = new Promise<void>(resolve => {
            releaseDesktop = resolve;
        });
        const adapters = createFakeAdapters({
            nativeAvailable: false,
            pluginDelays: { desktop: desktopDelay },
        });
        const service = createService(cache, adapters);
        const first = service.deliver(baseDecision, 1000);
        const second = service.deliver(baseDecision, 1000);

        await Promise.resolve();
        releaseDesktop();
        await Promise.all([first, second]);

        expect(adapters.plugin.soundCalls).toBe(1);
        expect(adapters.plugin.desktopCalls).toBe(1);
        expect(adapters.plugin.vencordCalls).toBe(1);
    });

    it("records cooldown when the only requested outcome was already native claimed", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);
        const desktopOnlyDecision: DeliveryDecision = {
            ...baseDecision,
            plan: {
                ...baseDecision.plan,
                soundKind: "disabled",
                showVencordNotification: false,
            },
        };
        cache.set(desktopOnlyDecision, 1000);

        service.markNativeClaimed("m1", "desktop", 1000);
        await service.deliver(desktopOnlyDecision, 1000);
        await service.deliver({
            ...desktopOnlyDecision,
            messageId: "m2",
            ctx: { ...desktopOnlyDecision.ctx, messageId: "m2" },
        }, 1500);

        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(cache.get("m2", 1500)).toBeUndefined();
    });

    it("falls back to plugin delivery when native is unavailable", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);

        await service.deliver(baseDecision, 1000);

        expect(adapters.plugin.soundCalls).toBe(1);
        expect(adapters.plugin.desktopCalls).toBe(1);
        expect(adapters.plugin.vencordCalls).toBe(1);
    });

    it("uses plugin desktop delivery when rendered text is not native privacy safe", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver({
            ...baseDecision,
            plan: { ...baseDecision.plan, privacyMode: "generic" },
        }, 1000);

        expect(adapters.native.desktopCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(1);
    });

    it("suppresses all delivery when DND override is not allowed", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver({
            ...baseDecision,
            ctx: { ...baseDecision.ctx, isDnd: true },
            plan: { ...baseDecision.plan, allowDndOverride: false },
        }, 1000);

        expect(adapters.native.soundCalls).toBe(0);
        expect(adapters.native.desktopCalls).toBe(0);
        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(0);
        expect(cache.get("m1", 1000)).toBeUndefined();
    });

    it("suppresses all delivery when streamer override is not allowed", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver({
            ...baseDecision,
            ctx: { ...baseDecision.ctx, isStreamerMode: true },
            plan: { ...baseDecision.plan, allowStreamerModeOverride: false },
        }, 1000);

        expect(adapters.native.soundCalls).toBe(0);
        expect(adapters.native.desktopCalls).toBe(0);
        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(0);
        expect(cache.get("m1", 1000)).toBeUndefined();
    });

    it("suppresses all delivery when muted and mute override is not allowed", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver({
            ...baseDecision,
            nativeSuppressions: { muted: true },
            plan: { ...baseDecision.plan, allowMuteOverride: false },
        }, 1000);

        expect(adapters.native.soundCalls).toBe(0);
        expect(adapters.native.desktopCalls).toBe(0);
        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(0);
        expect(cache.get("m1", 1000)).toBeUndefined();
    });

    it("uses native delivery when muted and mute override is allowed", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters();
        const service = createService(cache, adapters);

        await service.deliver({
            ...baseDecision,
            nativeSuppressions: { muted: true },
            plan: { ...baseDecision.plan, allowMuteOverride: true },
        }, 1000);

        expect(adapters.native.soundCalls).toBe(1);
        expect(adapters.native.desktopCalls).toBe(1);
        expect(adapters.plugin.soundCalls).toBe(0);
        expect(adapters.plugin.desktopCalls).toBe(0);
        expect(adapters.plugin.vencordCalls).toBe(1);
    });

    it("suppresses every outcome during cooldown and records only after a successful attempt", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);

        await service.deliver(baseDecision, 1000);
        await service.deliver({ ...baseDecision, messageId: "m2", ctx: { ...baseDecision.ctx, messageId: "m2" } }, 1500);
        await service.deliver({ ...baseDecision, messageId: "m3", ctx: { ...baseDecision.ctx, messageId: "m3" } }, 2000);

        expect(adapters.plugin.soundCalls).toBe(2);
        expect(adapters.plugin.desktopCalls).toBe(2);
        expect(adapters.plugin.vencordCalls).toBe(2);
        expect(cache.get("m2", 1500)).toBeUndefined();
    });

    it("reserves cooldown admission before async adapter delivery completes", async () => {
        const cache = new DecisionCache(5000);
        let releaseDesktop: () => void = () => {};
        const desktopDelay = new Promise<void>(resolve => {
            releaseDesktop = resolve;
        });
        const adapters = createFakeAdapters({
            nativeAvailable: false,
            pluginDelays: { desktop: desktopDelay },
        });
        const service = createService(cache, adapters);
        const first = service.deliver(baseDecision, 1000);
        await Promise.resolve();

        const second = service.deliver({
            ...baseDecision,
            messageId: "m2",
            ctx: { ...baseDecision.ctx, messageId: "m2" },
        }, 1000);
        await Promise.resolve();

        releaseDesktop();
        await Promise.all([first, second]);

        expect(adapters.plugin.soundCalls).toBe(1);
        expect(adapters.plugin.desktopCalls).toBe(1);
        expect(adapters.plugin.vencordCalls).toBe(1);
        expect(cache.get("m2", 1000)).toBeUndefined();
    });

    it("does not apply cooldown when cooldownMs is zero", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({ nativeAvailable: false });
        const service = createService(cache, adapters);

        await service.deliver({ ...baseDecision, plan: { ...baseDecision.plan, cooldownMs: 0 } }, 1000);
        await service.deliver({
            ...baseDecision,
            messageId: "m2",
            ctx: { ...baseDecision.ctx, messageId: "m2" },
            plan: { ...baseDecision.plan, cooldownMs: 0 },
        }, 1000);

        expect(adapters.plugin.desktopCalls).toBe(2);
    });

    it("marks adapter failures per outcome without blocking other outcomes", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({
            nativeAvailable: false,
            pluginFailures: { desktop: true },
        });
        const service = createService(cache, adapters);

        await service.deliver(baseDecision, 1000);

        expect(cache.getOutcomeState("m1", "sound", 1000)).toBe("pluginDelivered");
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("failed");
        expect(cache.getOutcomeState("m1", "vencord", 1000)).toBe("pluginDelivered");
    });

    it("falls back to plugin delivery when native adapter delivery fails", async () => {
        const cache = new DecisionCache(5000);
        const adapters = createFakeAdapters({
            nativeFailures: { desktop: true },
        });
        const service = createService(cache, adapters);

        await service.deliver(baseDecision, 1000);

        expect(cache.getOutcomeState("m1", "sound", 1000)).toBe("nativeClaimed");
        expect(cache.getOutcomeState("m1", "desktop", 1000)).toBe("pluginDelivered");
        expect(cache.getOutcomeState("m1", "vencord", 1000)).toBe("pluginDelivered");
        expect(adapters.plugin.desktopCalls).toBe(1);
        expect(adapters.plugin.vencordCalls).toBe(1);
    });
});
