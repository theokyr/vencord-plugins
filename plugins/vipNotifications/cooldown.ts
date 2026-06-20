import type { MessageContext, VipDeliveryPlan } from "./types";

export interface CooldownDecisionInput {
    plan: VipDeliveryPlan;
    ctx: MessageContext;
}

export function buildCooldownKey(plan: VipDeliveryPlan, ctx: MessageContext): string {
    switch (plan.cooldownKey) {
        case "profileChannel":
            return `profile:${plan.profileId}:channel:${ctx.channelId}`;
        case "profileRule":
            return `profile:${plan.profileId}:rule:${plan.ruleId}`;
        case "profileAuthor":
            return `profile:${plan.profileId}:author:${ctx.authorId}`;
        case "profileOnly":
            return `profile:${plan.profileId}`;
    }
}

export class CooldownTracker {
    private readonly expiresAtByKey = new Map<string, number>();

    canDeliver(input: CooldownDecisionInput, now: number): boolean {
        if (input.plan.cooldownMs <= 0)
            return true;

        const key = buildCooldownKey(input.plan, input.ctx);
        const expiresAt = this.expiresAtByKey.get(key);

        return expiresAt === undefined || now >= expiresAt;
    }

    record(input: CooldownDecisionInput, now: number): void {
        if (input.plan.cooldownMs <= 0)
            return;

        this.expiresAtByKey.set(buildCooldownKey(input.plan, input.ctx), now + input.plan.cooldownMs);
    }
}
