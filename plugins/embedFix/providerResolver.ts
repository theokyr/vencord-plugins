/*
 * embedFix — Per-URL provider resolution.
 *
 * The old design probed one hardcoded sample path per platform and cached a
 * single "best provider" for 24h. That is wrong: providers differ per link —
 * one handles video tweets but not photo tweets, another handles /i/status but
 * 404s on gallery posts. This module resolves *every* link independently,
 * caches the answer keyed by the link, and keeps per-domain health so a
 * genuinely dead provider stops costing a round-trip on every message.
 *
 * Pure TypeScript: the network call is injected. No Discord, Node or DOM APIs.
 */

import {
    EmbedScore,
    GOOD_ENOUGH_SCORE,
    scoreEmbedMeta,
    type EmbedMeta,
} from "./embedMeta";
import type { PlatformEntry, ProviderDef } from "./providerMap";
import { canonicalUrlKey, rewriteUrl } from "./urlRewriter";

/** Fetches metadata for one fully-qualified provider URL. */
export type ProbeFn = (providerUrl: string, sourceHosts: string[]) => Promise<EmbedMeta>;

export interface ProviderAttempt {
    domain: string;
    score: number;
    error?: string;
    softError?: string;
    skipped?: "cooldown";
}

export interface Resolution {
    /** Canonical cache key for the source link. */
    key: string;
    /** The cleaned source URL this resolution is for. */
    sourceUrl: string;
    platformId: string;
    /** Winning provider domain, or null when no provider could render the link. */
    providerDomain: string | null;
    /** Winning provider URL, or null. */
    providerUrl: string | null;
    /** Metadata from the winning provider, or null. */
    meta: EmbedMeta | null;
    score: number;
    resolvedAt: number;
    attempts: ProviderAttempt[];
}

export interface DomainHealth {
    domain: string;
    failures: number;
    successes: number;
    /** Consecutive soft errors across *different* links, with no success. */
    softStreak: number;
    lastFailureAt: number;
    cooldownUntil: number;
}

export interface ResolverOptions {
    probe: ProbeFn;
    now?: () => number;
    /** How long a successful resolution stays valid. */
    successTtlMs?: number;
    /** How long a total failure stays valid — short, so outages self-heal. */
    failureTtlMs?: number;
    /** Max cached resolutions before the oldest are evicted. */
    maxEntries?: number;
    /** First cooldown after a hard failure; doubles per consecutive failure. */
    cooldownBaseMs?: number;
    cooldownMaxMs?: number;
    /** Consecutive hard failures tolerated before a domain is put on cooldown. */
    failureThreshold?: number;
    /**
     * Consecutive soft errors across different links before a domain is treated
     * as useless and benched. A soft error never counts against a domain for a
     * single link, but a provider that says "no metadata" to everything is
     * either dead or sniffing us, and re-asking it costs a round-trip per link.
     */
    softStreakThreshold?: number;
    /** Probe every candidate at once instead of stopping at the first good one. */
    parallel?: boolean;
    /** Called whenever the persisted state changes. */
    onPersist?: () => void;
    log?: (message: string) => void;
}

const HOUR = 60 * 60 * 1000;

const DEFAULTS = {
    successTtlMs: 24 * HOUR,
    failureTtlMs: 10 * 60 * 1000,
    maxEntries: 300,
    cooldownBaseMs: 60 * 1000,
    cooldownMaxMs: 30 * 60 * 1000,
    failureThreshold: 2,
    softStreakThreshold: 5,
};

export interface SerializedResolver {
    v: 2;
    resolutions: Resolution[];
    health: DomainHealth[];
}

export class ProviderResolver {
    private readonly probe: ProbeFn;
    private readonly now: () => number;
    private readonly onPersist: () => void;
    private readonly log: (message: string) => void;

    private successTtlMs: number;
    private failureTtlMs: number;
    private maxEntries: number;
    private cooldownBaseMs: number;
    private cooldownMaxMs: number;
    private failureThreshold: number;
    private softStreakThreshold: number;
    private parallel: boolean;

    private readonly resolutions = new Map<string, Resolution>();
    private readonly health = new Map<string, DomainHealth>();
    private readonly inflight = new Map<string, Promise<Resolution>>();

    constructor(options: ResolverOptions) {
        this.probe = options.probe;
        this.now = options.now ?? (() => Date.now());
        this.onPersist = options.onPersist ?? (() => { /* noop */ });
        this.log = options.log ?? (() => { /* noop */ });
        this.successTtlMs = options.successTtlMs ?? DEFAULTS.successTtlMs;
        this.failureTtlMs = options.failureTtlMs ?? DEFAULTS.failureTtlMs;
        this.maxEntries = options.maxEntries ?? DEFAULTS.maxEntries;
        this.cooldownBaseMs = options.cooldownBaseMs ?? DEFAULTS.cooldownBaseMs;
        this.cooldownMaxMs = options.cooldownMaxMs ?? DEFAULTS.cooldownMaxMs;
        this.failureThreshold = options.failureThreshold ?? DEFAULTS.failureThreshold;
        this.softStreakThreshold = options.softStreakThreshold ?? DEFAULTS.softStreakThreshold;
        this.parallel = options.parallel ?? false;
    }

    setTTL(successHours: number): void {
        if (Number.isFinite(successHours) && successHours > 0) {
            this.successTtlMs = successHours * HOUR;
        }
    }

    setParallel(parallel: boolean): void {
        this.parallel = parallel;
    }

    // --- Cache reads --------------------------------------------------------

    /** A fresh resolution for this link, or null. Never triggers a probe. */
    peek(sourceUrl: string): Resolution | null {
        const key = canonicalUrlKey(sourceUrl);
        const entry = this.resolutions.get(key);
        if (!entry) return null;
        if (this.isExpired(entry)) return null;
        return entry;
    }

    private isExpired(entry: Resolution): boolean {
        const ttl = entry.providerDomain ? this.successTtlMs : this.failureTtlMs;
        return this.now() - entry.resolvedAt > ttl;
    }

    // --- Resolution ---------------------------------------------------------

    /**
     * Resolve the best working provider for one link.
     *
     * Concurrent calls for the same link share a single probe chain, so a
     * message containing the same URL twice costs one round-trip.
     */
    resolve(sourceUrl: string, platform: PlatformEntry): Promise<Resolution> {
        const key = canonicalUrlKey(sourceUrl);

        const cached = this.peek(sourceUrl);
        if (cached) return Promise.resolve(cached);

        const existing = this.inflight.get(key);
        if (existing) return existing;

        const pending = this.runResolve(key, sourceUrl, platform)
            .finally(() => {
                this.inflight.delete(key);
            });

        this.inflight.set(key, pending);
        return pending;
    }

    private async runResolve(key: string, sourceUrl: string, platform: PlatformEntry): Promise<Resolution> {
        const attempts: ProviderAttempt[] = [];
        const sourceHosts = platform.domains;

        const candidates = platform.providers;
        if (candidates.length === 0) {
            return this.store(this.emptyResolution(key, sourceUrl, platform.id, attempts));
        }

        const healthy = candidates.filter(provider => !this.isCooling(provider.domain));
        // Everything is on cooldown — try anyway rather than silently doing
        // nothing, but only the highest-priority one, to keep the cost bounded.
        const order = healthy.length > 0 ? healthy : candidates.slice(0, 1);

        for (const provider of candidates) {
            if (!order.includes(provider)) {
                attempts.push({ domain: provider.domain, score: EmbedScore.NONE, skipped: "cooldown" });
            }
        }

        interface Pick { provider: ProviderDef; meta: EmbedMeta; score: number }

        /** Record the attempt, update domain health, and return a pick if usable. */
        const consider = (provider: ProviderDef, meta: EmbedMeta): Pick | null => {
            const score = scoreEmbedMeta(meta);
            attempts.push({
                domain: provider.domain,
                score,
                ...(meta.error ? { error: meta.error } : {}),
                ...(meta.softError ? { softError: meta.softError } : {}),
            });

            if (meta.error) {
                this.noteFailure(provider.domain);
                return null;
            }

            if (meta.softError) {
                // The provider answered, so it is alive: this one link is
                // unsupported and the domain keeps its clean record. But a
                // provider that says this about every link is useless.
                this.noteSoftError(provider.domain);
                return null;
            }

            this.noteSuccess(provider.domain);
            if (score <= EmbedScore.NONE) return null;

            return { provider, meta, score };
        };

        const picks: Pick[] = [];

        if (this.parallel) {
            const results = await Promise.all(order.map(async provider => {
                const meta = await this.safeProbe(provider, sourceUrl, sourceHosts);
                return { provider, meta };
            }));
            // Applied in priority order, so equal scores keep the user's ranking.
            for (const { provider, meta } of results) {
                const pick = consider(provider, meta);
                if (pick) picks.push(pick);
            }
        } else {
            for (const provider of order) {
                const meta = await this.safeProbe(provider, sourceUrl, sourceHosts);
                const pick = consider(provider, meta);
                if (pick) picks.push(pick);
                // Good enough — no reason to keep asking.
                if (pick && pick.score >= GOOD_ENOUGH_SCORE) break;
            }
        }

        let best: Pick | null = null;
        for (const pick of picks) {
            if (!best || pick.score > best.score) best = pick;
        }

        if (!best) {
            this.log(`no provider could render ${sourceUrl}`);
            return this.store(this.emptyResolution(key, sourceUrl, platform.id, attempts));
        }

        const winner: Pick = best;
        return this.store({
            key,
            sourceUrl,
            platformId: platform.id,
            providerDomain: winner.provider.domain,
            providerUrl: winner.meta.url,
            meta: winner.meta,
            score: winner.score,
            resolvedAt: this.now(),
            attempts,
        });
    }

    private async safeProbe(provider: ProviderDef, sourceUrl: string, sourceHosts: string[]): Promise<EmbedMeta> {
        const providerUrl = rewriteUrl(sourceUrl, provider.domain);
        try {
            const meta = await this.probe(providerUrl, sourceHosts);
            // Guard against a probe implementation returning a different url.
            return { ...meta, url: providerUrl };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return {
                url: providerUrl,
                finalUrl: providerUrl,
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
                error: message || "probe threw",
            };
        }
    }

    private emptyResolution(key: string, sourceUrl: string, platformId: string, attempts: ProviderAttempt[]): Resolution {
        return {
            key,
            sourceUrl,
            platformId,
            providerDomain: null,
            providerUrl: null,
            meta: null,
            score: EmbedScore.NONE,
            resolvedAt: this.now(),
            attempts,
        };
    }

    private store(resolution: Resolution): Resolution {
        this.resolutions.set(resolution.key, resolution);
        this.evict();
        this.onPersist();
        return resolution;
    }

    private evict(): void {
        if (this.resolutions.size <= this.maxEntries) return;

        const sorted = [...this.resolutions.values()].sort((a, b) => a.resolvedAt - b.resolvedAt);
        const excess = this.resolutions.size - this.maxEntries;
        for (let i = 0; i < excess; i++) {
            this.resolutions.delete(sorted[i].key);
        }
    }

    // --- Domain health ------------------------------------------------------

    isCooling(domain: string): boolean {
        const entry = this.health.get(domain);
        return !!entry && entry.cooldownUntil > this.now();
    }

    getHealth(domain: string): DomainHealth {
        let entry = this.health.get(domain);
        if (!entry) {
            entry = { domain, failures: 0, successes: 0, softStreak: 0, lastFailureAt: 0, cooldownUntil: 0 };
            this.health.set(domain, entry);
        }
        return entry;
    }

    /**
     * A soft error for one link. Harmless on its own — only a long streak of
     * them, with no success in between, benches the domain.
     */
    private noteSoftError(domain: string): void {
        const entry = this.getHealth(domain);
        entry.softStreak += 1;

        if (entry.softStreak >= this.softStreakThreshold) {
            const steps = entry.softStreak - this.softStreakThreshold;
            const backoff = Math.min(this.cooldownBaseMs * 2 ** steps, this.cooldownMaxMs);
            entry.cooldownUntil = this.now() + backoff;
            this.log(`${domain} benched for ${Math.round(backoff / 1000)}s — ${entry.softStreak} links in a row returned nothing`);
        }
    }

    private noteFailure(domain: string): void {
        const entry = this.getHealth(domain);
        entry.failures += 1;
        entry.lastFailureAt = this.now();

        if (entry.failures >= this.failureThreshold) {
            const steps = entry.failures - this.failureThreshold;
            const backoff = Math.min(this.cooldownBaseMs * 2 ** steps, this.cooldownMaxMs);
            entry.cooldownUntil = this.now() + backoff;
            this.log(`${domain} on cooldown for ${Math.round(backoff / 1000)}s after ${entry.failures} failures`);
        }
    }

    private noteSuccess(domain: string): void {
        const entry = this.getHealth(domain);
        entry.successes += 1;
        entry.failures = 0;
        entry.softStreak = 0;
        entry.cooldownUntil = 0;
    }

    // --- Invalidation & persistence ----------------------------------------

    /** Drop the cached answer for one link so the next resolve re-probes it. */
    invalidate(sourceUrl: string): void {
        const key = canonicalUrlKey(sourceUrl);
        if (this.resolutions.delete(key)) this.onPersist();
    }

    /** Drop every cached answer and clear all cooldowns. */
    flush(): void {
        this.resolutions.clear();
        this.health.clear();
        this.onPersist();
    }

    /** Clear cooldowns only — used by the "re-check providers" button. */
    clearCooldowns(): void {
        for (const entry of this.health.values()) {
            entry.failures = 0;
            entry.softStreak = 0;
            entry.cooldownUntil = 0;
        }
        this.onPersist();
    }

    stats(): { resolutions: number; health: DomainHealth[] } {
        return {
            resolutions: this.resolutions.size,
            health: [...this.health.values()],
        };
    }

    serialize(): string {
        const payload: SerializedResolver = {
            v: 2,
            resolutions: [...this.resolutions.values()],
            health: [...this.health.values()],
        };
        return JSON.stringify(payload);
    }

    restore(json: string | null | undefined): void {
        if (!json?.trim()) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            return;
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        const payload = parsed as Partial<SerializedResolver>;
        if (payload.v !== 2) return; // older cache formats are simply dropped

        if (Array.isArray(payload.resolutions)) {
            for (const entry of payload.resolutions) {
                if (isResolutionShape(entry)) this.resolutions.set(entry.key, entry);
            }
        }
        if (Array.isArray(payload.health)) {
            for (const entry of payload.health) {
                if (entry && typeof entry.domain === "string") {
                    this.health.set(entry.domain, {
                        domain: entry.domain,
                        failures: numberOr(entry.failures, 0),
                        successes: numberOr(entry.successes, 0),
                        softStreak: numberOr(entry.softStreak, 0),
                        lastFailureAt: numberOr(entry.lastFailureAt, 0),
                        cooldownUntil: numberOr(entry.cooldownUntil, 0),
                    });
                }
            }
        }
        this.evict();
    }
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isResolutionShape(value: unknown): value is Resolution {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    return typeof entry.key === "string"
        && typeof entry.sourceUrl === "string"
        && typeof entry.platformId === "string"
        && typeof entry.resolvedAt === "number"
        && (entry.providerDomain === null || typeof entry.providerDomain === "string");
}
