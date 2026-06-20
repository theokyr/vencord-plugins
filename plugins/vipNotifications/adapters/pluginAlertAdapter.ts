import { showNotification } from "@api/Notifications";
import { ChannelRouter, NavigationRouter } from "@webpack/common";

import type { DeliveryDecision, PluginNotificationAdapter } from "../types";

function clampVolume(volume: number): number {
    if (!Number.isFinite(volume))
        return 0.8;

    return Math.min(1, Math.max(0, volume / 100));
}

function navigateToDecision(decision: DeliveryDecision): void {
    const { channelId, guildId } = decision.ctx;

    if (!channelId)
        return;

    try {
        if (guildId)
            NavigationRouter.transitionToGuild(guildId);
    } catch {
        // Router exports can be unavailable during early startup.
    }

    try {
        if (decision.messageId) {
            const guildSegment = guildId ?? "@me";
            NavigationRouter.transitionTo(`/channels/${guildSegment}/${channelId}/${decision.messageId}`);
            return;
        }
    } catch {
        // Fall back to channel navigation below.
    }

    try {
        ChannelRouter.transitionToChannel(channelId);
        return;
    } catch {
        // Fall back to route navigation below.
    }

    try {
        const guildSegment = guildId ?? "@me";
        NavigationRouter.transitionTo(`/channels/${guildSegment}/${channelId}`);
    } catch {
        // Navigation is best-effort for notifications.
    }
}

async function playBuiltInSound(volume: number): Promise<void> {
    const runtimeWindow = (globalThis as any).window;
    const AudioContextCtor = runtimeWindow?.AudioContext
        ?? runtimeWindow?.webkitAudioContext
        ?? (globalThis as any).AudioContext
        ?? (globalThis as any).webkitAudioContext;
    if (!AudioContextCtor)
        throw new Error("Built-in sound is unavailable");

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = volume;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    await ctx.resume?.();
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.16);
    oscillator.onended = () => {
        try {
            void ctx.close?.();
        } catch {
            // Ignore close failures.
        }
    };
}

async function playCustomSound(url: string, volume: number): Promise<void> {
    if (!url.trim())
        throw new Error("Custom sound URL is empty");

    if (typeof Audio === "undefined")
        throw new Error("Audio API is unavailable");

    const audio = new Audio(url);
    audio.volume = volume;
    await audio.play();
}

async function requireDesktopPermission(): Promise<void> {
    if (typeof Notification === "undefined")
        throw new Error("Desktop notifications are unavailable");

    if (Notification.permission === "granted")
        return;

    if (Notification.permission !== "default")
        throw new Error("Desktop notification permission denied");

    const permission = await Notification.requestPermission();
    if (permission !== "granted")
        throw new Error("Desktop notification permission denied");
}

export function createPluginAlertAdapter(): PluginNotificationAdapter {
    return {
        async sound(decision) {
            if (decision.plan.soundKind === "disabled")
                return;

            const volume = clampVolume(decision.plan.soundVolume);
            if (decision.plan.soundKind === "custom")
                await playCustomSound(decision.plan.customSoundUrl, volume);
            else
                await playBuiltInSound(volume);
        },

        async desktop(decision, alertText) {
            await requireDesktopPermission();

            const notification = new Notification(alertText.title, {
                body: alertText.body,
                silent: true,
            });
            notification.onclick = () => {
                try {
                    window.focus();
                } catch {
                    // Some environments deny focusing from notifications.
                }
                navigateToDecision(decision);
                notification.close();
            };
        },

        async vencord(decision, alertText) {
            await showNotification({
                title: alertText.title,
                body: alertText.body,
                onClick: () => navigateToDecision(decision),
            });
        },
    };
}

export const pluginAlertAdapter = createPluginAlertAdapter();
