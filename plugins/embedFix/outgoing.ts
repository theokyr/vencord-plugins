/*
 * embedFix — Outgoing message pipeline.
 *
 * Sending is latency-sensitive, so a link is only rewritten inline when we
 * already know which provider renders it. Anything unknown is sent clean and
 * fixed by a follow-up edit once every provider has been checked *for that
 * link* — provider support is per-link, not per-platform.
 *
 * Pure TypeScript so the whole flow can be tested without Discord.
 */

import type { PlatformEntry } from "./providerMap";
import { rewriteMessageContent, type RewriteResult } from "./urlRewriter";

/** What we know about a link at send time. */
export type LinkKnowledge =
    | { status: "provider"; domain: string; label: string }
    /** Checked recently; no provider can render it. Send it clean, don't retry. */
    | { status: "none" }
    /** Never checked. Send it clean and probe in the background. */
    | { status: "unknown" };

export type KnowledgeLookup = (cleanUrl: string, platformId: string) => LinkKnowledge;

export interface DeferredLink {
    /** URL as it appears in the sent content. */
    sentUrl: string;
    cleanUrl: string;
    /** Offset into the *sent* content. */
    offset: number;
    platformId: string;
}

export interface OutgoingPlan {
    content: string;
    changed: boolean;
    /** Links rewritten inline before the message left. */
    applied: RewriteResult["rewrites"];
    /** Links that still need a background check plus an edit. */
    deferred: DeferredLink[];
}

/**
 * Decide what the outgoing message body should be.
 *
 * Links with a known provider are rewritten in place. Links known to be
 * unsupported are left clean and NOT queued — retrying them on every send is
 * how the old version burned requests. Unknown links are queued.
 */
export function planOutgoing(
    content: string,
    platforms: PlatformEntry[],
    enabledMap: Record<string, boolean>,
    lookup: KnowledgeLookup,
): OutgoingPlan {
    const knowledge = new Map<string, LinkKnowledge>();

    const result = rewriteMessageContent(
        content,
        platforms,
        (platformId, cleanUrl) => {
            let known = knowledge.get(cleanUrl);
            if (!known) {
                known = lookup(cleanUrl, platformId);
                knowledge.set(cleanUrl, known);
            }
            return known.status === "provider"
                ? { domain: known.domain, label: known.label }
                : null;
        },
        enabledMap,
    );

    const deferred: DeferredLink[] = result.cacheMisses
        .filter(miss => (knowledge.get(miss.cleanUrl)?.status ?? "unknown") === "unknown")
        .map(miss => ({
            sentUrl: miss.cleanUrl,
            cleanUrl: miss.cleanUrl,
            offset: miss.offset,
            platformId: miss.platformId,
        }));

    return {
        content: result.content,
        changed: result.content !== content,
        applied: result.rewrites,
        deferred,
    };
}

export interface Replacement {
    offset: number;
    from: string;
    to: string;
}

/**
 * Splice resolved rewrites back into a sent message.
 *
 * Replacements are applied back-to-front so earlier offsets stay valid, and
 * each one is verified against the text actually at that offset. If the
 * message no longer looks the way we sent it (someone edited it, or another
 * plugin rewrote it) the replacement is dropped rather than corrupting text.
 */
export function applyReplacements(content: string, replacements: Replacement[]): { content: string; applied: number; skipped: number } {
    let applied = 0;
    let skipped = 0;

    const ordered = [...replacements].sort((a, b) => b.offset - a.offset);
    let result = content;

    for (const replacement of ordered) {
        if (replacement.from === replacement.to) {
            skipped++;
            continue;
        }
        const slice = result.slice(replacement.offset, replacement.offset + replacement.from.length);
        if (slice !== replacement.from) {
            skipped++;
            continue;
        }
        result =
            result.slice(0, replacement.offset)
            + replacement.to
            + result.slice(replacement.offset + replacement.from.length);
        applied++;
    }

    return { content: result, applied, skipped };
}

/**
 * Key a queued message by channel + exact body.
 *
 * The previous implementation keyed on a timestamp and matched the first
 * pending entry for the channel, so two messages sent in quick succession
 * could have their edits swapped. Matching on the body we actually sent is
 * exact.
 */
export function pendingKey(channelId: string, content: string): string {
    // JSON encoding keeps the two halves unambiguous - there is no separator
    // character a message could contain to forge a collision.
    return JSON.stringify([channelId, content]);
}
