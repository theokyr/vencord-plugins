/*
 * EmbedAccessory — replacement embed for incoming messages using Discord's
 * native Embed component. Registered via addMessageAccessory.
 */

import { findComponentByCodeLazy } from "@webpack";

import { refreshFallbackEmbed, type EmbedData, type RefreshFallbackContext } from "../fallbackEmbed";
import { resolvePlatformUrl, type PlatformEntry, type ProviderDef } from "../providerMap";
import { stripTrackingParams, rewriteUrl } from "../urlRewriter";

// Discord's own Embed class component
const NativeEmbed = findComponentByCodeLazy("renderSuppressButton");

interface ResolvedEmbed {
    rewritten: string;
    data: EmbedData;
}

// Per-URL embed data cache (in-memory, not persisted)
const embedDataCache = new Map<string, EmbedData | "pending">();
const embedResolutionCache = new Map<string, ResolvedEmbed | "pending">();
// Track which messages we've already logged for (reduce spam)
const loggedMessages = new Set<string>();
// Refresh listeners — called when the user clicks the refresh button on an indicator
const refreshListeners = new Set<(url: string) => void>();

/**
 * Trigger a re-fetch of embed data for a rewritten URL.
 * Called from the indicator icon click handler.
 */
export function triggerEmbedRefresh(rewrittenUrl: string, context: RefreshFallbackContext = {}) {
    console.log(`[EmbedFix] Refresh triggered for ${rewrittenUrl}`);
    embedDataCache.delete(rewrittenUrl);
    for (const [key, value] of embedResolutionCache.entries()) {
        if (value !== "pending" && value.rewritten === rewrittenUrl) {
            embedResolutionCache.delete(key);
        }
    }
    refreshListeners.forEach(fn => fn(rewrittenUrl));
    refreshFallbackEmbed({ rewrittenUrl, ...context }).catch(e => {
        console.error(`[EmbedFix] Fallback refresh failed: ${rewrittenUrl}`, e);
    });
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const STRIP_WWW = /^(www|m|mobile|old)\./;

function getNative(): any {
    try {
        return (window as any).VencordNative?.pluginHelpers?.EmbedFix ?? null;
    } catch {
        return null;
    }
}

let embedIdCounter = 0;

/** Build a synthetic embed object matching Discord's internal format */
function buildSyntheticEmbed(data: EmbedData, rewrittenUrl: string): any {
    const embed: any = {
        id: `embedfix_${++embedIdCounter}`,
        url: rewrittenUrl,
        type: "article",
        rawTitle: data.title ?? undefined,
        rawDescription: data.description ?? undefined,
        referenceId: null,
        flags: 0,
        contentScanVersion: 0,
        fields: [],
    };

    if (data.siteName) {
        embed.provider = { name: data.siteName };
    }

    if (data.authorName) {
        embed.author = {
            name: data.authorName,
            url: data.authorUrl ?? undefined,
        };
    }

    if (data.themeColor) {
        embed.color = data.themeColor;
    }

    // Use image as thumbnail for article-type embeds (renders on the right side)
    // or as the main image
    if (data.imageUrl) {
        embed.thumbnail = {
            url: data.imageUrl,
            width: data.videoWidth ?? 400,
            height: data.videoHeight ?? 300,
            srcIsAnimated: false,
            flags: 0,
        };
    }

    // Add footer
    embed.footer = {
        text: "via EmbedFix",
    };

    return embed;
}

function isUsableEmbedData(data: EmbedData): boolean {
    return !data.error && !!(data.title || data.imageUrl || data.videoUrl);
}

function normalizeHostname(hostname: string): string {
    return hostname.replace(STRIP_WWW, "");
}

function collectEmbedUrlCandidates(embed: any): string[] {
    const candidates = [
        embed?.url,
        embed?.rawUrl,
        embed?.provider?.url,
        embed?.author?.url,
    ];

    return candidates.filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

function urlMatchesDomains(url: string, domains: Set<string>): boolean {
    try {
        const hostname = new URL(url).hostname;
        return domains.has(hostname) || domains.has(normalizeHostname(hostname));
    } catch {
        return false;
    }
}

async function fetchFirstUsableEmbed(Native: any, cleanUrl: string, providers: ProviderDef[]): Promise<ResolvedEmbed | null> {
    for (const provider of providers) {
        const rewritten = rewriteUrl(cleanUrl, provider.domain);

        const cached = embedDataCache.get(rewritten);
        if (cached && cached !== "pending" && isUsableEmbedData(cached)) {
            return { rewritten, data: cached };
        }
        if (cached === "pending") continue;

        embedDataCache.set(rewritten, "pending");
        console.log(`[EmbedFix] Fetching embed: ${rewritten}`);

        try {
            const data = await Native.fetchEmbedData(rewritten) as EmbedData;
            if (isUsableEmbedData(data)) {
                console.log(`[EmbedFix] Got embed: ${rewritten} — ${data.title ?? "(no title)"} ${data.videoUrl ? "(video)" : data.imageUrl ? "(image)" : "(text)"}`);
                embedDataCache.set(rewritten, data);
                return { rewritten, data };
            }

            console.log(`[EmbedFix] No usable data: ${rewritten} — ${data.error ?? "missing title/image/video"}`);
            embedDataCache.delete(rewritten);
        } catch (e) {
            console.error(`[EmbedFix] Fetch failed: ${rewritten}`, e);
            embedDataCache.delete(rewritten);
        }
    }

    return null;
}

function EmbedAccessoryInner({
    message,
    activePlatforms,
}: {
    message: { content: string; id: string; channel_id: string; embeds?: any[] };
    activePlatforms: PlatformEntry[];
}) {
    const { React } = require("@webpack/common");
    const [embedData, setEmbedData] = React.useState<Map<string, ResolvedEmbed>>(new Map());
    const [refreshCounter, setRefreshCounter] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const shouldLog = !loggedMessages.has(message.id);

    // Listen for refresh triggers from the indicator icon
    React.useEffect(() => {
        const handler = (url: string) => {
            // If this message has this URL, force re-fetch
            setEmbedData(prev => {
                const next = new Map(prev);
                for (const [key, value] of next.entries()) {
                    if (value.rewritten === url) next.delete(key);
                }
                return next;
            });
            setRefreshCounter(c => c + 1);
        };
        refreshListeners.add(handler);
        return () => { refreshListeners.delete(handler); };
    }, []);

    // Find matching URLs in message content
    const matchingUrls: { original: string; cleanUrl: string; rewritten: string; platform: PlatformEntry; providers: ProviderDef[] }[] = [];
    const regex = new RegExp(URL_REGEX.source, "g");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(message.content)) !== null) {
        const resolved = resolvePlatformUrl(m[1], activePlatforms);
        if (!resolved) continue;

        const platform = resolved.platform;
        const providers = resolved.provider
            ? [resolved.provider, ...platform.providers.filter(provider => provider.domain !== resolved.provider?.domain)]
            : platform.providers;
        const provider = providers[0]?.domain;
        if (!provider) continue;

        const cleanUrl = stripTrackingParams(m[1], platform.stripParams ?? []);
        const rewritten = rewriteUrl(cleanUrl, provider);
        matchingUrls.push({ original: m[1], cleanUrl, rewritten, platform, providers });
    }

    if (shouldLog && matchingUrls.length > 0) {
        console.log(`[EmbedFix] Accessory: msg ${message.id} has ${matchingUrls.length} matching URL(s)`);
        loggedMessages.add(message.id);
    }

    // Suppress Discord's native embeds for URLs we're replacing. Discord can
    // render native embeds after our accessory mounts, so keep watching the
    // accessories container instead of doing a one-shot scan.
    React.useEffect(() => {
        if (matchingUrls.length === 0 || !containerRef.current) return;

        const originalDomains = new Set<string>();
        for (const { original } of matchingUrls) {
            try {
                const hostname = new URL(original).hostname;
                originalDomains.add(hostname);
                originalDomains.add(normalizeHostname(hostname));
            } catch { /* skip */ }
        }
        for (const { platform } of matchingUrls) {
            for (const domain of platform.domains) originalDomains.add(domain);
            for (const provider of platform.providers) originalDomains.add(provider.domain);
        }

        const msgEl = containerRef.current.closest('[id^="message-accessories-"]');
        if (!msgEl) return;

        const suppressedIndexes = new Set<number>();
        for (const [index, embed] of (message.embeds ?? []).entries()) {
            if (collectEmbedUrlCandidates(embed).some(url => urlMatchesDomains(url, originalDomains))) {
                suppressedIndexes.add(index);
            }
        }

        const hidden = new Set<HTMLElement>();
        const hideMatchingEmbeds = () => {
            const nativeEmbeds = Array.from(msgEl.querySelectorAll<HTMLElement>('article[class*="embed"]'))
                .filter(embedEl => !embedEl.dataset.embedfix);

            nativeEmbeds.forEach((embedEl, index) => {
                if (hidden.has(embedEl)) return;

                let shouldHide = suppressedIndexes.has(index);
                if (!shouldHide) {
                    const links = embedEl.querySelectorAll('a[href]');
                    for (const link of links) {
                        if (urlMatchesDomains((link as HTMLAnchorElement).href, originalDomains)) {
                            shouldHide = true;
                            break;
                        }
                    }
                }

                if (!shouldHide) return;

                embedEl.style.display = "none";
                hidden.add(embedEl);
            });

            if (hidden.size > 0) {
                console.log(`[EmbedFix] Suppress: hid ${hidden.size} native embed(s) for msg ${message.id}`);
            }
        };

        hideMatchingEmbeds();
        const observer = new MutationObserver(hideMatchingEmbeds);
        observer.observe(msgEl, { childList: true, subtree: true });
        const timers = [
            window.setTimeout(hideMatchingEmbeds, 250),
            window.setTimeout(hideMatchingEmbeds, 1000),
        ];

        return () => {
            observer.disconnect();
            timers.forEach(timer => window.clearTimeout(timer));
            for (const el of hidden) el.style.display = "";
        };
    }, [message.id, matchingUrls.map(match => match.original).join("|")]);

    // Fetch embed data from provider URLs, falling through provider priority on
    // per-link HTTP errors or missing metadata.
    React.useEffect(() => {
        if (matchingUrls.length === 0) return;

        const Native = getNative();
        if (!Native?.fetchEmbedData) return;

        let cancelled = false;

        for (const match of matchingUrls) {
            const cacheKey = match.cleanUrl;
            const cached = embedResolutionCache.get(cacheKey);
            if (cached && cached !== "pending") {
                setEmbedData(prev => new Map(prev).set(cacheKey, cached));
                continue;
            }
            if (cached === "pending") continue;

            embedResolutionCache.set(cacheKey, "pending");
            fetchFirstUsableEmbed(Native, match.cleanUrl, match.providers).then(resolved => {
                if (resolved) {
                    embedResolutionCache.set(cacheKey, resolved);
                    if (cancelled) return;
                    setEmbedData(prev => new Map(prev).set(cacheKey, resolved));
                    return;
                }

                embedResolutionCache.delete(cacheKey);
                if (cancelled) return;
            }).catch((e: any) => {
                console.error(`[EmbedFix] Provider fallback failed: ${match.cleanUrl}`, e);
                embedResolutionCache.delete(cacheKey);
            });
        }

        return () => { cancelled = true; };
    }, [message.id, refreshCounter, matchingUrls.map(match => match.cleanUrl).join("|")]);

    if (matchingUrls.length === 0) return null;

    const embeds = matchingUrls
        .map(({ cleanUrl }) => {
            const resolved = embedData.get(cleanUrl);
            if (!resolved) return null;
            const syntheticEmbed = buildSyntheticEmbed(resolved.data, resolved.rewritten);
            return (
                <div key={resolved.rewritten} data-embedfix="true" style={{ marginTop: "4px" }}>
                    <NativeEmbed embed={syntheticEmbed} />
                </div>
            );
        })
        .filter(Boolean);

    return (
        <div ref={containerRef} className="vc-embedFix-accessory">
            {embeds}
        </div>
    );
}

/**
 * Create the MessageAccessory factory function.
 * addMessageAccessory expects (props) => ReactNode, NOT a component class.
 * ErrorBoundary.wrap returns a component class — so we wrap it in a factory.
 */
export function createEmbedAccessory(
    getActivePlatforms: () => PlatformEntry[],
    isEnabled: () => boolean,
) {
    // Factory function that addMessageAccessory will call with message props
    return (props: Record<string, any>) => {
        if (!isEnabled()) return null;
        const message = props.message;
        if (!message?.content) return null;

        // Check if message has any matching URLs before rendering the component
        const regex = new RegExp(URL_REGEX.source, "g");
        let hasMatch = false;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(message.content)) !== null) {
            if (resolvePlatformUrl(m[1], getActivePlatforms())) {
                hasMatch = true;
                break;
            }
        }
        if (!hasMatch) return null;

        return (
            <EmbedAccessoryInner
                message={message}
                activePlatforms={getActivePlatforms()}
            />
        );
    };
}
