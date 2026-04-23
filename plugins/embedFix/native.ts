/*
 * Vencord userplugin — EmbedFix native module
 * Runs in Electron main process (Node.js). Probes embed providers via HTTP.
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// No imports — only Node.js/web standard APIs (fetch, AbortController, TextDecoder).

interface ProbeResultNative {
    domain: string;
    score: number;
    hasVideo: boolean;
    hasAudio: boolean;
    hasImage: boolean;
    hasTitle: boolean;
    oembedType?: string;
    error?: string;
}

const USER_AGENT = "Mozilla/5.0 (compatible; Discordbot/2.0)";
const HEAD_TIMEOUT_MS = 5000;
const OEMBED_TIMEOUT_MS = 3000;
const MAX_HEAD_BYTES = 32 * 1024; // 32 KB

/**
 * Read the response body up to the closing `</head>` tag or MAX_HEAD_BYTES,
 * whichever comes first. Cancels the stream once the boundary is found.
 */
async function readHead(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
        return await response.text();
    }

    const decoder = new TextDecoder();
    let accumulated = "";
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.byteLength;
            accumulated += decoder.decode(value, { stream: true });

            // Stop at </head> — we have everything we need
            const headEnd = accumulated.toLowerCase().indexOf("</head>");
            if (headEnd !== -1) {
                accumulated = accumulated.slice(0, headEnd + 7);
                reader.cancel().catch(() => { /* ignore */ });
                break;
            }

            // Guard against oversized pages
            if (totalBytes >= MAX_HEAD_BYTES) {
                reader.cancel().catch(() => { /* ignore */ });
                break;
            }
        }
    } catch {
        // Stream errors are non-fatal — return what we have
    }

    // Flush any remaining bytes in the decoder
    accumulated += decoder.decode();

    return accumulated;
}

/**
 * Extract a named `og:*` or `twitter:*` meta tag value from HTML.
 * Looks for both `property="..."` and `name="..."` attribute forms.
 */
function extractMeta(html: string, property: string): string | null {
    // Match <meta property="og:video" content="..."> or <meta name="..." content="...">
    // Attributes can appear in any order; use a loose pattern.
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']` +
        `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
        "i",
    );
    const match = html.match(pattern);
    if (!match) return null;
    return (match[1] ?? match[2]) || null;
}

/**
 * Extract the href of the oEmbed JSON link tag, if present.
 * `<link type="application/json+oembed" href="URL">`
 */
function extractOembedHref(html: string): string | null {
    const match = html.match(
        /<link[^>]+type=["']application\/json\+oembed["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    ) ?? html.match(
        /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/json\+oembed["'][^>]*>/i,
    );
    return match ? match[1] : null;
}

/**
 * Compute the score from the boolean fields and optional oEmbed type.
 *
 * video (og or oembed "video") = 4
 * audio                        = 3
 * image + title                = 2
 * title only                   = 1
 * nothing / error              = 0
 */
function computeScore(
    hasVideo: boolean,
    hasAudio: boolean,
    hasImage: boolean,
    hasTitle: boolean,
    oembedType?: string,
): number {
    const videoEmbed = hasVideo || oembedType === "video";
    if (videoEmbed) return 4;
    if (hasAudio) return 3;
    if (hasImage && hasTitle) return 2;
    if (hasTitle) return 1;
    return 0;
}

export async function probeProvider(
    _event: unknown,
    providerDomain: string,
    originalPath: string,
): Promise<ProbeResultNative> {
    const url = `https://${providerDomain}${originalPath}`;

    let html: string;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": USER_AGENT },
                redirect: "follow",
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return {
                domain: providerDomain,
                score: 0,
                hasVideo: false,
                hasAudio: false,
                hasImage: false,
                hasTitle: false,
                error: `HTTP ${response.status}`,
            };
        }

        html = await readHead(response);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            domain: providerDomain,
            score: 0,
            hasVideo: false,
            hasAudio: false,
            hasImage: false,
            hasTitle: false,
            error: message,
        };
    }

    // Parse OG / Twitter meta tags
    const hasVideo = !!(extractMeta(html, "og:video") ?? extractMeta(html, "twitter:player"));
    const hasAudio = !!(extractMeta(html, "og:audio"));
    const hasImage = !!(extractMeta(html, "og:image"));
    const hasTitle = !!(extractMeta(html, "og:title"));

    // Try oEmbed
    let oembedType: string | undefined;
    const oembedHref = extractOembedHref(html);
    if (oembedHref) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);

            let oembedResponse: Response;
            try {
                oembedResponse = await fetch(oembedHref, {
                    signal: controller.signal,
                    headers: { "User-Agent": USER_AGENT },
                });
            } finally {
                clearTimeout(timer);
            }

            if (oembedResponse.ok) {
                const json = await oembedResponse.json() as unknown;
                if (
                    json !== null &&
                    typeof json === "object" &&
                    !Array.isArray(json) &&
                    "type" in (json as object)
                ) {
                    const t = (json as Record<string, unknown>).type;
                    if (typeof t === "string") {
                        oembedType = t;
                    }
                }
            }
        } catch {
            // oEmbed failure is non-fatal — score without it
        }
    }

    const score = computeScore(hasVideo, hasAudio, hasImage, hasTitle, oembedType);

    return {
        domain: providerDomain,
        score,
        hasVideo,
        hasAudio,
        hasImage,
        hasTitle,
        ...(oembedType !== undefined ? { oembedType } : {}),
    };
}

/**
 * Fetch rich embed data from a provider URL — returns actual OG values
 * for rendering a replacement embed card.
 */
export interface EmbedData {
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
    type: string | null; // "video", "article", "website", etc.
    error?: string;
}

export async function fetchEmbedData(
    _event: unknown,
    providerUrl: string,
): Promise<EmbedData> {
    const empty: EmbedData = {
        url: providerUrl, title: null, description: null, siteName: null,
        imageUrl: null, videoUrl: null, videoWidth: null, videoHeight: null,
        authorName: null, authorUrl: null, themeColor: null, type: null,
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(providerUrl, {
                signal: controller.signal,
                headers: { "User-Agent": USER_AGENT },
                redirect: "follow",
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return { ...empty, error: `HTTP ${response.status}` };
        }

        const html = await readHead(response);

        const title = extractMeta(html, "og:title");
        const description = extractMeta(html, "og:description");
        const siteName = extractMeta(html, "og:site_name");
        const imageUrl = extractMeta(html, "og:image");
        const videoUrl = extractMeta(html, "og:video") ?? extractMeta(html, "og:video:url");
        const videoWidthStr = extractMeta(html, "og:video:width");
        const videoHeightStr = extractMeta(html, "og:video:height");
        const authorName = extractMeta(html, "og:article:author") ?? extractMeta(html, "twitter:creator");
        const authorUrl = extractMeta(html, "og:article:author_url");
        const themeColor = extractMeta(html, "theme-color");
        const type = extractMeta(html, "og:type") ?? extractMeta(html, "twitter:card");

        // Try oEmbed for richer author/provider data
        const oembedHref = extractOembedHref(html);
        let oembedAuthor: string | null = null;
        let oembedProviderName: string | null = null;

        if (oembedHref) {
            try {
                const oc = new AbortController();
                const ot = setTimeout(() => oc.abort(), OEMBED_TIMEOUT_MS);
                let oRes: Response;
                try {
                    oRes = await fetch(oembedHref, { signal: oc.signal });
                } finally {
                    clearTimeout(ot);
                }
                if (oRes.ok) {
                    const oembed = await oRes.json() as Record<string, unknown>;
                    if (typeof oembed.author_name === "string") oembedAuthor = oembed.author_name;
                    if (typeof oembed.provider_name === "string") oembedProviderName = oembed.provider_name;
                }
            } catch { /* non-fatal */ }
        }

        return {
            url: providerUrl,
            title,
            description,
            siteName: oembedProviderName ?? siteName,
            imageUrl,
            videoUrl,
            videoWidth: videoWidthStr ? parseInt(videoWidthStr, 10) || null : null,
            videoHeight: videoHeightStr ? parseInt(videoHeightStr, 10) || null : null,
            authorName: oembedAuthor ?? authorName,
            authorUrl,
            themeColor,
            type,
        };
    } catch (e: any) {
        return { ...empty, error: e.message ?? "Unknown error" };
    }
}

export async function probeAllProviders(
    _event: unknown,
    providers: { domain: string }[],
    originalPath: string,
): Promise<ProbeResultNative[]> {
    return Promise.all(
        providers.map(p => probeProvider(_event, p.domain, originalPath)),
    );
}
