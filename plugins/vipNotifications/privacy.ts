import type { AlertText, MessageContext, VipDeliveryPlan } from "./types";

export interface AlertRuntime {
    isStreamerMode: boolean;
}

function renderFullTitle(ctx: MessageContext): string {
    if (ctx.channelType === "guild")
        return `${ctx.authorName} (#${ctx.channelName})`;

    return ctx.authorName;
}

function renderFull(ctx: MessageContext): AlertText {
    return {
        title: renderFullTitle(ctx),
        body: ctx.content,
        isNativePrivacySafe: true,
    };
}

function renderSenderOnly(ctx: MessageContext): AlertText {
    return {
        title: renderFullTitle(ctx),
        body: "",
        isNativePrivacySafe: false,
    };
}

function renderGeneric(): AlertText {
    return {
        title: "VIP message received",
        body: "",
        isNativePrivacySafe: false,
    };
}

export function renderAlertText(ctx: MessageContext, plan: VipDeliveryPlan, runtime: AlertRuntime): AlertText {
    switch (plan.privacyMode) {
        case "full":
            return renderFull(ctx);
        case "senderOnly":
            return renderSenderOnly(ctx);
        case "generic":
            return renderGeneric();
        case "streamerAware":
            if (runtime.isStreamerMode && !plan.allowStreamerContent)
                return renderGeneric();

            return renderFull(ctx);
    }
}
