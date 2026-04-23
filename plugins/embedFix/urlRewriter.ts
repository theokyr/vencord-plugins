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
    rewrites: { original: string; rewritten: string; platformId: string }[];
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

    return parsed.toString();
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
 * @param getProvider  Returns a cached ProviderDef or null/undefined for a platform id
 * @param enabledMap   Map of platformId → boolean; skips disabled platforms entirely
 */
export function rewriteMessageContent(
    content: string,
    platforms: PlatformEntry[],
    getProvider: (platformId: string) => { domain: string; label: string } | null | undefined,
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

        const provider = getProvider(platformId);

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

    // Apply replacements in REVERSE offset order so earlier offsets stay valid
    replacements.sort((a, b) => b.offset - a.offset);

    let result = content;

    for (const r of replacements) {
        const before = result.slice(0, r.offset);
        const after = result.slice(r.offset + r.original.length);
        result = before + r.replacement + after;

        if (r.isRewrite) {
            rewrites.push({
                original: r.original,
                rewritten: r.replacement,
                platformId: r.platformId,
            });
        } else {
            // Recalculate offset after previous replacements — since we process
            // in reverse, the offset in the NEW string is the same as before
            cacheMisses.push({
                url: r.original,
                cleanUrl: r.cleanUrl,
                offset: r.offset,
                platformId: r.platformId,
            });
        }
    }

    return { content: result, rewrites, cacheMisses };
}
