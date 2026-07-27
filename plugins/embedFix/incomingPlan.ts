/*
 * embedFix — Incoming message planning.
 *
 * Decides, for one message, which links get a replacement embed and which of
 * Discord's own embeds may be hidden. Every rule lives here as a pure function
 * so the behaviour is testable without a renderer.
 *
 * The invariant that the previous implementation violated, and the reason
 * incoming rewriting never worked:
 *
 *     A native embed is only ever hidden once a working replacement for that
 *     exact link exists. Pending and failed lookups leave Discord alone.
 */

import { EmbedScore, scoreEmbedMeta, type EmbedMeta } from "./embedMeta";
import { resolvePlatformUrl, type PlatformEntry } from "./providerMap";
import { canonicalUrlKey, hasEmbeddablePath, resourcePathKey, stripTrackingParams } from "./urlRewriter";

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

export interface CandidateLink {
    /** The URL exactly as it appears in the message. */
    original: string;
    /** Tracking params stripped. */
    cleanUrl: string;
    /** Canonical cache key. */
    key: string;
    platform: PlatformEntry;
    /** The message already points at a provider domain — nothing to fix. */
    isProviderLink: boolean;
}

/** The parts of Discord's embed object we care about. */
export interface NativeEmbedLike {
    url?: string | null;
    rawUrl?: string | null;
    type?: string | null;
    rawTitle?: string | null;
    rawDescription?: string | null;
    provider?: { name?: string | null; url?: string | null } | null;
    author?: { name?: string | null; url?: string | null } | null;
    image?: unknown;
    thumbnail?: unknown;
    video?: unknown;
}

export type LinkState =
    | { status: "pending" }
    | { status: "unresolved" }
    | { status: "resolved"; providerDomain: string; providerUrl: string; meta: EmbedMeta };

export interface PlannedEmbed {
    key: string;
    sourceUrl: string;
    providerDomain: string;
    providerUrl: string;
    meta: EmbedMeta;
    /** Why we are rendering: Discord had nothing, or ours is better. */
    reason: "no-native-embed" | "better-than-native";
}

export interface SuppressTarget {
    /** Native embed indexes, as they appear in `message.embeds`. */
    index: number;
    /** The URL that embed is for. */
    url: string;
    reason: "replaced" | "stale";
}

export interface IncomingPlan {
    candidates: CandidateLink[];
    /** Links with no fresh answer yet — the caller should resolve these. */
    needsResolution: CandidateLink[];
    render: PlannedEmbed[];
    suppress: SuppressTarget[];
}

export interface PlanInput {
    content: string;
    embeds?: NativeEmbedLike[] | null;
    platforms: PlatformEntry[];
    /** Resolution state per canonical key. Missing = not looked at yet. */
    states: Map<string, LinkState> | Record<string, LinkState>;
    /**
     * Only replace Discord's embed when ours scores strictly higher.
     * Default true — a fine native embed should be left alone.
     */
    replaceOnlyWhenBetter?: boolean;
}

/** Every supported social link in a message, in order of appearance. */
export function findCandidateLinks(content: string, platforms: PlatformEntry[]): CandidateLink[] {
    const seen = new Set<string>();
    const candidates: CandidateLink[] = [];
    const regex = new RegExp(URL_REGEX.source, "g");

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        const original = match[1];
        const resolved = resolvePlatformUrl(original, platforms);
        if (!resolved) continue;
        // A bare domain or home page has no post to embed.
        if (!hasEmbeddablePath(original)) continue;

        const cleanUrl = stripTrackingParams(original, resolved.platform.stripParams ?? []);
        const key = canonicalUrlKey(cleanUrl);
        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
            original,
            cleanUrl,
            key,
            platform: resolved.platform,
            isProviderLink: resolved.isProviderDomain,
        });
    }

    return candidates;
}

/** Rate one of Discord's own embeds on the same 0..4 scale as ours. */
export function scoreNativeEmbed(embed: NativeEmbedLike | null | undefined): number {
    if (!embed) return EmbedScore.NONE;

    const hasTitle = !!embed.rawTitle;
    const hasDescription = !!embed.rawDescription;
    const hasImage = !!(embed.image ?? embed.thumbnail);
    const hasVideo = !!embed.video || embed.type === "video" || embed.type === "gifv";

    if (hasVideo && (hasTitle || hasImage)) return EmbedScore.MEDIA;
    if (hasVideo) return EmbedScore.IMAGE;
    if (hasImage && hasTitle && hasDescription) return EmbedScore.RICH;
    if (hasImage && (hasTitle || hasDescription)) return EmbedScore.IMAGE;
    if (hasTitle || hasDescription) return EmbedScore.TITLE_ONLY;
    return EmbedScore.NONE;
}

/** Every URL a native embed could be identified by. */
export function embedUrlCandidates(embed: NativeEmbedLike | null | undefined): string[] {
    if (!embed) return [];
    return [embed.url, embed.rawUrl, embed.provider?.url, embed.author?.url]
        .filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Which candidate link is this native embed for?
 *
 * Matches on host+path so `?s=20` tracking junk on one side does not break the
 * pairing, and only ever pairs an embed with a link on the same platform.
 */
export function matchEmbedToCandidate(
    embed: NativeEmbedLike,
    candidates: CandidateLink[],
    options: { hostFallback?: boolean } = {},
): CandidateLink | null {
    const embedKeys = new Set(
        embedUrlCandidates(embed)
            .map(resourcePathKey)
            .filter((key): key is string => !!key),
    );
    if (embedKeys.size === 0) return null;

    for (const candidate of candidates) {
        const candidateKeys = [
            resourcePathKey(candidate.original),
            resourcePathKey(candidate.cleanUrl),
        ].filter((key): key is string => !!key);

        if (candidateKeys.some(key => embedKeys.has(key))) return candidate;
    }

    // Same post, different host for the same platform. Discord rewrites x.com
    // links to twitter.com in the embeds it returns, so the host will routinely
    // differ from what the sender typed. Pair on the path as long as both hosts
    // belong to the same platform — a path like /user/status/123 identifies the
    // post on its own, and the platform check keeps it from matching anything
    // unrelated.
    const embedUrls = embedUrlCandidates(embed);
    for (const candidate of candidates) {
        const platformHosts = new Set([
            ...candidate.platform.domains,
            ...candidate.platform.providers.map(provider => provider.domain),
        ]);
        const candidatePaths = new Set(
            [candidate.original, candidate.cleanUrl]
                .map(pathOf)
                .filter((path): path is string => !!path && path !== "/"),
        );

        const paired = embedUrls.some(url => {
            const host = hostOf(url);
            const path = pathOf(url);
            return !!host && !!path && platformHosts.has(host) && candidatePaths.has(path);
        });
        if (paired) return candidate;
    }

    // Author/provider links point at a profile, not the post — fall back to
    // pairing by host alone when exactly one candidate uses that platform.
    // This is a weak match: it proves the embed relates to the platform, not
    // that it is for a link still present in the message.
    if (options.hostFallback === false) return null;

    const embedHosts = new Set(
        embedUrlCandidates(embed)
            .map(hostOf)
            .filter((host): host is string => !!host),
    );

    const byHost = candidates.filter(candidate => {
        const platformHosts = [
            ...candidate.platform.domains,
            ...candidate.platform.providers.map(provider => provider.domain),
        ];
        return platformHosts.some(host => embedHosts.has(host));
    });

    return byHost.length === 1 ? byHost[0] : null;
}

function hostOf(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^(?:www|m|mobile|old)\./, "");
    } catch {
        return null;
    }
}

/** Path only, trailing slash removed. Identifies a post independent of host. */
function pathOf(url: string): string | null {
    try {
        const { pathname } = new URL(url);
        return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    } catch {
        return null;
    }
}

function toStateMap(states: PlanInput["states"]): Map<string, LinkState> {
    return states instanceof Map ? states : new Map(Object.entries(states));
}

/**
 * Build the render/suppress plan for one message.
 *
 * Ordering of the rules matters:
 *  1. Provider links are left completely alone — the sender already fixed them.
 *  2. A native embed whose URL is no longer in the message is stale (the sender
 *     edited it, e.g. our own deferred rewrite) and is always hidden.
 *  3. A candidate only produces a replacement when it has a resolved provider
 *     AND either Discord produced nothing or ours scores higher.
 *  4. A native embed is hidden only when its candidate is in `render`.
 */
export function planIncomingMessage(input: PlanInput): IncomingPlan {
    const { content, platforms } = input;
    const replaceOnlyWhenBetter = input.replaceOnlyWhenBetter ?? true;
    const states = toStateMap(input.states);
    const embeds = input.embeds ?? [];

    const candidates = findCandidateLinks(content, platforms);
    const fixable = candidates.filter(candidate => !candidate.isProviderLink);

    // Pair every native embed with the link it belongs to, once.
    const pairing = embeds.map((embed, index) => ({
        index,
        embed,
        // Strong: the embed's path identifies one of the message's links.
        // Weak: only the platform matches, via the host fallback.
        strong: matchEmbedToCandidate(embed, candidates, { hostFallback: false }),
        candidate: matchEmbedToCandidate(embed, candidates),
    }));

    const nativeFor = new Map<string, { index: number; embed: NativeEmbedLike }>();
    for (const { index, embed, candidate } of pairing) {
        if (candidate && !nativeFor.has(candidate.key)) {
            nativeFor.set(candidate.key, { index, embed });
        }
    }

    const render: PlannedEmbed[] = [];
    const needsResolution: CandidateLink[] = [];
    const replacedKeys = new Set<string>();

    for (const candidate of fixable) {
        const state = states.get(candidate.key);

        if (!state || state.status === "pending") {
            if (!state) needsResolution.push(candidate);
            continue;
        }
        if (state.status === "unresolved") continue;

        const ourScore = scoreEmbedMeta(state.meta);
        if (ourScore <= EmbedScore.NONE) continue;

        const native = nativeFor.get(candidate.key);
        const nativeScore = scoreNativeEmbed(native?.embed);

        let reason: PlannedEmbed["reason"];
        if (!native) {
            reason = "no-native-embed";
        } else if (!replaceOnlyWhenBetter || ourScore >= nativeScore) {
            // A tie goes to the provider: it is the one the user picked, and
            // for the common case (a photo tweet where Discord and the provider
            // both manage title+image+description) requiring a strict win meant
            // the plugin silently did nothing at all. Only a genuine downgrade
            // — Discord has media the provider could not get — is skipped.
            reason = "better-than-native";
        } else {
            continue;
        }

        render.push({
            key: candidate.key,
            sourceUrl: candidate.cleanUrl,
            providerDomain: state.providerDomain,
            providerUrl: state.providerUrl,
            meta: state.meta,
            reason,
        });
        replacedKeys.add(candidate.key);
    }

    const suppress: SuppressTarget[] = [];
    const contentKeys = new Set(candidates.map(candidate => resourcePathKey(candidate.original)).filter(Boolean) as string[]);
    for (const candidate of candidates) {
        const cleanKey = resourcePathKey(candidate.cleanUrl);
        if (cleanKey) contentKeys.add(cleanKey);
    }

    for (const { index, embed, candidate, strong } of pairing) {
        const url = embedUrlCandidates(embed)[0];
        if (!url) continue;

        if (candidate && (strong || replacedKeys.has(candidate.key))) {
            // Paired with a link that is still in the message. Hide it only if
            // we actually produced a replacement — anything else (pending, no
            // working provider, native embed already better) must leave
            // Discord's embed exactly where it is.
            if (replacedKeys.has(candidate.key)) {
                suppress.push({ index, url, reason: "replaced" });
            }
            continue;
        }

        // Stale: the embed belongs to a supported platform but pairs with no
        // link in the message — our own deferred rewrite replaced the URL, or
        // the sender edited it. Comparing host+path here is not enough on its
        // own (Discord hands back twitter.com for an x.com link), which is why
        // this only runs for embeds `matchEmbedToCandidate` could not attribute.
        const embedKey = resourcePathKey(url);
        const known = !!resolvePlatformUrl(url, platforms);
        if (known && embedKey && !contentKeys.has(embedKey)) {
            suppress.push({ index, url, reason: "stale" });
        }
    }

    return { candidates, needsResolution, render, suppress };
}
