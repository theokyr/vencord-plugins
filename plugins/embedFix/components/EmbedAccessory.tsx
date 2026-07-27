/*
 * embedFix — Message accessory for incoming links.
 *
 * Renders a replacement embed for supported links, and hides Discord's own
 * embed only once that replacement actually exists.
 */

import { React } from "@webpack/common";

import { watchSuppression } from "../embedSuppressor";
import type { IncomingController } from "../incomingController";
import type { MediaProxy } from "../mediaProxy";
import {
    findCandidateLinks,
    planIncomingMessage,
    type CandidateLink,
    type IncomingPlan,
    type NativeEmbedLike,
} from "../incomingPlan";
import type { PlatformEntry } from "../providerMap";
import { EmbedCard } from "./EmbedCard";

export interface AccessoryDeps {
    getPlatforms: () => PlatformEntry[];
    controller: IncomingController;
    isEnabled: () => boolean;
    replaceOnlyWhenBetter: () => boolean;
    /** Fetches CSP-blocked media through the main process, on demand. */
    proxy?: MediaProxy | null;
}

interface MessageLike {
    id: string;
    channel_id: string;
    content: string;
    embeds?: NativeEmbedLike[];
}

function AccessoryInner({ message, deps }: { message: MessageLike; deps: AccessoryDeps; }) {
    const [, forceRender] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const planRef = React.useRef<IncomingPlan | null>(null);

    React.useEffect(
        () => deps.controller.subscribe(() => forceRender((n: number) => n + 1)),
        [deps.controller],
    );

    const platforms = deps.getPlatforms();
    const plan = planIncomingMessage({
        content: message.content,
        embeds: message.embeds,
        platforms,
        states: deps.controller.getStates(),
        replaceOnlyWhenBetter: deps.replaceOnlyWhenBetter(),
    });
    planRef.current = plan;

    // Kick off lookups for anything we have not seen. `ensure` is idempotent.
    const pendingKeys = plan.needsResolution.map(candidate => candidate.key).join("|");
    React.useEffect(() => {
        if (plan.needsResolution.length > 0) deps.controller.ensure(plan.needsResolution);
    }, [pendingKeys]);

    // Suppression follows the plan, and only the plan.
    const suppressKeys = plan.suppress.map(target => `${target.url}:${target.reason}`).join("|");
    React.useEffect(() => {
        const container = containerRef.current?.closest<HTMLElement>('[id^="message-accessories-"]');
        if (!container) return;
        return watchSuppression(container, () => planRef.current?.suppress ?? []);
    }, [message.id, suppressKeys]);

    const byKey = new Map<string, CandidateLink>(plan.candidates.map(candidate => [candidate.key, candidate]));

    return (
        <div className="vc-embedFix-accessory" ref={containerRef}>
            {plan.render.map(item => (
                <EmbedCard
                    key={item.key}
                    meta={item.meta}
                    providerUrl={item.providerUrl}
                    providerDomain={item.providerDomain}
                    proxy={deps.proxy}
                    onRefresh={() => {
                        const candidate = byKey.get(item.key);
                        if (candidate) deps.controller.refresh(candidate);
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Build the factory `addMessageAccessory` expects.
 *
 * It must be a plain `(props) => ReactNode` function — passing a component
 * class silently renders nothing.
 */
export function createEmbedAccessory(deps: AccessoryDeps) {
    return (props: Record<string, any>) => {
        if (!deps.isEnabled()) return null;

        const message = props.message as MessageLike | undefined;
        if (!message?.content) return null;

        // Cheap gate: mount nothing for the overwhelming majority of messages.
        const candidates = findCandidateLinks(message.content, deps.getPlatforms());
        if (!candidates.some(candidate => !candidate.isProviderLink)) return null;

        return <AccessoryInner message={message} deps={deps} />;
    };
}
