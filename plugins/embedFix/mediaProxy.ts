/*
 * embedFix — Presenting media the renderer is not allowed to fetch.
 *
 * Discord's CSP blocks img-src and media-src for provider CDNs, and its own
 * embeds use signed proxy URLs we cannot forge. The Electron main process has
 * no CSP, so it downloads the bytes and we hand them to the DOM as a blob:
 * URL — measured 2026-07-27, blob: is accepted by both directives.
 *
 * Object URLs are reference-counted junk if left lying around, so this keeps a
 * bounded cache and revokes what it evicts.
 *
 * The fetcher and the URL factory are injected, so this is testable without
 * Electron or a DOM.
 */

import type { MediaKind } from "./mediaProbe";

export interface MediaPayload {
    ok: boolean;
    contentType: string | null;
    bytes: Uint8Array | null;
    size: number;
    error?: string;
}

export type MediaFetcher = (url: string, maxBytes: number) => Promise<MediaPayload>;

export interface ObjectUrlFactory {
    create(bytes: Uint8Array, contentType: string): string;
    revoke(objectUrl: string): void;
}

export interface MediaProxyOptions {
    fetcher: MediaFetcher;
    objectUrls: ObjectUrlFactory;
    /** Per-kind ceilings. Video is only ever fetched on an explicit request. */
    maxBytes?: Partial<Record<MediaKind, number>>;
    /** Object URLs kept alive before the oldest are revoked. */
    maxEntries?: number;
    log?: (message: string) => void;
}

const DEFAULT_MAX_BYTES: Record<MediaKind, number> = {
    image: 8 * 1024 * 1024,
    video: 50 * 1024 * 1024,
};

const FALLBACK_TYPE: Record<MediaKind, string> = {
    image: "image/jpeg",
    video: "video/mp4",
};

interface Entry {
    url: string;
    objectUrl: string;
    size: number;
    order: number;
}

export class MediaProxy {
    private readonly fetcher: MediaFetcher;
    private readonly objectUrls: ObjectUrlFactory;
    private readonly maxBytes: Record<MediaKind, number>;
    private readonly maxEntries: number;
    private readonly log: (message: string) => void;

    private readonly entries = new Map<string, Entry>();
    private readonly inflight = new Map<string, Promise<string | null>>();
    private readonly failed = new Set<string>();
    private counter = 0;

    constructor(options: MediaProxyOptions) {
        this.fetcher = options.fetcher;
        this.objectUrls = options.objectUrls;
        this.maxBytes = { ...DEFAULT_MAX_BYTES, ...options.maxBytes };
        this.maxEntries = options.maxEntries ?? 40;
        this.log = options.log ?? (() => { /* noop */ });
    }

    /** An already-fetched object URL for this asset, or null. Never fetches. */
    peek(url: string): string | null {
        return this.entries.get(url)?.objectUrl ?? null;
    }

    /** Has this asset already been tried and failed? */
    hasFailed(url: string): boolean {
        return this.failed.has(url);
    }

    /**
     * Fetch the asset through the main process and return a blob: URL.
     * Returns null when it is too large, unreachable, or already known bad.
     */
    async load(url: string, kind: MediaKind): Promise<string | null> {
        const cached = this.entries.get(url);
        if (cached) return cached.objectUrl;
        if (this.failed.has(url)) return null;

        const existing = this.inflight.get(url);
        if (existing) return existing;

        const pending = this.run(url, kind).finally(() => {
            this.inflight.delete(url);
        });
        this.inflight.set(url, pending);
        return pending;
    }

    private async run(url: string, kind: MediaKind): Promise<string | null> {
        let payload: MediaPayload;
        try {
            payload = await this.fetcher(url, this.maxBytes[kind]);
        } catch (e) {
            this.failed.add(url);
            this.log(`proxy fetch threw for ${url}: ${String(e)}`);
            return null;
        }

        if (!payload.ok || !payload.bytes || payload.bytes.byteLength === 0) {
            this.failed.add(url);
            this.log(`proxy fetch failed for ${url}: ${payload.error ?? "empty response"}`);
            return null;
        }

        const objectUrl = this.objectUrls.create(payload.bytes, payload.contentType || FALLBACK_TYPE[kind]);
        this.entries.set(url, { url, objectUrl, size: payload.size, order: ++this.counter });
        this.evict();
        this.log(`proxied ${Math.round(payload.size / 1024)} KB for ${url}`);
        return objectUrl;
    }

    private evict(): void {
        if (this.entries.size <= this.maxEntries) return;

        const ordered = [...this.entries.values()].sort((a, b) => a.order - b.order);
        for (const entry of ordered.slice(0, this.entries.size - this.maxEntries)) {
            this.objectUrls.revoke(entry.objectUrl);
            this.entries.delete(entry.url);
        }
    }

    /** Total bytes currently held alive. */
    bytesHeld(): number {
        let total = 0;
        for (const entry of this.entries.values()) total += entry.size;
        return total;
    }

    stats(): { held: number; bytes: number; failed: number } {
        return { held: this.entries.size, bytes: this.bytesHeld(), failed: this.failed.size };
    }

    /** Revoke everything. Called on plugin stop. */
    reset(): void {
        for (const entry of this.entries.values()) this.objectUrls.revoke(entry.objectUrl);
        this.entries.clear();
        this.failed.clear();
    }
}

/** Real object-URL factory for the renderer. */
export function createDomObjectUrls(): ObjectUrlFactory {
    return {
        create(bytes, contentType) {
            // Copy into a fresh buffer: the array that crossed IPC may be a
            // view onto a larger one.
            return URL.createObjectURL(new Blob([bytes.slice()], { type: contentType }));
        },
        revoke(objectUrl) {
            URL.revokeObjectURL(objectUrl);
        },
    };
}
