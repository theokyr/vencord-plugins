/*
 * embedFix — Can we actually present this media?
 *
 * A URL in an `og:` tag is not the same thing as something on screen. Discord's
 * renderer enforces a CSP that only lets media through from hosts it trusts,
 * and its own embeds dodge that with proxied, signed URLs we cannot forge.
 *
 * Measured 2026-07-27 in the live client:
 *   img-src    pbs.twimg.com                           loads
 *              i.redd.it                               blocked
 *              phixiv.net                              blocked
 *   media-src  vxtwitter.com/tvid/…                    blocked
 *              images-ext-1.discordapp.net/external/…  plays (Discord's proxy)
 *
 * Counting unpresentable media toward an embed's score is how the plugin
 * replaced a working reddit embed with a picture-less one. Video is the worse
 * case: it scores highest of all, and no provider host can serve it to us.
 * So we measure per host *and per kind* — CSP treats `img-src` and `media-src`
 * separately, and a host can happily serve one and refuse the other.
 *
 * The loaders are injected, so this is testable without a DOM.
 */

export type MediaKind = "image" | "video";

/** Resolves true when the media loads, false when it is blocked or broken. */
export type MediaLoader = (url: string) => Promise<boolean>;

interface HostRecord {
    host: string;
    kind: MediaKind;
    /** Distinct URLs from this host that failed to load. */
    failures: number;
    usable: boolean | null;
    checkedAt: number;
}

export interface MediaHostOptions {
    loaders: Record<MediaKind, MediaLoader>;
    now?: () => number;
    /** How long a verdict stands before we re-measure. */
    ttlMs?: number;
    /**
     * Distinct failures before a host is declared unusable. One failure could
     * just be a deleted file; a CSP refusal fails every time, so this converges
     * immediately in the case that matters.
     */
    failureThreshold?: number;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export class MediaHostRegistry {
    private readonly loaders: Record<MediaKind, MediaLoader>;
    private readonly now: () => number;
    private readonly ttlMs: number;
    private readonly failureThreshold: number;

    private readonly hosts = new Map<string, HostRecord>();
    private readonly inflight = new Map<string, Promise<boolean>>();

    constructor(options: MediaHostOptions) {
        this.loaders = options.loaders;
        this.now = options.now ?? (() => Date.now());
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
        this.failureThreshold = options.failureThreshold ?? 2;
    }

    private keyOf(url: string, kind: MediaKind): string | null {
        try {
            return `${kind} ${new URL(url).hostname.toLowerCase()}`;
        } catch {
            return null;
        }
    }

    /** Current verdict without measuring. */
    peek(url: string, kind: MediaKind): boolean | null {
        const key = this.keyOf(url, kind);
        if (!key) return false;

        const record = this.hosts.get(key);
        if (!record || record.usable === null) return null;
        if (this.now() - record.checkedAt > this.ttlMs) return null;
        return record.usable;
    }

    /**
     * Can media of this kind, from this URL's host, be presented?
     *
     * Verdicts are cached per host+kind, so one probe covers every file from
     * that CDN. Concurrent questions share a single probe.
     */
    async canPresent(url: string, kind: MediaKind): Promise<boolean> {
        const key = this.keyOf(url, kind);
        if (!key) return false;

        const cached = this.peek(url, kind);
        if (cached !== null) return cached;

        const existing = this.inflight.get(key);
        if (existing) return existing;

        const probe = this.measure(key, url, kind).finally(() => {
            this.inflight.delete(key);
        });
        this.inflight.set(key, probe);
        return probe;
    }

    private async measure(key: string, url: string, kind: MediaKind): Promise<boolean> {
        let record = this.hosts.get(key);
        if (!record) {
            record = { host: key.slice(kind.length + 1), kind, failures: 0, usable: null, checkedAt: 0 };
            this.hosts.set(key, record);
        }

        let loaded = false;
        try {
            loaded = await this.loaders[kind](url);
        } catch {
            loaded = false;
        }

        if (loaded) {
            record.failures = 0;
            record.usable = true;
        } else {
            record.failures += 1;
            // Below the threshold we stay undecided rather than caching a
            // verdict, so one dead file does not condemn the host.
            record.usable = record.failures >= this.failureThreshold ? false : null;
        }
        record.checkedAt = this.now();

        return loaded;
    }

    stats(): HostRecord[] {
        return [...this.hosts.values()];
    }

    reset(): void {
        this.hosts.clear();
    }
}

/** Real image loader: ask the browser to paint it. A CSP refusal fires onerror. */
export function createDomImageLoader(timeoutMs = 8000): MediaLoader {
    return (url: string) => new Promise<boolean>(resolve => {
        const image = new Image();
        const timer = setTimeout(() => {
            image.onload = image.onerror = null;
            resolve(false);
        }, timeoutMs);

        const settle = (value: boolean) => {
            clearTimeout(timer);
            image.onload = image.onerror = null;
            resolve(value);
        };

        image.onload = () => settle(image.naturalWidth > 0);
        image.onerror = () => settle(false);
        image.src = url;
    });
}

/**
 * Real video loader: fetch metadata only. `preload="metadata"` keeps this to a
 * range request rather than pulling the whole file down.
 */
export function createDomVideoLoader(timeoutMs = 8000): MediaLoader {
    return (url: string) => new Promise<boolean>(resolve => {
        const video = document.createElement("video");

        const settle = (value: boolean) => {
            clearTimeout(timer);
            video.onloadedmetadata = video.onerror = null;
            video.removeAttribute("src");
            resolve(value);
        };
        const timer = setTimeout(() => settle(false), timeoutMs);

        video.onloadedmetadata = () => settle(true);
        video.onerror = () => settle(false);
        video.preload = "metadata";
        video.muted = true;
        video.src = url;
    });
}
