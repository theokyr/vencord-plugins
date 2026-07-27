/*
 * Vencord userplugin — EmbedFix native module
 *
 * Runs in the Electron main process. One job: fetch a provider URL and return
 * its embed metadata. All parsing, scoring and soft-error rules live in
 * embedMeta.ts so they can be tested outside Electron.
 *
 * Authors: kamaras
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    emptyMeta,
    extractOembedHref,
    finalizeMeta,
    parseEmbedHtml,
    shouldRetryWithAlternateAgent,
    type EmbedMeta,
} from "./embedMeta";

/**
 * Crawler identities, tried in order.
 *
 * Discordbot first: fxtwitter and friends tailor their output for Discord when
 * they see it. The TelegramBot fallback exists because vxtwitter (and other
 * fixup services) sniff the UA and serve an empty shell to anything they do not
 * recognise — measured 2026-07-27: vxtwitter emits OG tags for exactly
 * "TelegramBot (like TwitterBot)" and for nothing else, not even a UA that
 * contains that string alongside others.
 */
const USER_AGENTS = [
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discord.com)",
    "TelegramBot (like TwitterBot)",
];
const USER_AGENT = USER_AGENTS[0];
const PAGE_TIMEOUT_MS = 6000;
const OEMBED_TIMEOUT_MS = 2500;
const MAX_HEAD_BYTES = 64 * 1024;
/** Concurrent outbound requests across all providers. */
const MAX_CONCURRENT = 4;
/** Concurrent outbound requests to any single host. */
const MAX_PER_HOST = 2;

// --- Tiny scheduler ---------------------------------------------------------
// A message with five links used to fire fifteen simultaneous requests, which
// is exactly how you get rate-limited by every provider at once.

interface QueuedTask {
    host: string;
    run: () => void;
}

const queue: QueuedTask[] = [];
const perHost = new Map<string, number>();
let active = 0;

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "invalid";
    }
}

function pump(): void {
    for (let i = 0; i < queue.length && active < MAX_CONCURRENT; i++) {
        const task = queue[i];
        if ((perHost.get(task.host) ?? 0) >= MAX_PER_HOST) continue;

        queue.splice(i, 1);
        i--;
        active++;
        perHost.set(task.host, (perHost.get(task.host) ?? 0) + 1);
        task.run();
    }
}

function release(host: string): void {
    active = Math.max(0, active - 1);
    const count = (perHost.get(host) ?? 1) - 1;
    if (count <= 0) perHost.delete(host);
    else perHost.set(host, count);
    pump();
}

function schedule<T>(url: string, work: () => Promise<T>): Promise<T> {
    const host = hostOf(url);
    return new Promise<T>((resolve, reject) => {
        queue.push({
            host,
            run: () => {
                work().then(resolve, reject).finally(() => release(host));
            },
        });
        pump();
    });
}

// --- HTTP -------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number, userAgent: string = USER_AGENT): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": userAgent,
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "follow",
        });
    } finally {
        clearTimeout(timer);
    }
}

/** Read the response body up to `</head>` or MAX_HEAD_BYTES, then hang up. */
async function readHead(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    const decoder = new TextDecoder();
    let accumulated = "";
    let totalBytes = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.byteLength;
            accumulated += decoder.decode(value, { stream: true });

            const headEnd = accumulated.toLowerCase().indexOf("</head>");
            if (headEnd !== -1) {
                accumulated = accumulated.slice(0, headEnd + 7);
                void reader.cancel().catch(() => { /* ignore */ });
                break;
            }

            if (totalBytes >= MAX_HEAD_BYTES) {
                void reader.cancel().catch(() => { /* ignore */ });
                break;
            }
        }
    } catch {
        // Partial head is still worth parsing.
    }

    return accumulated + decoder.decode();
}

function errorMeta(url: string, message: string, status = 0): EmbedMeta {
    const meta = emptyMeta(url);
    meta.status = status;
    meta.error = message;
    return meta;
}

function isRetryable(message: string): boolean {
    return /abort|timeout|network|socket|ECONN|EAI_AGAIN|fetch failed/i.test(message);
}

async function loadPage(url: string, userAgent: string): Promise<{ html: string; finalUrl: string; status: number } | EmbedMeta> {
    let lastError = "unknown error";

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetchWithTimeout(url, PAGE_TIMEOUT_MS, userAgent);

            if (!response.ok) {
                // A status is a definitive answer — never retry it.
                return errorMeta(url, `HTTP ${response.status}`, response.status);
            }

            const html = await readHead(response);
            return { html, finalUrl: response.url || url, status: response.status };
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            if (!isRetryable(lastError)) break;
        }
    }

    return errorMeta(url, lastError);
}

function resolveHref(href: string, base: string): string | null {
    try {
        return new URL(href, base).toString();
    } catch {
        return null;
    }
}

/**
 * Fetch and describe one provider URL.
 *
 * @param sourceHosts The originating platform's own domains. A provider that
 *                    redirects back to one of them could not handle the link.
 */
export async function fetchEmbedMeta(
    _event: unknown,
    url: string,
    sourceHosts: string[] = [],
): Promise<EmbedMeta> {
    const startedAt = Date.now();

    const meta = await schedule(url, async (): Promise<EmbedMeta> => {
        let result: EmbedMeta | null = null;

        // Try each crawler identity until one hands us real metadata. Most
        // providers answer the first; the retry exists only for the ones that
        // serve an empty shell to a UA they do not recognise.
        for (const userAgent of USER_AGENTS) {
            const attempt = await fetchAs(url, sourceHosts, userAgent);
            result = attempt;
            if (!shouldRetryWithAlternateAgent(attempt)) break;
        }

        return result ?? errorMeta(url, "no attempt completed");
    }).catch((e: unknown) => errorMeta(url, e instanceof Error ? e.message : String(e)));

    meta.elapsedMs = Date.now() - startedAt;
    return meta;
}

/** One fetch + parse pass under a single crawler identity. */
async function fetchAs(url: string, sourceHosts: string[], userAgent: string): Promise<EmbedMeta> {
    const page = await loadPage(url, userAgent);
    if (!("html" in page)) return page;

    const { html, finalUrl, status } = page;
    const parsed = parseEmbedHtml(html, url, finalUrl, status);

    // Only pay for oEmbed when the page itself was thin — it is the one
    // place where video-only providers expose their type and author.
    const needsOembed = !parsed.videoUrl || !parsed.authorName || !parsed.type;
    if (needsOembed) {
        const href = extractOembedHref(html);
        const absolute = href ? resolveHref(href, finalUrl) : null;
        if (absolute) {
            const oembed = await fetchOembed(absolute);
            if (oembed) {
                if (!parsed.type && typeof oembed.type === "string") parsed.type = oembed.type;
                if (typeof oembed.type === "string" && oembed.type === "video" && !parsed.videoUrl) {
                    parsed.videoUrl = typeof oembed.url === "string" ? oembed.url : parsed.videoUrl;
                    if (!parsed.videoUrl) parsed.type = "video";
                }
                if (!parsed.authorName && typeof oembed.author_name === "string") parsed.authorName = oembed.author_name;
                if (!parsed.authorUrl && typeof oembed.author_url === "string") parsed.authorUrl = oembed.author_url;
                if (!parsed.siteName && typeof oembed.provider_name === "string") parsed.siteName = oembed.provider_name;
                if (!parsed.title && typeof oembed.title === "string") parsed.title = oembed.title;
                if (!parsed.imageUrl && typeof oembed.thumbnail_url === "string") parsed.imageUrl = oembed.thumbnail_url;
            }
        }
    }

    return finalizeMeta(parsed, sourceHosts);
}

async function fetchOembed(url: string): Promise<Record<string, unknown> | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
        let response: Response;
        try {
            response = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) return null;

        const json: unknown = await response.json();
        return json && typeof json === "object" && !Array.isArray(json)
            ? json as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

/** Fetch several provider URLs. The scheduler keeps the fan-out bounded. */
export async function fetchEmbedMetaBatch(
    _event: unknown,
    urls: string[],
    sourceHosts: string[] = [],
): Promise<EmbedMeta[]> {
    return Promise.all(urls.map(url => fetchEmbedMeta(_event, url, sourceHosts)));
}

// --- Media proxying ---------------------------------------------------------
// Discord's renderer CSP blocks img-src/media-src for provider CDNs (i.redd.it,
// phixiv.net, vxtwitter's video host…), and its own embeds sidestep that with
// signed proxy URLs we cannot forge. The main process has no CSP, so we fetch
// the bytes here and let the renderer present them from a blob: URL — measured
// 2026-07-27: blob: is accepted by both img-src and media-src.

export interface MediaPayload {
    ok: boolean;
    contentType: string | null;
    bytes: Uint8Array | null;
    size: number;
    error?: string;
}

const MEDIA_TIMEOUT_MS = 20_000;

function mediaError(message: string): MediaPayload {
    return { ok: false, contentType: null, bytes: null, size: 0, error: message };
}

/**
 * Download one asset for the renderer to present.
 *
 * `maxBytes` is enforced while streaming, not merely checked against
 * Content-Length, so a lying or absent header cannot make us buffer a 300 MB
 * video into the renderer process.
 */
export async function fetchMedia(
    _event: unknown,
    url: string,
    maxBytes: number,
): Promise<MediaPayload> {
    return schedule(url, async (): Promise<MediaPayload> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
                redirect: "follow",
            });

            if (!response.ok) return mediaError(`HTTP ${response.status}`);

            const declared = Number(response.headers.get("content-length") ?? "0");
            if (Number.isFinite(declared) && declared > maxBytes) {
                return mediaError(`too large (${Math.round(declared / 1024)} KB > ${Math.round(maxBytes / 1024)} KB)`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                const buffer = new Uint8Array(await response.arrayBuffer());
                if (buffer.byteLength > maxBytes) return mediaError("too large");
                return { ok: true, contentType: response.headers.get("content-type"), bytes: buffer, size: buffer.byteLength };
            }

            const chunks: Uint8Array[] = [];
            let total = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                total += value.byteLength;
                if (total > maxBytes) {
                    void reader.cancel().catch(() => { /* ignore */ });
                    return mediaError(`too large (over ${Math.round(maxBytes / 1024)} KB)`);
                }
                chunks.push(value);
            }

            const bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }

            return { ok: true, contentType: response.headers.get("content-type"), bytes, size: total };
        } catch (e) {
            return mediaError(e instanceof Error ? e.message : String(e));
        } finally {
            clearTimeout(timer);
        }
    }).catch((e: unknown) => mediaError(e instanceof Error ? e.message : String(e)));
}
