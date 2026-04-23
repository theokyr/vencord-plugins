/**
 * embedFix — Platform definitions and domain matching.
 * Pure TypeScript, no Discord dependencies.
 */

export interface ProviderDef {
    domain: string;
    label: string;
    features?: string[];
}

export interface PlatformEntry {
    id: string;
    label: string;
    domains: string[];
    providers: ProviderDef[];
    stripParams?: string[];
}

export const DEFAULT_PLATFORMS: PlatformEntry[] = [
    {
        id: "twitter",
        label: "Twitter / X",
        domains: ["twitter.com", "x.com"],
        providers: [
            { domain: "vxtwitter.com", label: "VxTwitter" },
            { domain: "fxtwitter.com", label: "FxTwitter" },
            { domain: "xcancel.com", label: "XCancel" },
        ],
        stripParams: ["s", "t", "ref_src"],
    },
    {
        id: "reddit",
        label: "Reddit",
        domains: ["reddit.com"],
        providers: [
            { domain: "vxreddit.com", label: "VxReddit" },
            { domain: "rxddit.com", label: "Rxddit" },
        ],
        stripParams: ["context", "share_id", "ref"],
    },
    {
        id: "instagram",
        label: "Instagram",
        domains: ["instagram.com"],
        providers: [
            { domain: "ddinstagram.com", label: "DDInstagram" },
            { domain: "kkinstagram.com", label: "KKInstagram" },
        ],
        stripParams: ["igshid"],
    },
    {
        id: "tiktok",
        label: "TikTok",
        domains: ["tiktok.com"],
        providers: [
            { domain: "vxtiktok.com", label: "VxTikTok" },
            { domain: "tfxktok.com", label: "TfxkTok" },
        ],
    },
    {
        id: "pixiv",
        label: "Pixiv",
        domains: ["pixiv.net"],
        providers: [
            { domain: "phixiv.net", label: "Phixiv" },
        ],
    },
    {
        id: "bluesky",
        label: "Bluesky",
        domains: ["bsky.app"],
        providers: [
            { domain: "bskyx.app", label: "BSkyX" },
            { domain: "fxbsky.app", label: "FxBsky" },
        ],
    },
    {
        id: "threads",
        label: "Threads",
        domains: ["threads.net"],
        providers: [
            { domain: "vxthreads.net", label: "VxThreads" },
            { domain: "fxthreads.net", label: "FxThreads" },
        ],
    },
];

/** Subdomains to strip before matching. */
const STRIP_SUBDOMAINS = new Set(["www", "m", "mobile", "old"]);

/** Normalize a hostname by removing common subdomains. */
function normalizeHostname(hostname: string): string {
    const parts = hostname.split(".");
    if (parts.length > 2 && STRIP_SUBDOMAINS.has(parts[0])) {
        return parts.slice(1).join(".");
    }
    return hostname;
}

/**
 * Build a set of all provider domains across all platforms for anti double-rewrite checks.
 */
function buildProviderDomainSet(platforms: PlatformEntry[]): Set<string> {
    const set = new Set<string>();
    for (const platform of platforms) {
        for (const provider of platform.providers) {
            set.add(provider.domain);
        }
    }
    return set;
}

/**
 * Match a URL string against the platform map.
 *
 * - Strips www/m/mobile/old subdomains before matching.
 * - Returns null for invalid URLs.
 * - Returns null if the URL's hostname is already a known provider domain (anti double-rewrite).
 */
export function matchPlatform(
    urlStr: string,
    platforms: PlatformEntry[] = DEFAULT_PLATFORMS,
): PlatformEntry | null {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch {
        return null;
    }

    const providerDomains = buildProviderDomainSet(platforms);
    const normalized = normalizeHostname(url.hostname);

    // Anti double-rewrite: if the hostname is already a provider domain, bail out.
    if (providerDomains.has(normalized)) {
        return null;
    }

    for (const platform of platforms) {
        if (platform.domains.includes(normalized)) {
            return platform;
        }
    }

    return null;
}

/**
 * Merge user JSON overrides with the defaults.
 *
 * The override is an array of PlatformEntry objects. If an entry's id matches an
 * existing platform, it replaces that platform. Otherwise it is appended.
 *
 * Returns defaults unchanged on empty string or invalid JSON.
 */
export function mergeUserOverrides(
    defaults: PlatformEntry[],
    overrideJson: string,
): PlatformEntry[] {
    if (!overrideJson.trim()) {
        return defaults;
    }

    let overrides: PlatformEntry[];
    try {
        overrides = JSON.parse(overrideJson);
    } catch {
        return defaults;
    }

    if (!Array.isArray(overrides)) {
        return defaults;
    }

    // Build a map of defaults by id for O(1) lookup.
    const result: PlatformEntry[] = [...defaults];
    for (const override of overrides) {
        const existingIndex = result.findIndex(p => p.id === override.id);
        if (existingIndex >= 0) {
            result[existingIndex] = override;
        } else {
            result.push(override);
        }
    }

    return result;
}
