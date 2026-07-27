/*
 * embedFix — Embed metadata model, HTML parsing, scoring and soft-error detection.
 *
 * Pure TypeScript. Imported by both the Electron-main native module (which does
 * the fetching) and the renderer (which decides what to do with the result), so
 * this file must never touch Discord, Node or DOM APIs.
 */

/** Everything we learn from one provider fetch. */
export interface EmbedMeta {
    /** URL we asked for. */
    url: string;
    /** URL we ended up on after redirects (may differ from `url`). */
    finalUrl: string;
    /** HTTP status, 0 when the request never completed. */
    status: number;
    title: string | null;
    description: string | null;
    siteName: string | null;
    imageUrl: string | null;
    videoUrl: string | null;
    videoWidth: number | null;
    videoHeight: number | null;
    audioUrl: string | null;
    authorName: string | null;
    authorUrl: string | null;
    themeColor: string | null;
    /** og:type / twitter:card, or the oEmbed type when richer. */
    type: string | null;
    /** Transport-level failure (DNS, TLS, timeout, non-2xx). */
    error?: string;
    /**
     * Provider responded, but this specific link is not supported / not found.
     * A soft error is per-link: it must NOT count against the provider's health.
     */
    softError?: string;
    /** Round-trip time in ms, for diagnostics. */
    elapsedMs?: number;
    /**
     * Set by the renderer: this video's host is CSP-blocked, so it can only be
     * shown after the user asks for it and we proxy the bytes. Playable, but
     * not as good as an embed that plays on sight — scored accordingly.
     */
    videoNeedsProxy?: boolean;
}

/** Quality tiers. Higher is a better embed. */
export const EmbedScore = {
    /** Unusable — hard error, soft error, or no metadata at all. */
    NONE: 0,
    /** Only a title (or only a description). Discord renders a bare grey card. */
    TITLE_ONLY: 1,
    /** Image + title. */
    IMAGE: 2,
    /** Image + title + description. */
    RICH: 3,
    /** Playable media (video or audio). */
    MEDIA: 4,
} as const;

/**
 * Minimum score we accept without looking at the remaining providers.
 * TITLE_ONLY is deliberately below the bar: a bare title is usually a provider
 * error page that happens to set `og:title`.
 */
export const GOOD_ENOUGH_SCORE: number = EmbedScore.IMAGE;

/** Minimum score for a result to be shown at all. */
export const MIN_USABLE_SCORE: number = EmbedScore.TITLE_ONLY;

export function emptyMeta(url: string): EmbedMeta {
    return {
        url,
        finalUrl: url,
        status: 0,
        title: null,
        description: null,
        siteName: null,
        imageUrl: null,
        videoUrl: null,
        videoWidth: null,
        videoHeight: null,
        audioUrl: null,
        authorName: null,
        authorUrl: null,
        themeColor: null,
        type: null,
    };
}

// --- HTML parsing -----------------------------------------------------------

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Decode the handful of HTML entities that actually show up in meta content. */
export function decodeEntities(value: string): string {
    return value
        .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, entity => {
            const body = entity.slice(1, -1);
            if (body[0] === "#") {
                const code = body[1] === "x" || body[1] === "X"
                    ? parseInt(body.slice(2), 16)
                    : parseInt(body.slice(1), 10);
                return Number.isFinite(code) && code > 0 && code <= 0x10ffff
                    ? String.fromCodePoint(code)
                    : entity;
            }
            switch (body.toLowerCase()) {
                case "amp": return "&";
                case "lt": return "<";
                case "gt": return ">";
                case "quot": return "\"";
                case "apos": return "'";
                case "nbsp": return " ";
                default: return entity;
            }
        });
}

/**
 * Read a `<meta property|name="...">` value out of an HTML head.
 *
 * Handles either attribute order, single or double quotes, and returns null
 * when the tag is absent or its content is empty.
 */
export function extractMeta(html: string, property: string): string | null {
    const escaped = escapeRegex(property);
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`
        + `|<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`,
        "i",
    );
    const match = html.match(pattern);
    if (!match) return null;

    const raw = match[1] ?? match[2] ?? "";
    const value = decodeEntities(raw).trim();
    return value.length > 0 ? value : null;
}

/** First non-empty value among several meta keys. */
export function extractFirstMeta(html: string, properties: string[]): string | null {
    for (const property of properties) {
        const value = extractMeta(html, property);
        if (value) return value;
    }
    return null;
}

/** `<link type="application/json+oembed" href="...">` in either attribute order. */
export function extractOembedHref(html: string): string | null {
    const match =
        html.match(/<link[^>]+type=["']application\/json\+oembed["'][^>]*?href=["']([^"']+)["']/i)
        ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*?type=["']application\/json\+oembed["']/i);
    return match ? decodeEntities(match[1]).trim() || null : null;
}

/** Parse an HTML head into an EmbedMeta, without any network context. */
export function parseEmbedHtml(html: string, url: string, finalUrl = url, status = 200): EmbedMeta {
    const meta = emptyMeta(url);
    meta.finalUrl = finalUrl;
    meta.status = status;

    meta.title = extractFirstMeta(html, ["og:title", "twitter:title"]);
    meta.description = extractFirstMeta(html, ["og:description", "twitter:description", "description"]);
    meta.siteName = extractFirstMeta(html, ["og:site_name"]);
    meta.imageUrl = extractFirstMeta(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image"]);
    meta.videoUrl = extractFirstMeta(html, ["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream"]);
    meta.audioUrl = extractFirstMeta(html, ["og:audio", "og:audio:url"]);
    meta.authorName = extractFirstMeta(html, ["og:article:author", "article:author", "twitter:creator", "twitter:title"]);
    meta.authorUrl = extractFirstMeta(html, ["og:article:author_url", "article:author_url"]);
    meta.themeColor = extractFirstMeta(html, ["theme-color"]);
    meta.type = extractFirstMeta(html, ["og:type", "twitter:card"]);

    meta.videoWidth = toDimension(extractFirstMeta(html, ["og:video:width", "twitter:player:width"]));
    meta.videoHeight = toDimension(extractFirstMeta(html, ["og:video:height", "twitter:player:height"]));

    // twitter:player is an iframe embed, not a raw stream, but it still proves
    // the link resolves to playable media.
    if (!meta.videoUrl && extractMeta(html, "twitter:player")) {
        meta.videoUrl = extractMeta(html, "twitter:player");
    }

    return meta;
}

function toDimension(value: string | null): number | null {
    if (!value) return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// --- Soft-error detection ---------------------------------------------------

/**
 * Phrases providers use on their "sorry, can't do this link" pages. Matched
 * only when there is no image and no video, so a real post that merely talks
 * about an error is not thrown away.
 */
const ERROR_PHRASES = [
    /\bnot\s+found\b/i,
    /\bunavailable\b/i,
    /\b(?:404|410|429|5\d\d)\b/,
    /\bdoes\s?n[o']?t\s+exist\b/i,
    /\bdeleted\b/i,
    /\bsuspended\b/i,
    /\bprivate\s+(?:account|post|profile)\b/i,
    /\brate[\s-]?limit/i,
    /\btoo\s+many\s+requests\b/i,
    /\bsomething\s+went\s+wrong\b/i,
    /\bfailed\s+to\s+(?:fetch|load|scrape|resolve)\b/i,
    /\bunsupported\b/i,
    /\bapi\s+error\b/i,
    /\btry\s+again\s+later\b/i,
    /\berror\b/i,
];

function hostOf(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^(?:www|m|mobile|old)\./, "");
    } catch {
        return null;
    }
}

/**
 * Decide whether a 200 response is really a provider failure for this link.
 *
 * @param meta          Parsed metadata.
 * @param sourceHosts   The platform's own domains (e.g. twitter.com, x.com).
 *                      A provider that bounces us back to the source could not
 *                      handle the link.
 */
export function detectSoftError(meta: EmbedMeta, sourceHosts: string[] = []): string | null {
    if (meta.error) return null; // hard errors are reported separately

    const hasMedia = !!(meta.imageUrl || meta.videoUrl || meta.audioUrl);

    const requestedHost = hostOf(meta.url);
    const finalHost = hostOf(meta.finalUrl);
    const normalizedSources = new Set(sourceHosts.map(host => host.toLowerCase()));
    if (finalHost && requestedHost && finalHost !== requestedHost && normalizedSources.has(finalHost)) {
        return `redirected back to ${finalHost}`;
    }

    if (!meta.title && !meta.description && !hasMedia) {
        return "no metadata";
    }

    if (hasMedia) return null;

    const haystack = [meta.title, meta.description].filter(Boolean).join(" — ");
    if (!haystack) return null;

    // Long prose that merely mentions "error" is almost certainly a real post.
    if (haystack.length > 160) return null;

    for (const phrase of ERROR_PHRASES) {
        if (phrase.test(haystack)) {
            return `provider error page: ${truncate(haystack, 80)}`;
        }
    }

    // A title that is nothing but the provider's own brand name.
    const brand = meta.siteName?.trim().toLowerCase();
    if (brand && meta.title && meta.title.trim().toLowerCase() === brand && !meta.description) {
        return "provider landing page";
    }

    return null;
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// --- Scoring ----------------------------------------------------------------

/**
 * Rate an embed 0..4. Hard errors and soft errors always score 0 — a provider
 * that "works" but cannot render this particular link is worth nothing for it.
 */
export function scoreEmbedMeta(meta: EmbedMeta): number {
    if (meta.error || meta.softError) return EmbedScore.NONE;

    const hasTitle = !!meta.title;
    const hasDescription = !!meta.description;
    const hasImage = !!meta.imageUrl;
    // Video behind a click is real content, but it does not deserve to outrank
    // an embed that simply plays — so it never reaches the MEDIA tier.
    const playsOnSight = (!!meta.videoUrl && !meta.videoNeedsProxy) || !!meta.audioUrl || meta.type === "video";
    const playsOnClick = !!meta.videoUrl && !!meta.videoNeedsProxy;

    if (playsOnSight && (hasTitle || hasImage)) return EmbedScore.MEDIA;
    if (playsOnSight) return EmbedScore.IMAGE;
    if (playsOnClick && hasImage && (hasTitle || hasDescription)) return EmbedScore.RICH;
    if (playsOnClick) return EmbedScore.IMAGE;
    if (hasImage && hasTitle && hasDescription) return EmbedScore.RICH;
    if (hasImage && (hasTitle || hasDescription)) return EmbedScore.IMAGE;
    if (hasTitle || hasDescription) return EmbedScore.TITLE_ONLY;
    return EmbedScore.NONE;
}

/** Run soft-error detection and scoring over a freshly parsed meta, in place. */
export function finalizeMeta(meta: EmbedMeta, sourceHosts: string[] = []): EmbedMeta {
    if (!meta.error) {
        const soft = detectSoftError(meta, sourceHosts);
        if (soft) meta.softError = soft;
    }
    return meta;
}

export function isUsableMeta(meta: EmbedMeta | null | undefined): meta is EmbedMeta {
    return !!meta && !meta.error && !meta.softError && scoreEmbedMeta(meta) >= MIN_USABLE_SCORE;
}

/**
 * Should we re-fetch this URL pretending to be a different crawler?
 *
 * Several providers sniff the User-Agent and serve a bare HTML shell to
 * anything they do not recognise — vxtwitter answers 200 with no OG tags at
 * all unless the UA is exactly a TelegramBot string. That is indistinguishable
 * from "this link is unsupported" unless we try again as someone else.
 *
 * Only worth retrying when the page was truly empty: a page that produced any
 * metadata, or a real HTTP error, tells us what we need to know already.
 */
export function shouldRetryWithAlternateAgent(meta: EmbedMeta): boolean {
    if (meta.error) return false;
    return meta.softError === "no metadata";
}
