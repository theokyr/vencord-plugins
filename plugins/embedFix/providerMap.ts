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

export interface PlatformUrlMatch {
    platform: PlatformEntry;
    provider?: ProviderDef;
    isProviderDomain: boolean;
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
    const match = resolvePlatformUrl(urlStr, platforms);
    if (!match || match.isProviderDomain) return null;

    return match.platform;
}

/**
 * Resolve either a source URL or an already-rewritten provider URL to its
 * platform. Use this for incoming display/suppression paths only; outgoing
 * rewrite scans should keep using matchPlatform() to avoid double rewrites.
 */
export function resolvePlatformUrl(
    urlStr: string,
    platforms: PlatformEntry[] = DEFAULT_PLATFORMS,
): PlatformUrlMatch | null {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch {
        return null;
    }

    const normalized = normalizeHostname(url.hostname);

    for (const platform of platforms) {
        if (platform.domains.includes(normalized)) {
            return { platform, isProviderDomain: false };
        }

        const provider = platform.providers.find(candidate => candidate.domain === normalized);
        if (provider) {
            return { platform, provider, isProviderDomain: true };
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
