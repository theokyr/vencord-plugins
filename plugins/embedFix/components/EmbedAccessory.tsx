/*
 * EmbedAccessory — replacement embed for incoming messages using Discord's
 * native Embed component. Registered via addMessageAccessory.
 */

import { findComponentByCodeLazy } from "@webpack";

import { matchPlatform, type PlatformEntry } from "../providerMap";
import { stripTrackingParams, rewriteUrl } from "../urlRewriter";
import { ProbeCache } from "../probeCache";

// Discord's own Embed class component
const NativeEmbed = findComponentByCodeLazy("renderSuppressButton");

interface EmbedData {
    url: string;
    title: string | null;
    description: string | null;
    siteName: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    videoWidth: number | null;
    videoHeight: number | null;
    authorName: string | null;
    authorUrl: string | null;
    themeColor: string | null;
    type: string | null;
    error?: string;
}

// Per-URL embed data cache (in-memory, not persisted)
const embedDataCache = new Map<string, EmbedData | "pending">();
// Track which messages we've already logged for (reduce spam)
const loggedMessages = new Set<string>();
// Refresh listeners — called when the user clicks the refresh button on an indicator
const refreshListeners = new Set<(url: string) => void>();

/**
 * Trigger a re-fetch of embed data for a rewritten URL.
 * Called from the indicator icon click handler.
 */
export function triggerEmbedRefresh(rewrittenUrl: string) {
    console.log(`[EmbedFix] Refresh triggered for ${rewrittenUrl}`);
    embedDataCache.delete(rewrittenUrl);
    refreshListeners.forEach(fn => fn(rewrittenUrl));
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

function EmbedAccessoryInner({
    message,
    activePlatforms,
    probeCache,
}: {
    message: { content: string; id: string; channel_id: string; embeds?: any[] };
    activePlatforms: PlatformEntry[];
    probeCache: ProbeCache;
}) {
    const { React } = require("@webpack/common");
    const [embedData, setEmbedData] = React.useState<Map<string, EmbedData>>(new Map());
    const [refreshCounter, setRefreshCounter] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const shouldLog = !loggedMessages.has(message.id);

    // Listen for refresh triggers from the indicator icon
    React.useEffect(() => {
        const handler = (url: string) => {
            // If this message has this URL, force re-fetch
            setEmbedData(prev => {
                const next = new Map(prev);
                next.delete(url);
                return next;
            });
            setRefreshCounter(c => c + 1);
        };
        refreshListeners.add(handler);
        return () => { refreshListeners.delete(handler); };
    }, []);

    // Find matching URLs in message content
    const matchingUrls: { original: string; rewritten: string; platform: PlatformEntry }[] = [];
    const regex = new RegExp(URL_REGEX.source, "g");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(message.content)) !== null) {
        const platform = matchPlatform(m[1], activePlatforms);
        if (!platform) continue;

        let provider = probeCache.get(platform.id);
        if (!provider && platform.providers.length > 0) {
            provider = platform.providers[0].domain;
        }
        if (!provider) continue;

        const cleanUrl = stripTrackingParams(m[1], platform.stripParams ?? []);
        const rewritten = rewriteUrl(cleanUrl, provider);
        matchingUrls.push({ original: m[1], rewritten, platform });
    }

    if (shouldLog && matchingUrls.length > 0) {
        console.log(`[EmbedFix] Accessory: msg ${message.id} has ${matchingUrls.length} matching URL(s)`);
        loggedMessages.add(message.id);
    }

    // Suppress Discord's native embeds for URLs we're replacing
    React.useEffect(() => {
        if (matchingUrls.length === 0 || !containerRef.current) return;

        const originalDomains = new Set<string>();
        for (const { original } of matchingUrls) {
            try {
                const hostname = new URL(original).hostname;
                originalDomains.add(hostname);
                originalDomains.add(hostname.replace(STRIP_WWW, ""));
            } catch { /* skip */ }
        }

        const msgEl = containerRef.current.closest('[id^="message-accessories-"]');
        if (!msgEl) return;

        // Hide native embeds whose links match our platform domains
        // Discord renders embeds as <article class="embedFull__* embed__*">
        const nativeEmbeds = msgEl.querySelectorAll('article[class*="embed"]');
        const hidden: HTMLElement[] = [];
        for (const embedEl of nativeEmbeds) {
            // Skip our own synthetic embeds
            if ((embedEl as HTMLElement).dataset.embedfix) continue;

            const links = embedEl.querySelectorAll('a[href]');
            for (const link of links) {
                try {
                    const hostname = new URL((link as HTMLAnchorElement).href).hostname;
                    const normalized = hostname.replace(STRIP_WWW, "");
                    if (originalDomains.has(hostname) || originalDomains.has(normalized)) {
                        (embedEl as HTMLElement).style.display = "none";
                        hidden.push(embedEl as HTMLElement);
                        break;
                    }
                } catch { /* skip */ }
            }
        }

        if (hidden.length > 0) {
            console.log(`[EmbedFix] Suppress: hid ${hidden.length} native embed(s) for msg ${message.id}`);
        }

        return () => {
            for (const el of hidden) el.style.display = "";
        };
    });

    // Fetch embed data from provider URLs
    React.useEffect(() => {
        if (matchingUrls.length === 0) return;

        const Native = getNative();
        if (!Native?.fetchEmbedData) return;

        let cancelled = false;

        for (const { rewritten } of matchingUrls) {
            const cached = embedDataCache.get(rewritten);
            if (cached && cached !== "pending") {
                setEmbedData(prev => new Map(prev).set(rewritten, cached));
                continue;
            }
            if (cached === "pending") continue;

            embedDataCache.set(rewritten, "pending");
            console.log(`[EmbedFix] Fetching embed: ${rewritten}`);

            Native.fetchEmbedData(rewritten).then((data: EmbedData) => {
                if (cancelled) return;
                if (!data.error && (data.title || data.imageUrl || data.videoUrl)) {
                    console.log(`[EmbedFix] Got embed: ${rewritten} — ${data.title ?? "(no title)"} ${data.videoUrl ? "(video)" : data.imageUrl ? "(image)" : "(text)"}`);
                    embedDataCache.set(rewritten, data);
                    setEmbedData(prev => new Map(prev).set(rewritten, data));
                } else {
                    console.log(`[EmbedFix] No usable data: ${rewritten} — ${data.error ?? "missing title/image/video"}`);
                    embedDataCache.delete(rewritten);
                }
            }).catch((e: any) => {
                console.error(`[EmbedFix] Fetch failed: ${rewritten}`, e);
                embedDataCache.delete(rewritten);
            });
        }

        return () => { cancelled = true; };
    }, [message.id, refreshCounter]);

    if (matchingUrls.length === 0) return null;

    const embeds = matchingUrls
        .map(({ rewritten }) => {
            const data = embedData.get(rewritten);
            if (!data) return null;
            const syntheticEmbed = buildSyntheticEmbed(data, rewritten);
            return (
                <div key={rewritten} data-embedfix="true" style={{ marginTop: "4px" }}>
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
    probeCache: ProbeCache,
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
            if (matchPlatform(m[1], getActivePlatforms())) {
                hasMatch = true;
                break;
            }
        }
        if (!hasMatch) return null;

        return (
            <EmbedAccessoryInner
                message={message}
                activePlatforms={getActivePlatforms()}
                probeCache={probeCache}
            />
        );
    };
}
