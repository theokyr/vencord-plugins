import type { DeliveryDecision, DeliveryState, NativeNotificationOutcome, NotificationOutcome } from "./types";

type OutcomeStates = Record<NotificationOutcome, DeliveryState>;

interface CacheEntry {
    decision: DeliveryDecision;
    expiresAt: number;
    outcomes: OutcomeStates;
}

const OUTCOMES: NotificationOutcome[] = ["sound", "desktop", "vencord"];

function createOutcomeStates(): OutcomeStates {
    return {
        sound: "planned",
        desktop: "planned",
        vencord: "planned",
    };
}

export class DecisionCache {
    private readonly entries = new Map<string, CacheEntry>();
    private readonly inFlightOutcomes = new Set<string>();

    constructor(private readonly ttlMs: number) {}

    set(decision: DeliveryDecision, now = Date.now()): void {
        const existing = this.entries.get(decision.messageId);
        const existingIsFresh = existing !== undefined && now < existing.expiresAt;

        if (existing && !existingIsFresh)
            this.clearInFlightForMessage(decision.messageId);

        this.entries.set(decision.messageId, {
            decision,
            expiresAt: now + this.ttlMs,
            outcomes: existingIsFresh ? existing.outcomes : createOutcomeStates(),
        });
    }

    get(messageId: string, now = Date.now()): DeliveryDecision | undefined {
        return this.getEntry(messageId, now)?.decision;
    }

    prune(now = Date.now()): void {
        for (const [messageId, entry] of this.entries) {
            if (now >= entry.expiresAt) {
                this.entries.delete(messageId);
                this.clearInFlightForMessage(messageId);
            }
        }
    }

    tryClaimOutcome(messageId: string, outcome: NotificationOutcome, now = Date.now()): boolean {
        const entry = this.getEntry(messageId, now);
        if (!entry || entry.outcomes[outcome] !== "planned")
            return false;

        const key = this.inFlightKey(messageId, outcome);
        if (this.inFlightOutcomes.has(key))
            return false;

        this.inFlightOutcomes.add(key);
        return true;
    }

    markNativeClaimed(messageId: string, outcome: NativeNotificationOutcome, now = Date.now()): void {
        this.setOutcomeState(messageId, outcome, "nativeClaimed", now);
    }

    markPluginDelivered(messageId: string, outcome: NotificationOutcome, now = Date.now()): void {
        this.setOutcomeState(messageId, outcome, "pluginDelivered", now);
    }

    markFailed(messageId: string, outcome: NotificationOutcome, now = Date.now()): void {
        this.setOutcomeState(messageId, outcome, "failed", now);
    }

    getOutcomeState(messageId: string, outcome: NotificationOutcome, now = Date.now()): DeliveryState | undefined {
        return this.getEntry(messageId, now)?.outcomes[outcome];
    }

    getOutcomeStates(messageId: string, now = Date.now()): Readonly<OutcomeStates> | undefined {
        return this.getEntry(messageId, now)?.outcomes;
    }

    private setOutcomeState(messageId: string, outcome: NotificationOutcome, state: DeliveryState, now: number): void {
        const entry = this.getEntry(messageId, now);
        if (!entry)
            return;

        entry.outcomes[outcome] = state;
        this.inFlightOutcomes.delete(this.inFlightKey(messageId, outcome));
    }

    private getEntry(messageId: string, now: number): CacheEntry | undefined {
        const entry = this.entries.get(messageId);
        if (!entry)
            return undefined;

        if (now >= entry.expiresAt) {
            this.entries.delete(messageId);
            this.clearInFlightForMessage(messageId);
            return undefined;
        }

        for (const outcome of OUTCOMES)
            entry.outcomes[outcome] ??= "planned";

        return entry;
    }

    private inFlightKey(messageId: string, outcome: NotificationOutcome): string {
        return `${messageId}:${outcome}`;
    }

    private clearInFlightForMessage(messageId: string): void {
        for (const outcome of OUTCOMES)
            this.inFlightOutcomes.delete(this.inFlightKey(messageId, outcome));
    }
}
