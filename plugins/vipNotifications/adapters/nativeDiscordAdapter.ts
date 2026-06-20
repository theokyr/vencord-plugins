import type {
    DeliveryDecision,
    NativeNotificationAdapter,
    NotificationServiceCapabilities,
} from "../types";
import { renderAlertText } from "../privacy";

export type NativeDesktopGate = "status" | "streamerMode" | "noMessages" | "selectedChannel" | "muted";

export const nativeDiscordCapabilities: NotificationServiceCapabilities = {
    native: {
        sound: false,
        desktop: false,
    },
};

export function probeNativeDiscordCapabilities(): NotificationServiceCapabilities {
    return {
        native: {
            sound: false,
            desktop: false,
        },
    };
}

export function canUseNativeDiscordNotifications(): boolean {
    return false;
}

function getNativeGateContext(decision: DeliveryDecision, gate?: NativeDesktopGate): DeliveryDecision["ctx"] {
    if (gate === "streamerMode")
        return { ...decision.ctx, isStreamerMode: true };

    if (gate === "status")
        return { ...decision.ctx, isDnd: true };

    return decision.ctx;
}

function hasNativeSafeDesktopPlan(decision: DeliveryDecision, gate?: NativeDesktopGate): boolean {
    if (!decision.plan.showDesktopNotification)
        return false;

    const ctx = getNativeGateContext(decision, gate);
    return renderAlertText(ctx, decision.plan, {
        isStreamerMode: ctx.isStreamerMode,
    }).isNativePrivacySafe;
}

export function shouldBypassNativeDesktopGate(decision: DeliveryDecision, gate: NativeDesktopGate): boolean {
    if (!hasNativeSafeDesktopPlan(decision, gate))
        return false;

    switch (gate) {
        case "status":
            return decision.plan.allowDndOverride;
        case "streamerMode":
            return decision.plan.allowStreamerModeOverride;
        case "noMessages":
        case "muted":
            return decision.plan.allowMuteOverride;
        case "selectedChannel":
            return true;
    }
}

export function shouldClaimNativeDesktop(decision: DeliveryDecision, nativeAllowed: boolean): boolean {
    return nativeAllowed && hasNativeSafeDesktopPlan(decision);
}

export function createNativeDiscordAdapter(): NativeNotificationAdapter {
    return {
        sound() {
            // Native hooks are passive; active service delivery is disabled by capabilities.
        },
        desktop() {
            // Native hooks are passive; active service delivery is disabled by capabilities.
        },
    };
}

export const nativeDiscordAdapter = createNativeDiscordAdapter();
