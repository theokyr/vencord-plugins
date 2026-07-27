import { matchPlatform } from "./providerMap";
import type { PlatformEntry, ProviderDef } from "./providerMap";

export type { PlatformEntry, ProviderDef };

/**
 * Global tracking query params to strip from all URLs, regardless of platform.
 * Mirrors the ClearURLs project list for the most common trackers.
 */
export const GLOBAL_STRIP_PARAMS: string[] = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "si",
    "igshid",
    "ref",
    "ref_src",
    "ref_url",
    "feature",
    "fbclid",
    "gclid",
    "t",
    "share_id",
    "amp",
];

export interface UrlMatch {
    url: string;
    offset: number;
}

export interface RewriteResult {
    content: string;
    rewrites: {
        original: string;
        rewritten: string;
        cleanUrl: string;
        offset: number;
        platformId: string;
        providerDomain: string;
    }[];
    cacheMisses: { url: string; cleanUrl: string; offset: number; platformId: string }[];
}

/** URL regex matching HTTP(S) URLs — same pattern used by ClearURLs plugin. */
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

/**
 * Scan `text` for HTTP(S) URLs.
 * If `platforms` is provided, only return URLs that match a known platform
 * (using `matchPlatform`). Provider/embed domains are excluded automatically
 * because `matchPlatform` does not match them.
 */
export function extractUrls(text: string, platforms?: PlatformEntry[]): UrlMatch[] {
    const results: UrlMatch[] = [];
    const regex = new RegExp(URL_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const url = match[1];
        const offset = match.index;

        if (platforms) {
            const platform = matchPlatform(url, platforms);
            if (!platform) continue;
            // A bare domain has nothing to embed.
            if (!hasEmbeddablePath(url)) continue;
        }

        results.push({ url, offset });
    }

    return results;
}

/**
 * Remove tracking query params from a URL.
 * Strips all params in `GLOBAL_STRIP_PARAMS` plus any additional
 * `platformParams`. Non-tracking params are preserved.
 * Removes the trailing `?` if no query params remain.
 */
export function stripTrackingParams(urlStr: string, platformParams: string[]): string {
    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        return urlStr;
    }

    const toStrip = new Set([...GLOBAL_STRIP_PARAMS, ...platformParams]);
    const keysToDelete: string[] = [];

    for (const key of parsed.searchParams.keys()) {
        if (toStrip.has(key)) {
            keysToDelete.push(key);
        }
    }

    for (const key of keysToDelete) {
        parsed.searchParams.delete(key);
    }

    // Build the final URL — if no params left, drop the trailing ?
    let result = parsed.toString();
    if (!parsed.search) {
        // URL.toString() already omits ? when searchParams is empty
        // but double-check by removing any trailing ? that may remain
        result = result.replace(/\?$/, "");
    }

    return result;
}

/**
 * Swap the hostname of `urlStr` to `providerDomain`, preserving path,
 * query string, and fragment. Also strips a `www.` prefix from the
 * original hostname if present.
 */
export function rewriteUrl(urlStr: string, providerDomain: string): string {
    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        return urlStr;
    }

    // Replace hostname — strip leading www. from original
    parsed.hostname = providerDomain;
    // Providers are HTTPS-only; a http:// source would otherwise be probed
    // insecurely and usually redirect anyway.
    if (parsed.protocol === "http:") parsed.protocol = "https:";

    return parsed.toString();
}

/** Subdomains that never change which resource a URL points at. */
const NOISE_SUBDOMAIN = /^(?:www|m|mobile|old)\./;

/**
 * Stable cache key for a link.
 *
 * Two URLs that address the same post must collapse to the same key, so
 * `https://www.Twitter.com/a/status/1/` and `http://twitter.com/a/status/1`
 * are resolved once. The fragment is dropped (it never changes the embed) but
 * the query string is kept and sorted, because it can select a photo or a
 * comment thread.
 */
export function canonicalUrlKey(urlStr: string): string {
    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        return urlStr.trim().toLowerCase();
    }

    const host = parsed.hostname.toLowerCase().replace(NOISE_SUBDOMAIN, "");
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    const params = [...parsed.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = params.length > 0
        ? `?${params.map(([key, value]) => `${key}=${value}`).join("&")}`
        : "";

    return `${host}${path}${query}`;
}

/**
 * Do two URLs address the same resource, ignoring scheme, noise subdomains,
 * trailing slashes and the fragment? Host must match — use this only after
 * platform matching has already established the domains are related.
 */
export function sameResource(a: string, b: string): boolean {
    return canonicalUrlKey(a) === canonicalUrlKey(b);
}

/**
 * Is there actually a post at this URL?
 *
 * A bare `https://x.com` or `https://reddit.com/` addresses a home page, not
 * content — rewriting it to a provider domain produces a broken link and a
 * wasted probe.
 */
export function hasEmbeddablePath(urlStr: string): boolean {
    try {
        const { pathname } = new URL(urlStr);
        return pathname.replace(/\/+$/, "").length > 0;
    } catch {
        return false;
    }
}

/** Host + path key, ignoring the query string entirely. */
export function resourcePathKey(urlStr: string): string | null {
    try {
        const parsed = new URL(urlStr);
        let path = parsed.pathname;
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
        return `${parsed.hostname.toLowerCase().replace(NOISE_SUBDOMAIN, "")}${path}`;
    } catch {
        return null;
    }
}

/**
 * Process a message's text content:
 *  1. Scan for platform-matching URLs.
 *  2. For each URL: strip tracking params.
 *  3. Check `getProvider(platformId)` for a cached provider.
 *     - Cache hit  → rewrite URL in content, record in `rewrites`.
 *     - Cache miss → still use cleaned URL, record in `cacheMisses`.
 *  4. Replacements are applied in REVERSE offset order so earlier offsets
 *     remain valid after string splicing.
 *
 * @param content      Raw message text
 * @param platforms    Platform definitions to match against
 * @param getProvider  Returns the provider to use for a specific cleaned URL, or
 *                     null/undefined when nothing is known about it yet. It is
 *                     given the URL as well as the platform id because provider
 *                     support is per-link, not per-platform.
 * @param enabledMap   Map of platformId → boolean; skips disabled platforms entirely
 */
export function rewriteMessageContent(
    content: string,
    platforms: PlatformEntry[],
    getProvider: (platformId: string, cleanUrl: string) => { domain: string; label: string } | null | undefined,
    enabledMap: Record<string, boolean>,
): RewriteResult {
    const rewrites: RewriteResult["rewrites"] = [];
    const cacheMisses: RewriteResult["cacheMisses"] = [];

    // Collect all matches first (forward order)
    const matches = extractUrls(content, platforms);

    // Build replacement plan — includes platform context
    interface Replacement {
        original: string;
        replacement: string;
        offset: number;
        platformId: string;
        isRewrite: boolean;
        cleanUrl: string;
    }

    const replacements: Replacement[] = [];

    for (const { url, offset } of matches) {
        const platform = matchPlatform(url, platforms)!;
        const platformId = platform.id;

        // Skip disabled platforms
        if (enabledMap[platformId] === false) continue;

        // Strip tracking params (global + platform-specific)
        const platformStripParams = platform.stripParams ?? [];
        const cleanUrl = stripTrackingParams(url, platformStripParams);

        const provider = getProvider(platformId, cleanUrl);

        if (provider) {
            // Cache hit: rewrite domain
            const rewrittenUrl = rewriteUrl(cleanUrl, provider.domain);
            replacements.push({
                original: url,
                replacement: rewrittenUrl,
                offset,
                platformId,
                isRewrite: true,
                cleanUrl,
            });
        } else {
            // Cache miss: still update to clean URL in content
            replacements.push({
                original: url,
                replacement: cleanUrl,
                offset,
                platformId,
                isRewrite: false,
                cleanUrl,
            });
        }
    }

    // Rebuild forward so recorded offsets point at the final rewritten content.
    replacements.sort((a, b) => a.offset - b.offset);

    let result = "";
    let cursor = 0;

    for (const r of replacements) {
        result += content.slice(cursor, r.offset);
        const finalOffset = result.length;
        result += r.replacement;
        cursor = r.offset + r.original.length;

        if (r.isRewrite) {
            const providerDomain = (() => {
                try {
                    return new URL(r.replacement).hostname;
                } catch {
                    return "";
                }
            })();

            rewrites.push({
                original: r.original,
                rewritten: r.replacement,
                cleanUrl: r.cleanUrl,
                offset: finalOffset,
                platformId: r.platformId,
                providerDomain,
            });
        } else {
            cacheMisses.push({
                url: r.original,
                cleanUrl: r.cleanUrl,
                offset: finalOffset,
                platformId: r.platformId,
            });
        }
    }

    result += content.slice(cursor);

    return { content: replacements.length > 0 ? result : content, rewrites, cacheMisses };
}
