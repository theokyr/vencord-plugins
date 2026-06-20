import { buildCooldownKey, CooldownTracker } from "./cooldown";
import type { DecisionCache } from "./decisionCache";
import { renderAlertText } from "./privacy";
import type {
    AlertText,
    DeliveryDecision,
    DeliveryState,
    NativeNotificationOutcome,
    NotificationOutcome,
    NotificationServiceAdapters,
    NotificationServiceCapabilities,
} from "./types";

const OUTCOMES: NotificationOutcome[] = ["sound", "desktop", "vencord"];

const DEFAULT_CAPABILITIES: NotificationServiceCapabilities = {
    native: {
        sound: false,
        desktop: false,
    },
};

export class NotificationService {
    private readonly cooldowns = new CooldownTracker();
    private readonly pendingCooldownKeys = new Set<string>();
    private readonly capabilities: NotificationServiceCapabilities;

    constructor(
        private readonly cache: DecisionCache,
        private readonly adapters: NotificationServiceAdapters,
        capabilities?: NotificationServiceCapabilities,
    ) {
        this.capabilities = capabilities ?? adapters.capabilities ?? DEFAULT_CAPABILITIES;
    }

    markNativeClaimed(messageId: string, outcome: NativeNotificationOutcome, now = Date.now()): void {
        this.cache.markNativeClaimed(messageId, outcome, now);
    }

    markNativeDesktopClaimed(decision: DeliveryDecision, now = Date.now()): void {
        this.cache.set(decision, now);
        this.cache.markNativeClaimed(decision.messageId, "desktop", now);

        if (this.isOutcomeRequested(decision, "sound"))
            this.cache.markNativeClaimed(decision.messageId, "sound", now);
    }

    async deliver(decision: DeliveryDecision, now = Date.now()): Promise<void> {
        if (!this.hasRequestedOutcomes(decision))
            return;

        if (this.isSuppressedByRestriction(decision))
            return;

        const cooldownReservation = this.reserveCooldown(decision, now);
        if (cooldownReservation === false)
            return;

        this.cache.set(decision, now);

        const alertText = renderAlertText(decision.ctx, decision.plan, {
            isStreamerMode: decision.ctx.isStreamerMode,
        });
        let hadSuccessfulAttempt = false;

        for (const outcome of OUTCOMES) {
            if (!this.isOutcomeRequested(decision, outcome))
                continue;

            const delivered = await this.deliverOutcome(decision, outcome, alertText, now);
            hadSuccessfulAttempt ||= delivered;
        }

        if (hadSuccessfulAttempt)
            this.cooldowns.record({ plan: decision.plan, ctx: decision.ctx }, now);

        if (cooldownReservation)
            this.pendingCooldownKeys.delete(cooldownReservation);
    }

    private async deliverOutcome(
        decision: DeliveryDecision,
        outcome: NotificationOutcome,
        alertText: AlertText,
        now: number,
    ): Promise<boolean> {
        const state = this.cache.getOutcomeState(decision.messageId, outcome, now);

        if (state === "nativeClaimed" || state === "pluginDelivered" || state === "failed")
            return state === "nativeClaimed";

        if (!this.cache.tryClaimOutcome(decision.messageId, outcome, now))
            return false;

        if (this.isNativeEligible(decision, outcome, alertText, state)) {
            try {
                await this.deliverNative(decision, outcome, alertText);
                this.cache.markNativeClaimed(decision.messageId, outcome, now);
                return true;
            } catch {
                return this.deliverPlugin(decision, outcome, alertText, now);
            }
        }

        return this.deliverPlugin(decision, outcome, alertText, now);
    }

    private async deliverNative(decision: DeliveryDecision, outcome: NativeNotificationOutcome, alertText: AlertText): Promise<void> {
        await this.adapters.native?.[outcome](decision, alertText);
    }

    private async deliverPlugin(
        decision: DeliveryDecision,
        outcome: NotificationOutcome,
        alertText: AlertText,
        now: number,
    ): Promise<boolean> {
        try {
            await this.adapters.plugin[outcome](decision, alertText);
            this.cache.markPluginDelivered(decision.messageId, outcome, now);
            return true;
        } catch {
            this.cache.markFailed(decision.messageId, outcome, now);
            return false;
        }
    }

    private isNativeEligible(
        decision: DeliveryDecision,
        outcome: NotificationOutcome,
        alertText: AlertText,
        state: DeliveryState | undefined,
    ): outcome is NativeNotificationOutcome {
        if (!this.isNativeOutcome(outcome))
            return false;

        if (!this.adapters.native || !this.capabilities.native[outcome])
            return false;

        if (state === "pluginDelivered")
            return false;

        if (decision.ctx.isDnd && !decision.plan.allowDndOverride)
            return false;

        if (decision.ctx.isStreamerMode && !decision.plan.allowStreamerModeOverride)
            return false;

        if (decision.nativeSuppressions?.muted === true && !decision.plan.allowMuteOverride)
            return false;

        if (outcome === "desktop" && !alertText.isNativePrivacySafe)
            return false;

        return this.isOutcomeRequested(decision, outcome);
    }

    private isNativeOutcome(outcome: NotificationOutcome): outcome is NativeNotificationOutcome {
        return outcome === "sound" || outcome === "desktop";
    }

    private isSuppressedByRestriction(decision: DeliveryDecision): boolean {
        if (decision.ctx.isDnd && !decision.plan.allowDndOverride)
            return true;

        if (decision.ctx.isStreamerMode && !decision.plan.allowStreamerModeOverride)
            return true;

        if (decision.nativeSuppressions?.muted === true && !decision.plan.allowMuteOverride)
            return true;

        return false;
    }

    private reserveCooldown(decision: DeliveryDecision, now: number): string | false | undefined {
        if (decision.plan.cooldownMs <= 0)
            return undefined;

        const key = buildCooldownKey(decision.plan, decision.ctx);
        if (this.pendingCooldownKeys.has(key) || !this.cooldowns.canDeliver({ plan: decision.plan, ctx: decision.ctx }, now))
            return false;

        this.pendingCooldownKeys.add(key);
        return key;
    }

    private hasRequestedOutcomes(decision: DeliveryDecision): boolean {
        return OUTCOMES.some(outcome => this.isOutcomeRequested(decision, outcome));
    }

    private isOutcomeRequested(decision: DeliveryDecision, outcome: NotificationOutcome): boolean {
        switch (outcome) {
            case "sound":
                return decision.plan.soundKind !== "disabled";
            case "desktop":
                return decision.plan.showDesktopNotification;
            case "vencord":
                return decision.plan.showVencordNotification;
        }
    }
}
